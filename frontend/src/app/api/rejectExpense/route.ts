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

    const { organisationId, expenseId, reason } = await req.json();

    if (!organisationId || !expenseId || !reason) {
      return NextResponse.json({ error: 'Missing required fields. A rejection reason is mandatory.' }, { status: 400 });
    }

    // Verify user role
    const { data: memberData } = await supabase
      .from('members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organisation_id', organisationId)
      .maybeSingle();

    const isSuper = await isSuperAdmin(supabase, user.id);
    const role = isSuper ? 'ADMIN' : (memberData?.role || 'MEMBER');

    if (!['ADMIN', 'FINANCE', 'REVIEWER'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden. You do not have permission to reject.' }, { status: 403 });
    }

    // Check if expense exists
    const { data: expense } = await supabase
      .from('expenses')
      .select('status, submitted_by')
      .eq('id', expenseId)
      .eq('organisation_id', organisationId)
      .single();

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Validate state transition
    const allowedStatuses = ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'];
    if (!allowedStatuses.includes(expense.status)) {
      return NextResponse.json({ error: `Cannot reject from state: ${expense.status}` }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Update the status to REJECTED
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ 
        status: 'REJECTED', 
        updated_at: now 
      })
      .eq('id', expenseId)
      .eq('organisation_id', organisationId);

    if (updateError) throw updateError;

    // Record audit log
    await supabase.from('audit_logs').insert({
      organisation_id: organisationId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'EXPENSE_REJECTED',
      entity_type: 'EXPENSE',
      entity_id: expenseId,
      before_data: { status: expense.status },
      after_data: { status: 'REJECTED', reason, rejectedBy: user.id }
    });

    return NextResponse.json({ data: { success: true, status: 'REJECTED' } });

  } catch (error: any) {
    console.error('rejectExpense API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).maybeSingle();
  return data?.is_super_admin;
}
