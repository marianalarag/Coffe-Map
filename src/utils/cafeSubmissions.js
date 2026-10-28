import { supabase } from '../supabase';

export const sendCafeSubmission = async (body, method = 'POST') => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Inicia sesión para continuar.');
  const response = await fetch('/api/cafe-submissions', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No pudimos guardar la cafetería. Tus datos se conservan.');
  return result;
};
