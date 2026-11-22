import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
// Accept either name; Supabase calls it "publishable" (new) or "anon" (legacy).
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

if (!supabaseConfigured) {
  console.error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY tidak ada saat build. Login tidak akan berfungsi.',
  );
}

// Placeholder values keep the app rendering when env vars are missing;
// auth functions check `supabaseConfigured` and show a readable error instead.
export const supabase = createClient(url || 'https://missing-env.supabase.co', key || 'missing-key');
