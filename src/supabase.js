import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey);

if (!hasSupabaseConfig) {
  console.error(
    'Faltan variables de Supabase. Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env o Vercel.',
  );
}

export const supabaseConfig = {
  hasSupabaseConfig,
  hasSupabaseUrl: Boolean(supabaseUrl),
  hasSupabaseKey: Boolean(supabasePublishableKey),
};

const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    return '';
  }
})();

export const clearLocalSupabaseSession = () => {
  if (!projectRef) return;

  const storageKey = `sb-${projectRef}-auth-token`;
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(`${storageKey}-code-verifier`);
  window.localStorage.removeItem(`${storageKey}-user`);
};

export const supabase = createClient(
  supabaseUrl || 'https://missing-supabase-url.supabase.co',
  supabasePublishableKey || 'missing-supabase-key',
);
