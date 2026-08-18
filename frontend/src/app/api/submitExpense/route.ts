import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DuplicateDetector } from '@/lib/duplicate-detector';



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

    const { organisationId, expenseId } = await req.json();

    if (!organisationId || !expenseId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if expense exists and belongs to the user
    const { data: expense } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', expenseId)
      .eq('organisation_id', organisationId)
      .single();

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Only the submitter can submit their own expense (or super admin)
    const isSuper = await isSuperAdmin(supabase, user.id);
    if (expense.submitted_by !== user.id && !isSuper) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Run duplicate detection
    const dupResult = await DuplicateDetector.checkDuplicates(supabase, {
      organisationId,
      submittedBy: expense.submitted_by,
      amount: expense.amount,
      currency: expense.currency,
      expenseDate: expense.expense_date,
      merchant: expense.merchant,
      receiptChecksum: expense.receipt?.checksum,
      currentExpenseId: expenseId
    });

    const duplicateWarning = {
      isDuplicate: dupResult.isDuplicate,
      matchingExpenseId: dupResult.matchingExpenseId,
      matchedOn: dupResult.matchedSignals
    };

    // Update the status to SUBMITTED and attach duplicate warning
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ 
        status: 'SUBMITTED', 
        updated_at: new Date().toISOString(),
        duplicate_warning: duplicateWarning
      })
      .eq('id', expenseId)
      .eq('organisation_id', organisationId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ data: { success: true, status: 'SUBMITTED' } });

  } catch (error: any) {
    console.error('submitExpense API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

async function isSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from('users').select('is_super_admin').eq('id', userId).single();
  return data?.is_super_admin;
}
