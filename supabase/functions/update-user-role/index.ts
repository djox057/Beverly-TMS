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
      throw new Error('No authorization header');
    }

    // Create a Supabase client with the Auth context of the user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the user making the request
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if the requesting user has admin or accounting role
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      throw new Error('Failed to verify permissions');
    }

    const hasAdminOrAccounting = userRoles?.some(
      (r) => r.role === 'admin' || r.role === 'accounting'
    );

    if (!hasAdminOrAccounting) {
      throw new Error('Insufficient permissions. Admin or Accounting role required.');
    }

    // Get request body
    const { userId, roles } = await req.json();

    if (!userId || !roles || !Array.isArray(roles)) {
      throw new Error('Invalid request. userId and roles array are required.');
    }

    // Validate roles
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'driver', 'accounting'];
    const invalidRoles = roles.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}`);
    }

    // Use service role client for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delete existing roles for the user
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting existing roles:', deleteError);
      throw new Error('Failed to update roles');
    }

    // Insert new roles
    if (roles.length > 0) {
      const roleInserts = roles.map(role => ({
        user_id: userId,
        role: role,
      }));

      const { error: insertError } = await supabaseAdmin
        .from('user_roles')
        .insert(roleInserts);

      if (insertError) {
        console.error('Error inserting new roles:', insertError);
        throw new Error('Failed to insert new roles');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User roles updated successfully',
        roles 
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
