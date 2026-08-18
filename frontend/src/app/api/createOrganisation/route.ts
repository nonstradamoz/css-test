import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// We use the service role key to bypass RLS for administrative actions like creating orgs and assigning initial admin roles.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Note: We need this env var
);

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
    
    // Verify the user's token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, currency = 'USD' } = await req.json();

    if (!name) {
      return NextResponse.json({ error: 'Organisation name is required' }, { status: 400 });
    }

    const orgId = `org_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create organisation
    const { data: orgData, error: orgError } = await supabase
      .from('organisations')
      .insert({
        id: orgId,
        name,
        currency
      })
      .select()
      .single();

    if (orgError) {
      throw orgError;
    }

    // Add user as ADMIN
    const { error: memberError } = await supabase
      .from('members')
      .insert({
        user_id: user.id,
        organisation_id: orgId,
        role: 'ADMIN'
      });

    if (memberError) {
      throw memberError;
    }

    return NextResponse.json({
      data: {
        organisationId: orgId,
        organisation: orgData
      }
    });

  } catch (error: any) {
    console.error('Create Organisation API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
