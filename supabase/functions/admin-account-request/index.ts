import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FUNCTION_VERSION = '2.5.3-admin-invite-2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let phase = 'startup'
  try {
    phase = 'environment'
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const siteUrl = Deno.env.get('TERYAQ_SITE_URL') ?? ''
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Function environment is incomplete')

    phase = 'authentication'
    const authorization = request.headers.get('Authorization') ?? ''
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !userData.user) throw new Error('Not authenticated')

    phase = 'admin-profile'
    const { data: idProfile, error: profileError } = await adminClient
      .from('profiles').select('id,email,role').eq('id', userData.user.id).maybeSingle()
    if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`)

    // Older installations can contain a legacy profile row keyed incorrectly.
    // The authenticated email comes from Supabase Auth itself, so an exact
    // email fallback remains tied to the verified signed-in identity.
    let profile = idProfile
    let normalizedRole = String(profile?.role ?? '').trim().toLowerCase()
    const signedInEmail = String(userData.user.email ?? '').trim().toLowerCase()
    if (normalizedRole !== 'admin' && signedInEmail) {
      const { data: emailProfiles, error: emailProfileError } = await adminClient
        .from('profiles').select('id,email,role').ilike('email', signedInEmail).limit(2)
      if (emailProfileError) throw new Error(`Email profile lookup failed: ${emailProfileError.message}`)
      const adminMatches = (emailProfiles ?? []).filter((candidate) =>
        String(candidate.role ?? '').trim().toLowerCase() === 'admin'
        && String(candidate.email ?? '').trim().toLowerCase() === signedInEmail
      )
      if (adminMatches.length === 1) profile = adminMatches[0]
      normalizedRole = String(profile?.role ?? '').trim().toLowerCase()
    }
    if (!profile || normalizedRole !== 'admin') {
      const identity = userData.user.email ?? userData.user.id
      throw new Error(`Admin access required for the signed-in account (${identity}; role: ${normalizedRole || 'missing'})`)
    }

    phase = 'request-body'
    const payload = await request.json()
    const requestId = String(payload.request_id ?? '')
    const action = String(payload.action ?? '')
    const decisionNote = String(payload.decision_note ?? '').slice(0, 2000)
    if (!requestId || !['approve', 'reject', 'resend'].includes(action)) {
      throw new Error('Invalid account-request action')
    }

    phase = 'load-request'
    const { data: accountRequest, error: requestError } = await adminClient
      .from('account_requests').select('*').eq('id', requestId).single()
    if (requestError || !accountRequest) throw new Error('Account request not found')

    if (action === 'reject') {
      phase = 'reject-request'
      if (!['pending', 'approved'].includes(accountRequest.status)) {
        throw new Error('Only a pending request can be rejected')
      }
      const { error } = await adminClient.from('account_requests').update({
        status: 'rejected', decision_note: decisionNote,
        decided_by: userData.user.id, decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', requestId)
      if (error) throw error
      await adminClient.from('audit_log').insert({
        actor_id: userData.user.id, event_type: 'account_request.rejected',
        entity_type: 'account_request', entity_id: requestId,
        metadata: { email: accountRequest.email, decision_note: decisionNote },
      })
      return json({ status: 'rejected', function_version: FUNCTION_VERSION })
    }

    if (!['pending', 'approved', 'invited'].includes(accountRequest.status)) {
      throw new Error('This request cannot be invited')
    }
    const inviteOptions: { data: Record<string, string>; redirectTo?: string } = {
      data: { name: accountRequest.requester_name, account_request_id: requestId },
    }
    if (siteUrl) inviteOptions.redirectTo = siteUrl
    phase = 'send-invite'
    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      accountRequest.email, inviteOptions,
    )
    if (inviteError) throw inviteError

    phase = 'update-request'
    const timestamp = new Date().toISOString()
    const { error: updateError } = await adminClient.from('account_requests').update({
      status: 'invited', decision_note: decisionNote,
      decided_by: userData.user.id, decided_at: accountRequest.decided_at ?? timestamp,
      invitation_sent_at: timestamp, activated_user_id: invite.user?.id ?? null,
      updated_at: timestamp,
    }).eq('id', requestId)
    if (updateError) throw updateError
    await adminClient.from('audit_log').insert({
      actor_id: userData.user.id,
      event_type: action === 'resend' ? 'account_request.invitation_resent' : 'account_request.approved',
      entity_type: 'account_request', entity_id: requestId,
      metadata: { email: accountRequest.email, decision_note: decisionNote },
    })
    return json({ status: 'invited', function_version: FUNCTION_VERSION })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json({ error: `${FUNCTION_VERSION} · ${phase}: ${message}` }, 400)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
