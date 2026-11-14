import { createClient } from '@supabase/supabase-js'

// Valori pubblici. NON inserire mai qui la chiave "secret" o "service_role".
const SUPABASE_URL = 'https://mxvwziqwaylduftmisen.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_320wzoEmYP9cx8NDbkFPXw_KE4EXsXT'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
