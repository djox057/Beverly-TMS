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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Extract the JWT token from the header
    const token = authHeader.replace('Bearer ', '')
    
    // Create a Supabase client with anon key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the user token by passing it directly
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError) {
      console.error('Token verification error:', userError)
      throw new Error(`Invalid token: ${userError.message}`)
    }
    
    if (!user) {
      throw new Error('No user found in token')
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Check if user has admin role using user_roles table
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single()

    if (!userRole) {
      throw new Error('Unauthorized: Admin role required')
    }

    // Get request body
    const { userId, role } = await req.json();

    if (!userId || !role) {
      throw new Error('Invalid request. userId and role are required.');
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'afterhours', 'driver', 'accounting', 'maintenance', 'chicago_management', 'yard'];
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
