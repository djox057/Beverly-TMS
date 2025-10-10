import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      throw new Error('No authorization header');
    }

    // Extract JWT token from Bearer token
    const token = authHeader.replace('Bearer ', '');
    console.log('Token received, length:', token.length);

    // Create a client with the user's token to verify authentication
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user's authentication
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

    // Use service role client for all operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (userError || !user) {
      console.error('Auth verification failed:', userError);
      throw new Error('Unauthorized');
    }

    console.log('User verified:', user.id);

    // Check if the requesting user has admin or accounting role
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Roles error:', rolesError);
      throw new Error('Failed to verify permissions');
    }

    const hasAdminOrAccounting = userRoles?.some(
      (r) => r.role === 'admin' || r.role === 'accounting'
    );

    if (!hasAdminOrAccounting) {
      throw new Error('Insufficient permissions. Admin or Accounting role required.');
    }

    // Get request body
    const { userId, role } = await req.json();

    if (!userId || !role) {
      throw new Error('Invalid request. userId and role are required.');
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'driver', 'accounting'];
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    // Delete existing roles for the user
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting existing roles:', deleteError);
      throw new Error('Failed to update roles');
    }

    // Insert new role
    const { error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: userId,
        role: role,
      });

    if (insertError) {
      console.error('Error inserting new role:', insertError);
      throw new Error('Failed to insert new role');
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User role updated successfully',
        role 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in update-user-role function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
