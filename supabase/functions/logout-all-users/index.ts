import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
    
    // Validate token and get user securely
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Invalid token or unauthorized');
    }
    
    const userId = user.id;
    console.log(`✓ User ID from token: ${userId}`);

    // Check if user has admin or accounting role
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (rolesError) {
      console.error('Roles error:', rolesError);
      throw new Error(`Failed to fetch user roles: ${rolesError.message}`);
    }
    
    if (!roles) {
      throw new Error('No roles found for user');
    }
    
    console.log(`✓ User roles:`, roles.map(r => r.role).join(', '));

    const hasAdminAccess = roles.some(r => r.role === 'admin' || r.role === 'accounting');
    if (!hasAdminAccess) {
      throw new Error('Insufficient permissions - requires admin or accounting role');
    }

    // Get all users
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching users:', usersError);
      throw new Error('Failed to fetch users');
    }

    console.log(`📋 Found ${users.length} users to log off`);

    // Call the database function to sign out all users
    const { data: result, error: signOutError } = await supabaseAdmin
      .rpc('sign_out_all_users');

    if (signOutError) {
      console.error('❌ Error signing out users:', signOutError);
      throw signOutError;
    }

    console.log(`✅ Logout complete: ${result.sessions_deleted} sessions deleted, ${result.tokens_deleted} refresh tokens deleted`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Logged off all users (${result.sessions_deleted} sessions + ${result.tokens_deleted} refresh tokens deleted)`,
        sessionsDeleted: result.sessions_deleted,
        tokensDeleted: result.tokens_deleted
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Error in logout-all-users function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to log off users';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
