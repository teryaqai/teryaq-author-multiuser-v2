import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
})

// No task writes: this function only mirrors one allowlisted task to Sheets.
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return response({ error: 'POST required' }, 405)
  try {
    const env = (key: string) => Deno.env.get(key) || ''
    const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const webhookHeader = request.headers.get('x-teryaq-webhook') || ''
    const webhookSecret = env('SHEETS_WEBHOOK_SECRET')
    const isWebhook = !!webhookHeader
    if (isWebhook) {
      if (webhookSecret.length < 32 || webhookHeader !== webhookSecret)
        return response({ error: 'Unauthorized webhook' }, 401)
    } else {
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
      const { data, error } = await client.auth.getUser(token)
      if (error || !data.user) return response({ error: 'Sign in required' }, 401)
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('role').eq('id', data.user.id).single()
      if (profileError || profile?.role !== 'admin') return response({ error: 'Admin only' }, 403)
    }
    const body = await request.json()
    const targetId = env('SHEETS_TEST_TASK_ID')
    const enabled = env('SHEETS_SYNC_ENABLED') === 'true'
    const endpoint = env('SHEETS_WEB_APP_URL')
    const syncToken = env('SHEETS_SYNC_TOKEN')
    const configured = !!targetId && !!syncToken && !!endpoint && webhookSecret.length >= 32
    if (!isWebhook && body.action === 'status')
      return response({ enabled, configured, taskId: targetId || null })
    if (!isWebhook && body.action !== 'sync') return response({ error: 'Unknown action' }, 400)
    if (!enabled) return response({ ok: false, skipped: 'disabled' })
    if (!configured) return response({ error: 'Complete the Sheets function secrets first' }, 503)
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(targetId))
      return response({ error: 'Invalid configured task ID' }, 503)
    if (isWebhook) {
      if (body.schema !== 'public' || body.table !== 'workflow_tasks' ||
          !['INSERT', 'UPDATE'].includes(body.type))
        return response({ error: 'Unsupported webhook event' }, 400)
      if (body.record?.id !== targetId) return response({ ok: true, skipped: 'outside-test-task' })
    }
    // Read the authoritative current record, never export caller-supplied fields.
    const observedAt = Date.now()
    const { data: task, error: taskError } = await client.from('workflow_tasks')
      .select('id,workflow_id,title,stage,status,owner_id,start_date,due_date,submitted_id,assignment_mode')
      .eq('id', targetId).single()
    if (taskError || !task) return response({ error: 'Configured task was not found' }, 404)
    const { data: flow, error: flowError } = await client.from('course_workflows')
      .select('course_id,chapter_id').eq('id', task.workflow_id).single()
    if (flowError || !flow) throw new Error('workflow')
    const [course, chapter, assignments, submission] = await Promise.all([
      client.from('content_subjects').select('name').eq('id', flow.course_id).single(),
      client.from('content_chapters').select('chapter_number,title').eq('id', flow.chapter_id).single(),
      client.from('workflow_task_executors').select('user_id').eq('task_id', task.id),
      task.submitted_id ? client.from('content_submissions').select('submitted_at')
        .eq('id', task.submitted_id).single() : Promise.resolve({ data: null, error: null }),
    ])
    if (course.error || chapter.error || assignments.error || submission.error) throw new Error('metadata')
    const ids = [...new Set([...(assignments.data || []).map(row => row.user_id), task.owner_id].filter(Boolean))]
    let executors = task.assignment_mode === 'course_team' ? 'Course team / فريق الكورس' : ''
    if (task.assignment_mode !== 'course_team' && ids.length) {
      const profiles = await client.from('profiles').select('display_name,member_code').in('id', ids)
      if (profiles.error) throw new Error('executors')
      executors = (profiles.data || []).map(p => `${p.display_name || 'Member'}${p.member_code ? ' — ' + p.member_code : ''}`).join('، ')
    }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))
      return response({ error: 'Use the deployed Google Apps Script /exec URL' }, 503)
    const result = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ token: syncToken, observedAt, task: {
        id: task.id, course: course.data?.name || '',
        chapter: `${chapter.data?.chapter_number || ''} — ${chapter.data?.title || ''}`,
        area: task.stage, name: task.title, executors, status: task.status,
        startDate: task.start_date || '', dueDate: task.due_date || '',
        submittedAt: submission.data?.submitted_at || '', url: env('TERYAQ_PUBLIC_URL'),
      } }),
    })
    if (!result.ok) throw new Error('delivery')
    const receipt = await result.json()
    if (receipt.ok !== true) throw new Error('receipt')
    return response({ ok: true, taskId: task.id, status: task.status, stale: !!receipt.stale })
  } catch {
    // Do not log request bodies, tokens, or remote responses.
    return response({ error: 'Sheets sync failed. Check setup, then use Send again. Task data is unchanged.' }, 502)
  }
})
