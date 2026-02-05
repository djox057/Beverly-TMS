import { createClient } from "npm:@supabase/supabase-js@2.49.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Decode JWT payload without verification (we'll verify via admin API)
function decodeJwtPayload(token: string): { sub?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1]))
    return payload
  } catch {
    return null
  }
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
    
    // Decode JWT to get user ID
    const payload = decodeJwtPayload(token)
    if (!payload?.sub) {
      throw new Error('Invalid token format')
    }
    
    const userId = payload.sub
    console.log('Decoded user ID from token:', userId)

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

    // Verify user exists using admin API
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
    
    if (userError || !userData?.user) {
      console.error('User verification error:', userError)
      throw new Error('Invalid or expired token')
    }

    console.log('User verified:', userData.user.email)

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
    const { userId: targetUserId, role, office, fullName, ext } = await req.json()

    console.log('Request body:', { targetUserId, role, office, fullName, ext })

    if (!targetUserId || !role) {
      throw new Error('Invalid request. userId and role are required.')
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'afterhours', 'driver', 'accounting', 'maintenance', 'chicago_management', 'yard']
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
      const validOffices = ['Čačak', 'KRAGUJEVAC', 'BEOGRAD', 'Recovery']
      profileUpdates.office = office === null || office === '' ? null : (validOffices.includes(office) ? office : null)
    }
    
    if (ext !== undefined) {
      profileUpdates.ext = ext === null || ext === '' ? null : ext
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
