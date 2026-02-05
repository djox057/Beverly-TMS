import { createClient } from "npm:@supabase/supabase-js@2.49.1"

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header')
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')

    // Verify requester via anon client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token)

    if (userError) {
      console.error('Token verification error:', userError)
      throw new Error(`Invalid token: ${userError.message}`)
    }

    if (!user) {
      console.error('No user found in token')
      throw new Error('No user found in token')
    }

    console.log('Authenticated user:', user.id)

    // Privileged operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    // Require admin role
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

    const { userId } = await req.json()

    if (!userId) {
      console.error('No userId provided in request body')
      throw new Error('User ID is required')
    }

    console.log('Attempting to delete user:', userId)

    // 1) Clear foreign-key references that can block deletion
    const nullifyRefs = [
      // References to profiles(user_id)
      { table: 'recovery_history', column: 'original_dispatcher_id', patch: { original_dispatcher_id: null } },
      { table: 'recovery_history', column: 'reverted_by', patch: { reverted_by: null } },
      { table: 'truck_note_history', column: 'edited_by', patch: { edited_by: null } },
      { table: 'trucks', column: 'dispatcher_id', patch: { dispatcher_id: null } },

      // References to auth.users(id) without ON DELETE SET NULL
      { table: 'hos_requests', column: 'requester_user_id', patch: { requester_user_id: null } },
      { table: 'trailer_termination_notes', column: 'created_by', patch: { created_by: null } },
      { table: 'truck_termination_notes', column: 'created_by', patch: { created_by: null } },

      // (kept for backwards compatibility if column exists)
      { table: 'recovery_history', column: 'new_dispatcher_id', patch: { new_dispatcher_id: null } },
    ] as const

    for (const ref of nullifyRefs) {
      try {
        const { error } = await supabaseAdmin
          .from(ref.table)
          // @ts-ignore - patch objects vary by table
          .update(ref.patch)
          .eq(ref.column, userId)

        if (error) {
          console.error(`Error nullifying ${ref.table}.${ref.column}:`, error)
        } else {
          console.log(`Nullified ${ref.table}.${ref.column} references`) 
        }
      } catch (e) {
        console.error(`Exception nullifying ${ref.table}.${ref.column}:`, e)
      }
    }

    // 2) Remove app-side records (best-effort)
    const { error: rolesDeleteError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    if (rolesDeleteError) {
      console.error('Error deleting user roles:', rolesDeleteError)
    } else {
      console.log('User roles deleted successfully')
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId)

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError)
    } else {
      console.log('Profile deleted successfully')
    }

    // 3) Finally delete from auth
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting user from auth:', deleteError)
      throw deleteError
    }

    console.log('User deleted successfully from auth.users:', userId)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error deleting user:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
