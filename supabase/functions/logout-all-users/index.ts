import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🔐 Logging off all users...');

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin or accounting role
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError || !roles) {
      throw new Error('Failed to fetch user roles');
    }

    const hasAdminAccess = roles.some(r => r.role === 'admin' || r.role === 'accounting');
    if (!hasAdminAccess) {
      throw new Error('Insufficient permissions');
    }

    // Get all users
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch users');
    }

    console.log(`📋 Found ${users.length} users to log off`);

    // Sign out all users by clearing their sessions
    let successCount = 0;
    let errorCount = 0;

    for (const targetUser of users) {
      try {
        // Sign out user from all devices
        const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUser.id);
        
        if (signOutError) {
          console.error(`Failed to sign out user ${targetUser.email}:`, signOutError);
          errorCount++;
        } else {
          console.log(`✅ Signed out user: ${targetUser.email}`);
          successCount++;
        }
      } catch (err) {
        console.error(`Error signing out user ${targetUser.email}:`, err);
        errorCount++;
      }
    }

    console.log(`✅ Logout complete: ${successCount} succeeded, ${errorCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Logged off ${successCount} users${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        successCount,
        errorCount
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error in logout-all-users function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to log off users',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
