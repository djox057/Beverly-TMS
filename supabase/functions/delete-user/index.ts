import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('Delete user function called')
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header')
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
      console.error('No user found in token')
      throw new Error('No user found in token')
    }

    console.log('Authenticated user:', user.id)

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
      console.error('User does not have admin role')
      throw new Error('Unauthorized: Admin role required')
    }

    console.log('User has admin role')

    // Get user ID to delete from request body
    const { userId } = await req.json()
    
    if (!userId) {
      console.error('No userId provided in request body')
      throw new Error('User ID is required')
    }

    console.log('Attempting to delete user:', userId)

    // First delete related records that might prevent deletion
    // Delete from profiles table
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId)

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError)
      // Continue anyway - profile might not exist
    } else {
      console.log('Profile deleted successfully')
    }

    // Delete from user_roles table
    const { error: rolesDeleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    if (rolesDeleteError) {
      console.error('Error deleting user roles:', rolesDeleteError)
      // Continue anyway - roles might not exist
    } else {
      console.log('User roles deleted successfully')
    }

    // Delete the user from auth.users using admin client
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError)
      throw deleteError
    }

    console.log('User deleted successfully from auth.users:', userId)

    return new Response(
      JSON.stringify({ success: true }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error deleting user:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})
