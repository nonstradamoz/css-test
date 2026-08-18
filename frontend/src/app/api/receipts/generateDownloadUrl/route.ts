import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStorageProvider } from '@/lib/storage.service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
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

    const { organisationId, expenseId } = await req.json();

    if (!organisationId || !expenseId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is part of org or super admin
    const { data: memberData } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organisation_id', organisationId)
      .single();

    if (!memberData && !(await isSuperAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the receipt metadata
    const { data: expense } = await supabase
      .from('expenses')
      .select('receipt')
      .eq('id', expenseId)
      .eq('organisation_id', organisationId)
      .single();

    if (!expense || !expense.receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    const receipt = expense.receipt;

    const storageProvider = getStorageProvider();
    const downloadUrl = await storageProvider.generateDownloadUrl(receipt.storageKey);

    return NextResponse.json({ 
      data: { 
        downloadUrl,
        fileName: receipt.fileName,
        contentType: receipt.contentType
      } 
    });

  } catch (error: any) {
    console.error('generateDownloadUrl API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).single();
  return data?.is_super_admin;
}
