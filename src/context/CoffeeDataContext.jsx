/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';
import { areDuplicateCafes, deduplicateCafes } from '../utils/cafeDeduplication';

const CoffeeDataContext = createContext(null);

const CAFES_CACHE_KEY = 'coffee-map:cafes:v5';
const CAFES_CACHE_TTL_MS = 15 * 60 * 1000;
const CAFE_REQUEST_TIMEOUT_MS = 8 * 1000;
const CAFE_COLUMNS = 'id,nombre,lat,lng,rating,reviews,link,address,neighborhood,category,image_url,image_source_url,image_attribution,image_license,source,source_id,source_url';
const INTERACTION_COLUMNS = 'id,user_id,cafe_id,is_visited,is_favorite,in_waitlist,rating,review_text,visited_on,updated_at';
const INTERACTION_WITH_CAFE_COLUMNS = `${INTERACTION_COLUMNS},cafe:cafes(${CAFE_COLUMNS})`;
// Change this version whenever a validated source scan is published so the next
// administrator session synchronizes only the newly discovered, unique cafes.
const ADMIN_SCAN_SYNC_KEY = 'coffee-map:admin-scan:2026-09-04-v2';

const withRequestTimeout = (request, timeoutMs, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => window.clearTimeout(timeoutId));
};

const toReviewPost = (interaction) => ({
  user_id: interaction.user_id,
  cafe_id: interaction.cafe_id,
  content: String(interaction.review_text || '').trim().slice(0, 1000),
  kind: 'review',
  rating: interaction.rating || null,
  visited_on: interaction.visited_on || null,
  interaction_id: interaction.id,
  status: 'published',
  updated_at: interaction.updated_at || new Date().toISOString(),
});

const normalizeCafe = (cafe) => ({
  ...cafe,
  lat: Number(cafe.lat),
  lng: Number(cafe.lng),
  pos: { lat: Number(cafe.lat), lng: Number(cafe.lng) },
  imageUrl: cafe.image_url || cafe.imageUrl || null,
  imageSourceUrl: cafe.image_source_url || cafe.imageSourceUrl || null,
  imageAttribution: cafe.image_attribution || cafe.imageAttribution || null,
  imageLicense: cafe.image_license || cafe.imageLicense || null,
  source: cafe.source || 'manual',
  sourceId: cafe.source_id || cafe.sourceId || null,
  sourceUrl: cafe.source_url || cafe.sourceUrl || null,
  address: cafe.address || null,
  neighborhood: cafe.neighborhood || null,
  category: cafe.category === 'panaderia' ? 'panaderia' : 'cafeteria',
});

const readCachedCafes = () => {
  try {
    const cached = window.sessionStorage.getItem(CAFES_CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CAFES_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(CAFES_CACHE_KEY);
      return null;
    }

    return Array.isArray(parsed.data) ? deduplicateCafes(parsed.data.map(normalizeCafe)) : null;
  } catch {
    return null;
  }
};

const writeCachedCafes = (cafes) => {
  try {
    window.sessionStorage.setItem(
      CAFES_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), data: cafes }),
    );
  } catch {
    // Cache is a performance nicety; the app still works without it.
  }
};

