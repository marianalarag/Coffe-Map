import { supabase } from '../supabase';

export const GOOGLE_USAGE_TYPES = {
  MAP_LOAD: 'maps_dynamic_loads',
  PLACES_TEXT_SEARCH: 'places_text_search_requests',
};

export const GOOGLE_USAGE_LABELS = {
  [GOOGLE_USAGE_TYPES.MAP_LOAD]: 'Cargas de mapa',
  [GOOGLE_USAGE_TYPES.PLACES_TEXT_SEARCH]: 'Consultas Places Text Search',
};

const toLimit = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const GOOGLE_USAGE_LIMITS = {
  [GOOGLE_USAGE_TYPES.MAP_LOAD]: toLimit(import.meta.env.VITE_GOOGLE_MAPS_MONTHLY_LOAD_LIMIT, 25),
  [GOOGLE_USAGE_TYPES.PLACES_TEXT_SEARCH]: toLimit(import.meta.env.VITE_GOOGLE_PLACES_MONTHLY_TEXT_SEARCH_LIMIT, 3),
};

export const getGoogleUsagePeriod = () => new Date().toISOString().slice(0, 7);

const normalizeUsageRow = (row) => ({
  period: row.period,
  usageKey: row.usage_key,
  used: Number(row.used_count) || 0,
  limit: GOOGLE_USAGE_LIMITS[row.usage_key] ?? 0,
});

export async function getGoogleUsageSummary() {
  const period = getGoogleUsagePeriod();
  const { data, error } = await supabase
    .from('google_api_usage_monthly')
    .select('period,usage_key,used_count')
    .eq('period', period);

  if (error) {
    throw error;
  }

  const rowsByKey = new Map((data || []).map((row) => [row.usage_key, normalizeUsageRow(row)]));

  return Object.values(GOOGLE_USAGE_TYPES).map((usageKey) => (
    rowsByKey.get(usageKey) || {
      period,
      usageKey,
      used: 0,
      limit: GOOGLE_USAGE_LIMITS[usageKey] ?? 0,
      remaining: GOOGLE_USAGE_LIMITS[usageKey] ?? 0,
    }
  ));
}

export async function reserveGoogleUsage(usageKey, amount = 1) {
  const limit = GOOGLE_USAGE_LIMITS[usageKey] ?? 0;
  const period = getGoogleUsagePeriod();

  const { data, error } = await supabase.rpc('reserve_google_api_usage', {
    p_period: period,
    p_usage_key: usageKey,
    p_amount: amount,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`No se pudo leer el medidor de Google. Revisa que ya corriste el SQL de uso. ${error.message}`);
  }

  return {
    allowed: Boolean(data?.allowed),
    period: data?.period || period,
    usageKey: data?.usage_key || usageKey,
    used: Number(data?.used_count) || 0,
    limit: Number(data?.limit_count) || limit,
    remaining: Math.max((Number(data?.limit_count) || limit) - (Number(data?.used_count) || 0), 0),
  };
}
