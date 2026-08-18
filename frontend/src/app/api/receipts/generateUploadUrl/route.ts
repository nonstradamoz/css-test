import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStorageProvider } from '@/lib/storage.service';



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

    const { organisationId, expenseId, fileName, contentType, fileSize, checksum } = await req.json();

    if (!organisationId || !expenseId || !fileName || !contentType || !fileSize || !checksum) {
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

    const receiptId = `receipt_${Date.now()}`;
    const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';
    const storageKey = `organisations/${organisationId}/expenses/${expenseId}/${receiptId}.${fileExt}`;

    const storageProvider = getStorageProvider();
    const uploadUrl = await storageProvider.generateUploadUrl(storageKey, contentType);

    return NextResponse.json({ 
      data: { 
        uploadUrl, 
        storageKey, 
        receiptId 
      } 
    });

  } catch (error: any) {
    console.error('generateUploadUrl API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).single();
  return data?.is_super_admin;
}
