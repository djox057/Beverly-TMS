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

    // Verify the JWT cryptographically by calling auth.getUser() with the user's token.
    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: userData, error: userError } = await supabaseAuthClient.auth.getUser()
    if (userError || !userData?.user) {
      console.error('Token verification error:', userError)
      throw new Error('Invalid or expired token')
    }
    const userId = userData.user.id
    console.log('User verified:', userData.user.email)

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
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single()

    console.log('Role check result:', userRole, roleError)

    if (!userRole) {
      throw new Error('Unauthorized: Admin role required')
    }

    // Get request body
    const { userId: targetUserId, role, office, fullName, ext, phoneNumber, grossPercent, cutPercent } = await req.json()

    console.log('Request body:', { targetUserId, role, office, fullName, ext })

    if (!targetUserId || !role) {
      throw new Error('Invalid request. userId and role are required.')
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'afterhours', 'driver', 'accounting', 'maintenance', 'chicago_management', 'yard', 'recruiting', 'claims']
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}`)
    }

    // Delete existing roles for the user
    const { error: deleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', targetUserId)

    if (deleteError) {
      console.error('Error deleting existing roles:', deleteError)
      throw new Error('Failed to update roles')
    }

    // Insert new role
    const { error: insertError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: targetUserId,
        role: role,
      })

    if (insertError) {
      console.error('Error inserting new role:', insertError)
      throw new Error('Failed to insert new role')
    }

    // Update profile (full_name, office, and/or ext) if provided
    const profileUpdates: Record<string, any> = {}
    
    if (fullName !== undefined) {
      profileUpdates.full_name = fullName
    }
    
    if (office !== undefined) {
      const validOffices = ['Čačak', 'KRAGUJEVAC', 'BG 1st floor', 'BG 4th floor', 'Recovery']
      const normalizedOffice = office === null || office === '' ? null : (validOffices.includes(office) ? office : null)
      profileUpdates.office = normalizedOffice
      console.log('Office normalization:', { received: office, normalized: normalizedOffice, validOffices })
    }
    
    if (ext !== undefined) {
      profileUpdates.ext = ext === null || ext === '' ? null : ext
    }

    if (phoneNumber !== undefined) {
      profileUpdates.phone_number = phoneNumber === null || phoneNumber === '' ? null : phoneNumber
    }

    // Gross % / Cut % only apply to dispatchers; clear for other roles
    if (role === 'dispatch') {
      if (grossPercent !== undefined) {
        profileUpdates.gross_percent = grossPercent === null || grossPercent === '' ? null : Number(grossPercent)
      }
      if (cutPercent !== undefined) {
        profileUpdates.cut_percent = cutPercent === null || cutPercent === '' ? null : Number(cutPercent)
      }
    } else {
      profileUpdates.gross_percent = null
      profileUpdates.cut_percent = null
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', targetUserId)
      
      if (profileError) {
        console.error('Error updating profile:', profileError)
        // Don't throw - role was updated successfully
      }
    }

    console.log('User role updated successfully')

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
    )
  } catch (error) {
    console.error('Error in update-user-role function:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
