// Supabase Edge Function: admin-users
// CEO-only staff account management (create / ban / unban / set_password).
// Uses the service-role key, which exists only inside the function runtime
// (SUPABASE_SERVICE_ROLE_KEY is injected by Supabase; never ship it to the browser).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ROLES = ['ceo', 'ops_manager', 'manager', 'front_desk', 'housekeeping']
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // who is calling?
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(token)
  if (!caller?.user) return json({ error: 'Not signed in' }, 401)
  const { data: me } = await admin.from('profiles').select('id, role, active, full_name').eq('id', caller.user.id).single()
  if (!me || !me.active || me.role !== 'ceo') return json({ error: 'Only the CEO / GM can manage staff accounts.' }, 403)

  let body: Record<string, string>
  try { body = await req.json() } catch { return json({ error: 'Bad JSON' }, 400) }

  const audit = (entityId: string, action: string, after: unknown) =>
    admin.from('audit_log').insert({ user_id: me.id, user_name: me.full_name, entity: 'auth_users', entity_id: entityId, action: 'update', reason: action, before: null, after })

  try {
    switch (body.action) {
      case 'create': {
        const username = String(body.username ?? '').trim().toLowerCase()
        if (!/^[a-z0-9._-]{3,32}$/.test(username)) return json({ error: 'Username: 3–32 letters, numbers, . _ -' }, 400)
        if (!ROLES.includes(body.role)) return json({ error: 'Unknown role' }, 400)
        if (String(body.password ?? '').length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
        if (!String(body.fullName ?? '').trim()) return json({ error: 'Full name is required' }, 400)
        const { data: created, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true, user_metadata: { username } })
        if (error || !created.user) return json({ error: error?.message ?? 'Could not create login' }, 400)
        const { data: profile, error: pErr } = await admin.from('profiles')
          .insert({ id: created.user.id, username, full_name: String(body.fullName).trim(), role: body.role, change_reason: `Created by ${me.full_name}` })
          .select().single()
        if (pErr) {
          await admin.auth.admin.updateUserById(created.user.id, { ban_duration: '876000h' }) // never delete; disable the orphan login
          return json({ error: pErr.message }, 400)
        }
        return json({ profile })
      }
      case 'ban':
      case 'unban': {
        if (body.userId === me.id) return json({ error: 'You cannot disable your own login.' }, 400)
        const { error } = await admin.auth.admin.updateUserById(body.userId, { ban_duration: body.action === 'ban' ? '876000h' : 'none' })
        if (error) return json({ error: error.message }, 400)
        if (body.action === 'ban') await admin.auth.admin.signOut(body.userId).catch(() => undefined)
        await audit(body.userId, body.action, { banned: body.action === 'ban' })
        return json({ ok: true })
      }
      case 'set_password': {
        if (String(body.password ?? '').length < 8) return json({ error: 'Password must be at least 8 characters' }, 400)
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password: body.password })
        if (error) return json({ error: error.message }, 400)
        await audit(body.userId, 'set_password', { passwordChanged: true }) // never log the password itself
        return json({ ok: true })
      }
      default:
        return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
