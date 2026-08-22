import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '@/lib/rate-limit';



export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  try {
    const ip = getClientIp(req);
    const rateLimitResult = rateLimit(`reimburse_${ip}`, 3, 60 * 1000); // Strict limit: 3 per minute
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: 'Too Many Requests' }, { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.reset.toString()
        }
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { organisationId, expenseId, idempotencyKey, forcedOutcome } = await req.json();

    if (!organisationId || !expenseId || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
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

    if (!['ADMIN', 'FINANCE'].includes(role)) {
      return NextResponse.json({ error: 'Forbidden. Only Finance or Admin can process reimbursements.' }, { status: 403 });
    }

    // Check if expense exists
    const { data: expense } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('organisation_id', organisationId)
      .single();

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Validate state transition
    const allowedStatuses = ['APPROVED', 'REFUND_FAILED'];
    if (!allowedStatuses.includes(expense.status)) {
      return NextResponse.json({ error: `Cannot reimburse from state: ${expense.status}` }, { status: 400 });
    }

    const now = new Date().toISOString();
    const reimbursementId = `reimb_${Date.now()}`;
    const outcome = forcedOutcome || 'SUCCESS';
    
    let reimbStatus = 'COMPLETED';
    let expenseStatus = 'REIMBURSED';
    let completedAt = null;
    let failedAt = null;
    let failureReason = null;
    let providerRef = null;

    if (outcome === 'SUCCESS') {
      reimbStatus = 'COMPLETED';
      expenseStatus = 'REIMBURSED';
      completedAt = now;
      providerRef = `MOCK_TXN_${Date.now()}`;
    } else if (outcome === 'TIMEOUT') {
      // Simulate gateway timeout (still processing)
      reimbStatus = 'PROCESSING';
      expenseStatus = 'REFUND_PENDING';
    } else {
      reimbStatus = 'FAILED';
      expenseStatus = 'REFUND_FAILED';
      failedAt = now;
      failureReason = 'Payment Gateway Rejected';
    }

    // Insert Reimbursement
    const { error: reimbError } = await supabase
      .from('reimbursements')
      .insert({
        id: reimbursementId,
        organisation_id: organisationId,
        expense_id: expenseId,
        submitted_by: user.id,
        amount: expense.amount,
        currency: expense.currency,
        status: reimbStatus,
        provider: 'MOCK_BANK',
        provider_reference: providerRef,
        failure_reason: failureReason,
        attempt_count: 1,
        max_attempts: 3,
        created_at: now,
        updated_at: now,
        completed_at: completedAt,
        failed_at: failedAt
      });

    if (reimbError) throw reimbError;

    // Update Expense Status
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ 
        status: expenseStatus, 
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
      action: 'REIMBURSEMENT_CREATED',
      entity_type: 'REIMBURSEMENT',
      entity_id: reimbursementId,
      before_data: { expenseStatus: expense.status },
      after_data: { expenseStatus, reimbursementStatus: reimbStatus, outcome }
    });

    return NextResponse.json({ 
      data: { 
        success: true, 
        reimbursementId,
        status: reimbStatus,
        expenseStatus,
        providerReference: providerRef
      } 
    });

  } catch (error: any) {
    console.error('createReimbursement API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).maybeSingle();
  return data?.is_super_admin;
}