export function CoffeeDataProvider({ children }) {
  const { user, userProfile } = useAuth();
  const userId = user?.id;
  const cafeRequestRef = useRef(null);
  const adminDataSyncRef = useRef(false);

  const [cafesState, setCafesState] = useState(() => {
    const cachedCafes = readCachedCafes();
    return {
      cafes: cachedCafes || [],
      cafesLoaded: Boolean(cachedCafes),
      cafesError: '',
    };
  });
  const cafesRef = useRef(cafesState.cafes);
  const cafesLoadedRef = useRef(cafesState.cafesLoaded);
  const [cafesLoading, setCafesLoading] = useState(false);
  const [interactions, setInteractions] = useState([]);
  const [interactionsLoading, setInteractionsLoading] = useState(false);
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);
  const interactionsUserIdRef = useRef(null);

  useEffect(() => {
    cafesRef.current = cafesState.cafes;
    cafesLoadedRef.current = cafesState.cafesLoaded;
  }, [cafesState.cafes, cafesState.cafesLoaded]);

  const loadCafes = useCallback(async ({ force = false } = {}) => {
    if (!force && cafesLoadedRef.current) {
      return cafesRef.current;
    }

    if (cafeRequestRef.current) {
      return cafeRequestRef.current;
    }

    cafeRequestRef.current = (async () => {
      setCafesLoading(true);

      try {
        const { data, error } = await withRequestTimeout(
          supabase
            .from('cafes')
            .select(CAFE_COLUMNS)
            .order('nombre', { ascending: true }),
          CAFE_REQUEST_TIMEOUT_MS,
          'La carga de cafeterías tardó demasiado.',
        );

        if (error) throw error;

        const normalizedCafes = deduplicateCafes((data || []).map(normalizeCafe));
        cafesRef.current = normalizedCafes;
        cafesLoadedRef.current = true;
        setCafesState({
          cafes: normalizedCafes,
          cafesLoaded: true,
          cafesError: '',
        });
        writeCachedCafes(normalizedCafes);
        return normalizedCafes;
      } catch (error) {
        console.warn('Supabase no respondió a tiempo; usando el respaldo local de cafeterías.', error);
        const scanModule = await import('../data/openCafeScan.json');
        const fallbackCafes = deduplicateCafes([
          ...cafesRef.current,
          ...(scanModule.default?.cafes || []).map(normalizeCafe),
        ]).sort((first, second) => first.nombre.localeCompare(second.nombre));

        cafesRef.current = fallbackCafes;
        cafesLoadedRef.current = true;
        setCafesState({ cafes: fallbackCafes, cafesLoaded: true, cafesError: '' });
        writeCachedCafes(fallbackCafes);
        return fallbackCafes;
      } finally {
        cafeRequestRef.current = null;
        setCafesLoading(false);
      }
    })();

    return cafeRequestRef.current;
  }, []);

  const addCafes = useCallback((newCafes) => {
    setCafesState((current) => {
      const incoming = newCafes.map(normalizeCafe);
      const knownIds = new Set(current.cafes.map((cafe) => cafe.id));
      const merged = deduplicateCafes([
        ...current.cafes,
        ...incoming.filter((cafe) => !knownIds.has(cafe.id)),
      ]).sort((a, b) => a.nombre.localeCompare(b.nombre));

      cafesRef.current = merged;
      cafesLoadedRef.current = true;
      writeCachedCafes(merged);
      return { cafes: merged, cafesLoaded: true, cafesError: '' };
    });
  }, []);

  useEffect(() => {
    if (!userId || userProfile?.role !== 'administrador' || adminDataSyncRef.current) return;
    if (window.localStorage.getItem(ADMIN_SCAN_SYNC_KEY) === 'complete') return;

    adminDataSyncRef.current = true;
    const syncAdminCafeData = async () => {
      const { error: approvalError } = await supabase
        .from('cafes')
        .update({ status: 'active', last_verified_at: new Date().toISOString() })
        .eq('status', 'needs_review')
        .eq('submitted_by', userId);
      if (approvalError) throw approvalError;

      const scanModule = await import('../data/openCafeScan.json');
      const scannedCafes = scanModule.default?.cafes || [];
      const existing = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('cafes')
          .select('id,nombre,lat,lng,source,source_id')
          .range(from, from + 999);
        if (error) throw error;
        existing.push(...(data || []));
        if (!data || data.length < 1000) break;
      }

      const accepted = [];
      const comparison = [...existing];
      scannedCafes.forEach((candidate) => {
        const sameRecord = comparison.some((current) => current.id === candidate.id);
        const duplicate = !sameRecord && comparison.some((current) => areDuplicateCafes(current, candidate));
        if (duplicate) return;
        accepted.push(candidate);
        if (!sameRecord) comparison.push(candidate);
      });

      for (let index = 0; index < accepted.length; index += 100) {
        const { error } = await supabase
          .from('cafes')
          .upsert(accepted.slice(index, index + 100), { onConflict: 'id' });
        if (error) throw error;
      }

      window.localStorage.setItem(ADMIN_SCAN_SYNC_KEY, 'complete');
      window.sessionStorage.removeItem(CAFES_CACHE_KEY);
      await loadCafes({ force: true });
    };

    syncAdminCafeData().catch((error) => {
      adminDataSyncRef.current = false;
      console.error('No se pudo sincronizar el escaneo administrativo:', error);
    });
  }, [loadCafes, userId, userProfile?.role]);

  const refreshUserInteractions = useCallback(async (targetUserId = userId) => {
    if (!targetUserId) {
      setInteractions([]);
      setInteractionsLoaded(false);
      interactionsUserIdRef.current = null;
      return [];
    }

    setInteractionsLoading(true);

    try {
      const { data, error } = await supabase
        .from('user_cafes')
        .select(INTERACTION_WITH_CAFE_COLUMNS)
        .eq('user_id', targetUserId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const nextInteractions = (data || []).map((interaction) => ({
        ...interaction,
        cafe: interaction.cafe ? normalizeCafe(interaction.cafe) : null,
      }));

      if (targetUserId === userId) {
        const reviewPosts = (data || [])
          .filter((interaction) => String(interaction.review_text || '').trim())
          .map(toReviewPost);
        if (reviewPosts.length > 0) {
          const { error: reviewSyncError } = await supabase
            .from('posts')
            .upsert(reviewPosts, { onConflict: 'interaction_id' });
          if (reviewSyncError) throw reviewSyncError;
        }
      }

      setInteractions(nextInteractions);
      setInteractionsLoaded(true);
      interactionsUserIdRef.current = targetUserId;
      return nextInteractions;
    } finally {
      setInteractionsLoading(false);
    }
  }, [userId]);

  const preloadInitialData = useCallback((targetUserId) => {
    return Promise.allSettled([
      loadCafes(),
      refreshUserInteractions(targetUserId),
    ]);
  }, [loadCafes, refreshUserInteractions]);

  const saveCafeInteraction = useCallback(async (cafeId, updates) => {
    if (!userId || !cafeId) return null;

    const currentInteraction = interactions.find((interaction) => interaction.cafe_id === cafeId);
    const allowedFields = ['is_visited', 'is_favorite', 'in_waitlist', 'rating', 'review_text', 'visited_on'];
    const patch = Object.fromEntries(
      allowedFields
        .filter((key) => Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined)
        .map((key) => [key, updates[key]]),
    );
    const payload = {
      user_id: userId,
      cafe_id: cafeId,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const optimisticInteraction = {
      id: currentInteraction?.id || `optimistic:${cafeId}`,
      is_visited: false,
      is_favorite: false,
      in_waitlist: false,
      rating: null,
      review_text: '',
      visited_on: null,
      ...currentInteraction,
      ...payload,
    };

    setInteractions((current) => {
      const exists = current.some((interaction) => interaction.cafe_id === cafeId);
      return exists
        ? current.map((interaction) => (interaction.cafe_id === cafeId ? optimisticInteraction : interaction))
        : [...current, optimisticInteraction];
    });

    const { data, error } = await supabase
      .from('user_cafes')
      .upsert([payload], { onConflict: 'user_id,cafe_id' })
      .select(INTERACTION_WITH_CAFE_COLUMNS)
      .single();
    if (error) {
      setInteractions((current) => currentInteraction
        ? current.map((interaction) => (interaction.cafe_id === cafeId ? currentInteraction : interaction))
        : current.filter((interaction) => interaction.cafe_id !== cafeId));
      throw error;
    }

    const normalizedInteraction = {
      ...data,
      cafe: data.cafe ? normalizeCafe(data.cafe) : currentInteraction?.cafe || null,
    };

    if (Object.prototype.hasOwnProperty.call(patch, 'review_text')) {
      if (String(data.review_text || '').trim()) {
        const { error: reviewSyncError } = await supabase
          .from('posts')
          .upsert(toReviewPost(data), { onConflict: 'interaction_id' });
        if (reviewSyncError) throw reviewSyncError;
      } else {
        const { error: hideReviewError } = await supabase
          .from('posts')
          .update({ status: 'hidden', updated_at: data.updated_at })
          .eq('interaction_id', data.id);
        if (hideReviewError) throw hideReviewError;
      }
    }

    setInteractions((current) => {
      const exists = current.some((interaction) => interaction.cafe_id === cafeId);
      if (exists) {
        return current.map((interaction) => (interaction.cafe_id === cafeId ? normalizedInteraction : interaction));
      }
      return [...current, normalizedInteraction];
    });
    setInteractionsLoaded(true);

    return normalizedInteraction;
  }, [interactions, userId]);

  useEffect(() => {
    if (!userId) {
      setInteractions([]);
      setInteractionsLoaded(false);
      interactionsUserIdRef.current = null;
      return;
    }

    if (interactionsLoaded && interactionsUserIdRef.current === userId) {
      loadCafes().catch(() => {});
      return;
    }

    loadCafes().catch(() => {});
    refreshUserInteractions().catch(() => {});
  }, [interactionsLoaded, loadCafes, refreshUserInteractions, userId]);

  const cafeById = useMemo(() => {
    return new Map(cafesState.cafes.map((cafe) => [cafe.id, cafe]));
  }, [cafesState.cafes]);

  const interactionsByCafeId = useMemo(() => {
    return new Map(interactions.map((interaction) => [interaction.cafe_id, interaction]));
  }, [interactions]);

  const value = useMemo(() => ({
    cafes: cafesState.cafes,
    cafeById,
    cafesLoading,
    cafesLoaded: cafesState.cafesLoaded,
    cafesError: cafesState.cafesError,
    interactions,
    interactionsByCafeId,
    interactionsLoading,
    interactionsLoaded,
    loadCafes,
    refreshCafes: () => loadCafes({ force: true }),
    addCafes,
    preloadInitialData,
    refreshUserInteractions,
    saveCafeInteraction,
  }), [
    addCafes,
    cafeById,
    cafesLoading,
    cafesState.cafes,
    cafesState.cafesError,
    cafesState.cafesLoaded,
    interactions,
    interactionsByCafeId,
    interactionsLoaded,
    interactionsLoading,
    loadCafes,
    preloadInitialData,
    refreshUserInteractions,
    saveCafeInteraction,
  ]);

  return (
    <CoffeeDataContext.Provider value={value}>
      {children}
    </CoffeeDataContext.Provider>
  );
}

export function useCoffeeData() {
  const context = useContext(CoffeeDataContext);
  if (!context) {
    throw new Error('useCoffeeData debe usarse dentro de CoffeeDataProvider');
  }
  return context;
}
