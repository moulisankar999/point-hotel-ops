import { DemoStore } from './demoStore'
import { SupabaseStore } from './supabaseStore'
import type { Store } from './store'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const store: Store = url && key ? new SupabaseStore(url, key, import.meta.env.VITE_AUTH_EMAIL_DOMAIN as string | undefined) : new DemoStore()
export const isDemo = store.mode === 'demo'
