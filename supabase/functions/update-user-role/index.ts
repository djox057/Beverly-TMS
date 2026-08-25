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
    const { userId: targetUserId, role, office, fullName, ext, phoneNumber, grossPercent, cutPercent, email } = await req.json()

    console.log('Request body:', { targetUserId, role, office, fullName, ext, email })

    if (!targetUserId || !role) {
      throw new Error('Invalid request. userId and role are required.')
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'supervisor', 'safety', 'dispatch', 'afterhours', 'driver', 'accounting', 'maintenance', 'chicago_management', 'yard', 'recruiting', 'claims']
    if (!validRoles.includes(role)) {
      throw new Error(`Invalid role: ${role}`)
    }

    // ---- Optional email change (auth + profile + login alias) ----
    let emailChangedTo: string | null = null
    if (typeof email === 'string' && email.trim() !== '') {
      const newEmail = email.trim().toLowerCase()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(newEmail)) {
        throw new Error('Invalid email address format')
      }

      // Read the target user's current auth email
      const { data: targetAuth, error: targetAuthError } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
      if (targetAuthError || !targetAuth?.user) {
        console.error('Error loading target auth user:', targetAuthError)
        throw new Error('Target user not found')
      }
      const oldEmail = (targetAuth.user.email || '').toLowerCase()

      if (oldEmail !== newEmail) {
        // Reject if the new email already belongs to another auth user
        const { data: existingProfile } = await supabaseAdmin
          .from('profiles')
          .select('user_id')
          .ilike('email', newEmail)
          .neq('user_id', targetUserId)
          .maybeSingle()
        if (existingProfile) {
          throw new Error('That email address is already used by another user')
        }

        // Reject if the new email is registered as somebody else's login alias
        const { data: conflictAlias } = await supabaseAdmin
          .from('user_email_aliases')
          .select('user_id')
          .ilike('alias_email', newEmail)
          .neq('user_id', targetUserId)
          .maybeSingle()
        if (conflictAlias) {
          throw new Error('That email address is already used as another user\'s login alias')
        }

        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          email: newEmail,
          email_confirm: true,
        })
        if (authUpdateError) {
          console.error('Error updating auth email:', authUpdateError)
          throw new Error(authUpdateError.message || 'Failed to update login email')
        }

        // Keep any existing aliases pointing at the new primary email
        const { error: repointError } = await supabaseAdmin
          .from('user_email_aliases')
          .update({ primary_email: newEmail })
          .eq('user_id', targetUserId)
        if (repointError) console.error('Error re-pointing aliases:', repointError)

        // Preserve the old address as a working login alias
        if (oldEmail) {
          const { error: aliasError } = await supabaseAdmin
            .from('user_email_aliases')
            .upsert(
              { user_id: targetUserId, alias_email: oldEmail, primary_email: newEmail, created_by: userId },
              { onConflict: 'alias_email' }
            )
          if (aliasError) console.error('Error creating login alias:', aliasError)
        }

        // Remove any alias that now equals the primary email
        await supabaseAdmin
          .from('user_email_aliases')
          .delete()
          .eq('user_id', targetUserId)
          .ilike('alias_email', newEmail)

        emailChangedTo = newEmail
      }
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

    if (emailChangedTo) {
      profileUpdates.email = emailChangedTo
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
        message: emailChangedTo
          ? `User updated. Email changed to ${emailChangedTo}; the previous address still works for login.`
          : 'User role updated successfully',
        role,
        emailChangedTo,
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
