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

    const { organisationId } = await req.json();

    if (!organisationId) {
      return NextResponse.json({ error: 'Organisation ID is required' }, { status: 400 });
    }

    // Verify user is a super admin
    const { data: userData } = await supabase
      .from('users')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!userData?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden: Only Super Admins can delete organisations' }, { status: 403 });
    }

    // Delete the organisation (Cascades to members, expenses, etc.)
    const { error: deleteError } = await supabase
      .from('organisations')
      .delete()
      .eq('id', organisationId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ data: { success: true } });

  } catch (error: any) {
    console.error('Delete Organisation API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
