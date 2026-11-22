import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY belum di-set. Login tidak akan berfungsi.',
  );
}

// Placeholder values keep the app rendering when env vars are missing;
// auth calls will then fail with a readable error instead of a blank page.
export const supabase = createClient(url || 'https://missing-env.supabase.co', key || 'missing-key');
