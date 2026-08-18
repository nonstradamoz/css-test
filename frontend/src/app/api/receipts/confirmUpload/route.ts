import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';



export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organisationId, expenseId, receiptId, storageKey, fileName, contentType, fileSize, checksum } = await req.json();

    if (!organisationId || !expenseId || !receiptId || !storageKey || !fileName || !contentType || !fileSize || !checksum) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is part of org
    const { data: memberData } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organisation_id', organisationId)
      .single();

    if (!memberData && !(await isSuperAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Add receipt metadata to expense in Supabase
    const receiptData = {
      id: receiptId,
      organisationId,
      expenseId,
      storageProvider: process.env.CLOUDINARY_CLOUD_NAME ? 'cloudinary' : (process.env.AWS_ACCESS_KEY_ID ? 's3' : 'mock'),
      storageKey,
      fileName,
      contentType,
      fileSize,
      checksum,
      uploadedBy: user.id,
      createdAt: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt: receiptData })
      .eq('id', expenseId)
      .eq('organisation_id', organisationId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ data: { success: true } });

  } catch (error: any) {
    console.error('confirmUpload API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).single();
  return data?.is_super_admin;
}
