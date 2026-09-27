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
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Function environment is incomplete')

    const authorization = request.headers.get('Authorization') ?? ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !userData.user) throw new Error('Not authenticated')

    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('id,role').eq('id', userData.user.id).single()
    if (profileError || profile?.role !== 'admin') throw new Error('Admin access required')

    const payload = await request.json()
    const action = String(payload.action ?? '')
    if (action === 'purge_submission') {
      const submissionId = String(payload.submission_id ?? '')
      if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error('Invalid submission ID')
      const [{ data: submission, error: submissionError }, { data: config, error: configError }] = await Promise.all([
        adminClient.from('content_submissions').select('id,owner_id,deleted_at,files').eq('id', submissionId).single(),
        adminClient.from('system_config').select('value').eq('key', 'trash_retention_days').single(),
      ])
      if (submissionError || !submission) throw new Error('Submission not found')
      if (!submission.deleted_at) throw new Error('Only trashed submissions can be purged')
      if (configError) throw configError
      const retentionDays = Math.max(1, Number(config?.value ?? 30))
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString()
      if (Date.parse(submission.deleted_at) > Date.parse(cutoff)) throw new Error('Retention period has not expired')
      const prefix = `${submission.owner_id}/${submission.id}/`
      const paths = (Array.isArray(submission.files) ? submission.files : []).map((item) => String(item?.path ?? ''))
      if (paths.some((path) => !path.startsWith(prefix) || path.includes('..'))) throw new Error('Submission contains an invalid storage path')
      for (let start = 0; start < paths.length; start += 1000) {
        const { error } = await adminClient.storage.from('teryaq-submissions').remove(paths.slice(start, start + 1000))
        if (error) throw error
      }
      const { data: deleted, error: deleteError } = await adminClient.from('content_submissions')
        .delete().eq('id', submissionId).lt('deleted_at', cutoff).select('id').maybeSingle()
      if (deleteError) throw deleteError
      if (!deleted) throw new Error('The submission changed during deletion; refresh the trash')
      return json({ deleted: true, submission_id: submissionId })
    }
    const documentId = String(payload.document_id ?? '')
    if (action !== 'purge_document' || !documentId) throw new Error('Invalid governance action')

    const [{ data: document, error: documentError }, { data: config, error: configError }] = await Promise.all([
      adminClient.from('documents').select('id,deleted_at').eq('id', documentId).single(),
      adminClient.from('system_config').select('value').eq('key', 'trash_retention_days').single(),
    ])
    if (documentError || !document) throw new Error('Document not found')
    if (!document.deleted_at) throw new Error('Only deleted documents can be purged')
    if (configError) throw configError
    const retentionDays = Math.max(1, Number(config?.value ?? 30))
    if (Date.parse(document.deleted_at) > Date.now() - retentionDays * 86400000) {
      throw new Error('Retention period has not expired')
    }

    const { data: attachments, error: attachmentError } = await adminClient
      .from('attachments').select('storage_path').eq('document_id', documentId)
    if (attachmentError) throw attachmentError
    const paths = (attachments ?? []).map((row) => row.storage_path).filter(Boolean)
    for (let start = 0; start < paths.length; start += 1000) {
      const { error } = await adminClient.storage.from('teryaq-author').remove(paths.slice(start, start + 1000))
      if (error) throw error
    }

    const { data: result, error: purgeError } = await adminClient.rpc('admin_purge_document', {
      p_document_id: documentId,
      p_actor_id: userData.user.id,
    })
    if (purgeError) throw purgeError
    return json(result)
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
