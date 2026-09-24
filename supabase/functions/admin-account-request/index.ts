import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const siteUrl = Deno.env.get('TERYAQ_SITE_URL') ?? ''
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Function environment is incomplete')

    const authorization = request.headers.get('Authorization') ?? ''
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !userData.user) throw new Error('Not authenticated')

    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('id,role').eq('id', userData.user.id).single()
    if (profileError || profile?.role !== 'admin') throw new Error('Admin access required')

    const payload = await request.json()
    const requestId = String(payload.request_id ?? '')
    const action = String(payload.action ?? '')
    const decisionNote = String(payload.decision_note ?? '').slice(0, 2000)
    if (!requestId || !['approve', 'reject', 'resend'].includes(action)) {
      throw new Error('Invalid account-request action')
    }

    const { data: accountRequest, error: requestError } = await adminClient
      .from('account_requests').select('*').eq('id', requestId).single()
    if (requestError || !accountRequest) throw new Error('Account request not found')

    if (action === 'reject') {
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
      return json({ status: 'rejected' })
    }

    if (!['pending', 'approved', 'invited'].includes(accountRequest.status)) {
      throw new Error('This request cannot be invited')
    }
    const inviteOptions: { data: Record<string, string>; redirectTo?: string } = {
      data: { name: accountRequest.requester_name, account_request_id: requestId },
    }
    if (siteUrl) inviteOptions.redirectTo = siteUrl
    const { data: invite, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      accountRequest.email, inviteOptions,
    )
    if (inviteError) throw inviteError

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
    return json({ status: 'invited' })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
