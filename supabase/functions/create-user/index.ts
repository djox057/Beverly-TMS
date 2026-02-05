import { createClient } from "npm:@supabase/supabase-js@2.49.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Extract the JWT token from the header
    const token = authHeader.replace('Bearer ', '')
    
    // Create a Supabase client with the user's auth header
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the user token using getClaims
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token)
    
    if (claimsError || !claimsData?.claims) {
      console.error('Token verification error:', claimsError)
      throw new Error(`Invalid token: ${claimsError?.message || 'No claims found'}`)
    }
    
    const userId = claimsData.claims.sub
    if (!userId) {
      throw new Error('No user ID found in token')
    }
    
    // Create a user object with the ID from claims
    const user = { id: userId }

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

    // Get user data from request body
    const { email, password, fullName, role, office, ext } = await req.json()
    
    if (!email || !password || !role) {
      throw new Error('Email, password, and role are required')
    }

    // Validate role
    const validRoles = ['dispatch', 'afterhours', 'admin', 'manager', 'driver', 'safety', 'supervisor', 'accounting', 'maintenance', 'chicago_management', 'yard']
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role')
    }

    // Create the user using admin client
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for admin-created users
      user_metadata: {
        full_name: fullName || email,
        role: role
      }
    })

    if (createError) {
      throw createError
    }

    // The handle_new_user trigger creates default 'dispatch' role, so we need to update it
    if (newUser?.user?.id && role !== 'dispatch') {
      // Update the role in user_roles table to the correct role
      const { error: roleUpdateError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: role })
        .eq('user_id', newUser.user.id)
      
      if (roleUpdateError) {
        console.error('Error updating role:', roleUpdateError)
        // If update fails, try delete + insert
        await supabaseAdmin
          .from('user_roles')
          .delete()
          .eq('user_id', newUser.user.id)
        
        await supabaseAdmin
          .from('user_roles')
          .insert({ user_id: newUser.user.id, role: role })
      }
    }

    // Update profile with office and ext if provided
    if ((office || ext) && newUser?.user?.id) {
      const profileUpdates: Record<string, any> = {}
      
      if (office) {
        const validOffices = ['Čačak', 'KRAGUJEVAC', 'BEOGRAD', 'Recovery']
        if (validOffices.includes(office)) {
          profileUpdates.office = office
        }
      }
      
      if (ext) {
        profileUpdates.ext = ext
      }
      
      if (Object.keys(profileUpdates).length > 0) {
        await supabaseAdmin
          .from('profiles')
          .update(profileUpdates)
          .eq('user_id', newUser.user.id)
      }
    }

    return new Response(
      JSON.stringify({ success: true, user: newUser }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error creating user:', error)
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
