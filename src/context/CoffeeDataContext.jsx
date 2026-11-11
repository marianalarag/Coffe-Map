/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';
import { deduplicateCafes, repairCafeText } from '../utils/cafeDeduplication';
import { getCafeCoordinates } from '../utils/cafeLocation';
import { summarizeCafeInteractions } from '../utils/cafeInteractions';

const CoffeeDataContext = createContext(null);

const CAFES_CACHE_KEY = 'coffee-map:cafes:v23';
const CAFES_CACHE_TTL_MS = 15 * 60 * 1000;
const CAFE_REQUEST_TIMEOUT_MS = 8 * 1000;
const INTERACTION_REQUEST_TIMEOUT_MS = 12 * 1000;
const CAFE_COLUMNS = 'id,nombre,lat,lng,rating,reviews,link,address,neighborhood,category,image_url,image_source_url,image_attribution,image_license,instagram_url,website_url,tiktok_url,menu_url,menu_page_url,opening_hours,opening_hours_source,opening_hours_source_url,opening_hours_verified_at,source,source_id,source_url,status,deleted_at,created_at';
const INTERACTION_COLUMNS = 'id,user_id,cafe_id,is_visited,is_favorite,in_waitlist,rating,rated_at,review_text,visited_on,is_revisit,updated_at';
const INTERACTION_WITH_CAFE_COLUMNS = `${INTERACTION_COLUMNS},cafe:cafes(${CAFE_COLUMNS})`;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const parseCafeMenuImages = (value) => {
  if (Array.isArray(value)) return value.filter((url) => typeof url === 'string');
  try {
    const parsed = JSON.parse(String(value || ''));
    return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
  } catch {
    return [];
  }
};

const withRequestTimeout = (request, timeoutMs, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([request, timeout]).finally(() => window.clearTimeout(timeoutId));
};

const normalizeCafe = (cafe) => {
  const coordinates = getCafeCoordinates(cafe) || { lat: null, lng: null };

  return {
    ...cafe,
    nombre: repairCafeText(cafe.nombre),
    lat: coordinates.lat,
    lng: coordinates.lng,
    pos: { lat: coordinates.lat, lng: coordinates.lng },
    imageUrl: cafe.image_url !== undefined ? cafe.image_url : cafe.imageUrl || null,
    imageSourceUrl: cafe.image_source_url !== undefined ? cafe.image_source_url : cafe.imageSourceUrl || null,
    imageAttribution: cafe.image_attribution !== undefined ? cafe.image_attribution : cafe.imageAttribution || null,
    imageLicense: cafe.image_license !== undefined ? cafe.image_license : cafe.imageLicense || null,
    instagramUrl: cafe.instagram_url !== undefined ? cafe.instagram_url : cafe.instagramUrl || null,
    websiteUrl: cafe.website_url !== undefined ? cafe.website_url : cafe.websiteUrl || null,
    tiktokUrl: cafe.tiktok_url !== undefined ? cafe.tiktok_url : cafe.tiktokUrl || null,
    menuPageUrl: cafe.menu_page_url !== undefined ? cafe.menu_page_url : cafe.menuPageUrl || null,
    menuImages: parseCafeMenuImages(cafe.menu_url !== undefined ? cafe.menu_url : cafe.menuImages),
    openingHours: cafe.opening_hours !== undefined ? cafe.opening_hours : cafe.openingHours || null,
    openingHoursSource: cafe.opening_hours_source !== undefined ? cafe.opening_hours_source : cafe.openingHoursSource || null,
    openingHoursSourceUrl: cafe.opening_hours_source_url !== undefined ? cafe.opening_hours_source_url : cafe.openingHoursSourceUrl || null,
    openingHoursVerifiedAt: cafe.opening_hours_verified_at !== undefined ? cafe.opening_hours_verified_at : cafe.openingHoursVerifiedAt || null,
    source: cafe.source || 'manual',
    sourceId: cafe.source_id || cafe.sourceId || null,
    sourceUrl: cafe.source_url || cafe.sourceUrl || null,
    address: cafe.address ? repairCafeText(cafe.address) : null,
    neighborhood: cafe.neighborhood ? repairCafeText(cafe.neighborhood) : null,
    category: cafe.category === 'panaderia' ? 'panaderia' : 'cafeteria',
    status: cafe.status || 'active',
  };
};

const readCachedCafes = () => {
  try {
    const cached = window.sessionStorage.getItem(CAFES_CACHE_KEY);
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > CAFES_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(CAFES_CACHE_KEY);
      return null;
    }

    const cafes = Array.isArray(parsed.data) ? deduplicateCafes(parsed.data.map(normalizeCafe)) : [];
    return cafes.length ? cafes : null;
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
  const { user } = useAuth();
  const userId = user?.id;
  const cafeRequestRef = useRef(null);
  const cafeVersionRef = useRef(0);

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
  const [interactionsError, setInteractionsError] = useState('');
  const interactionsUserIdRef = useRef(null);

  useEffect(() => {
    cafesRef.current = cafesState.cafes;
    cafesLoadedRef.current = cafesState.cafesLoaded;
  }, [cafesState.cafes, cafesState.cafesLoaded]);

  const loadCafes = useCallback(async ({ force = false } = {}) => {
    if (!force && cafesLoadedRef.current) {
      return cafesRef.current;
    }

    if (cafeRequestRef.current && !force) {
      return cafeRequestRef.current;
    }

    const version = ++cafeVersionRef.current;
    cafeRequestRef.current = (async () => {
      setCafesLoading(true);

      try {
        const [catalog, ratings] = await withRequestTimeout(
          Promise.all([supabase
            .from('cafes')
            .select(CAFE_COLUMNS)
            .eq('status', 'active')
            .order('nombre', { ascending: true }), supabase.rpc('get_cafe_app_ratings')]),
          CAFE_REQUEST_TIMEOUT_MS,
          'La carga de cafeterías tardó demasiado.',
        );

        if (catalog.error) throw catalog.error;
        if (ratings.error) throw ratings.error;

        if (version !== cafeVersionRef.current) return cafesRef.current;
        const ratingsByCafe = new Map((ratings.data || []).map((row) => [row.cafe_id, row]));
        const normalizedCafes = deduplicateCafes((catalog.data || []).map((row) => normalizeCafe({
          ...row, rating: Number(ratingsByCafe.get(row.id)?.rating) || 0,
          ratingsCount: Number(ratingsByCafe.get(row.id)?.rating_count) || 0, ratingSource: 'app',
        })));
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
        if (version !== cafeVersionRef.current) return cafesRef.current;
        setCafesState((current) => ({ ...current, cafesError: error.message || 'No pudimos actualizar las cafeterías.' }));
        throw error;
      } finally {
        if (version === cafeVersionRef.current) { cafeRequestRef.current = null; setCafesLoading(false); }
      }
    })();

    return cafeRequestRef.current;
  }, []);

  const addCafes = useCallback((newCafes) => {
    cafeVersionRef.current += 1;
    cafeRequestRef.current = null;
    setCafesLoading(false);
    setCafesState((current) => {
      const incoming = newCafes.map((row) => normalizeCafe({ ...row, rating: 0, ratingsCount: 0, ratingSource: 'app' })).filter((cafe) => cafe.status === 'active' && !cafe.deleted_at);
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
    const refresh = () => { loadCafes({ force: true }).catch(() => {}); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [loadCafes]);

  const updateCafe = useCallback((row) => {
    cafeVersionRef.current += 1;
    cafeRequestRef.current = null;
    setCafesLoading(false);
    const current = cafesRef.current;
    const existing = current.find((cafe) => cafe.id === row.id);
    const updated = normalizeCafe({ ...existing, ...row, rating: existing?.rating || 0, ratingsCount: existing?.ratingsCount || 0, ratingSource: 'app' });
    setInteractions((items) => items.map((item) => item.cafe_id === row.id ? { ...item, cafe: updated } : item));
    const next = updated.status !== 'active' || updated.deleted_at
      ? current.filter((cafe) => cafe.id !== row.id)
      : existing ? current.map((cafe) => cafe.id === row.id ? updated : cafe) : [...current, updated];
    cafesRef.current = next;
    writeCachedCafes(next);
    setCafesState((state) => ({ ...state, cafes: next, cafesError: '' }));
  }, []);

  const removeCafe = useCallback((cafeId) => {
    cafeVersionRef.current += 1;
    cafeRequestRef.current = null;
    setCafesLoading(false);
    const next = cafesRef.current.filter((cafe) => cafe.id !== cafeId);
    cafesRef.current = next;
    writeCachedCafes(next);
    setCafesState((state) => ({ ...state, cafes: next, cafesError: '' }));
    setInteractions((items) => items.filter((item) => item.cafe_id !== cafeId));
  }, []);

  const refreshUserInteractions = useCallback(async (targetUserId = userId) => {
    if (!targetUserId) {
      setInteractions([]);
      setInteractionsLoaded(false);
      interactionsUserIdRef.current = null;
      return [];
    }

    setInteractionsLoading(true);
    setInteractionsError('');

    try {
      const { data, error } = await withRequestTimeout(
        supabase
          .from('user_cafes')
          .select(INTERACTION_WITH_CAFE_COLUMNS)
          .eq('user_id', targetUserId)
          .order('updated_at', { ascending: false }),
        INTERACTION_REQUEST_TIMEOUT_MS,
        'La carga de tu perfil tardó demasiado. Revisa tu conexión e inténtalo de nuevo.',
      );

      if (error) throw error;

      const nextInteractions = (data || []).map((interaction) => ({
        ...interaction,
        cafe: interaction.cafe ? normalizeCafe(interaction.cafe) : null,
      }));

      setInteractions(nextInteractions);
      setInteractionsLoaded(true);
      setInteractionsError('');
      interactionsUserIdRef.current = targetUserId;
      loadCafes({ force: true }).catch(() => {});
      return nextInteractions;
    } catch (error) {
      setInteractionsError(error.message || 'No se pudieron cargar tus datos de perfil.');
      setInteractionsLoaded(true);
      interactionsUserIdRef.current = targetUserId;
      throw error;
    } finally {
      setInteractionsLoading(false);
    }
  }, [loadCafes, userId]);

  const preloadInitialData = useCallback((targetUserId) => {
    return Promise.allSettled([
      loadCafes(),
      refreshUserInteractions(targetUserId),
    ]);
  }, [loadCafes, refreshUserInteractions]);

  const saveCafeInteraction = useCallback(async (cafeId, updates, options = {}) => {
    if (!userId || !cafeId) return null;

    const currentInteraction = interactions
      .filter((interaction) => interaction.cafe_id === cafeId)
      .filter((interaction) => !options.interactionId || interaction.id === options.interactionId)
      .sort((first, second) => String(second.updated_at || '').localeCompare(String(first.updated_at || '')))[0];
    const persistedInteraction = isUuid(currentInteraction?.id) ? currentInteraction : null;
    if (options.interactionId && !persistedInteraction) throw new Error('No encontramos esa visita para actualizarla.');
    const createNewVisit = Boolean(options.createNewVisit);
    const allowedFields = ['is_visited', 'is_favorite', 'in_waitlist', 'rating', 'review_text', 'visited_on', 'is_revisit'];
    const patch = Object.fromEntries(
      allowedFields
        .filter((key) => Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined)
        .map((key) => [key, updates[key]]),
    );
    const preferences = summarizeCafeInteractions(interactions).get(cafeId);
    const preferenceKeys = ['is_favorite', 'in_waitlist'];
    if (!createNewVisit && !options.interactionId && persistedInteraction && Object.keys(patch).length > 0 && Object.keys(patch).every((key) => preferenceKeys.includes(key))) {
      const previous = interactions.filter((item) => item.cafe_id === cafeId);
      setInteractions((current) => current.map((item) => item.cafe_id === cafeId ? { ...item, ...patch } : item));
      try {
        const { data, error } = await supabase.from('user_cafes').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('id', persistedInteraction.id).select(INTERACTION_WITH_CAFE_COLUMNS).single();
        if (error) throw error;
        if (!data?.id) throw new Error('No se pudo confirmar el cambio en tus preferencias.');
        const row = { ...data, cafe: data.cafe ? normalizeCafe(data.cafe) : null };
        setInteractions((current) => current.map((item) => item.id === row.id ? row : item.cafe_id === cafeId ? { ...item, is_favorite: row.is_favorite, in_waitlist: row.in_waitlist } : item));
        return row;
      } catch (error) {
        setInteractions((current) => [...previous, ...current.filter((item) => item.cafe_id !== cafeId)]);
        throw error;
      }
    }
    const payload = {
      user_id: userId,
      cafe_id: cafeId,
      is_favorite: Boolean(preferences?.is_favorite),
      in_waitlist: Boolean(preferences?.in_waitlist),
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const optimisticInteraction = {
      is_visited: false,
      is_favorite: false,
      in_waitlist: false,
      rating: null,
      review_text: '',
      visited_on: null,
      ...persistedInteraction,
      id: createNewVisit ? `optimistic:${cafeId}:${Date.now()}` : (persistedInteraction?.id || `optimistic:${cafeId}`),
      ...payload,
    };

    setInteractions((current) => {
      if (createNewVisit) return [optimisticInteraction, ...current];
      const interactionIndex = current.findIndex((item) => item.id === persistedInteraction?.id);
      if (interactionIndex >= 0) {
        return current.map((item, index) => (index === interactionIndex ? optimisticInteraction : item));
      }
      return [optimisticInteraction, ...current];
    });

    const interactionRequest = createNewVisit || !persistedInteraction?.id
      ? supabase.from('user_cafes').insert([payload])
      : supabase.from('user_cafes').update(payload).eq('id', persistedInteraction.id);
    const { data, error } = await Promise.resolve(interactionRequest
      .select(INTERACTION_WITH_CAFE_COLUMNS)
      .single()).catch((error) => ({ data: null, error }));
    if (error) {
      setInteractions((current) => {
        if (createNewVisit || !persistedInteraction?.id) return current.filter((item) => item.id !== optimisticInteraction.id);
        return current.map((item) => item.id === optimisticInteraction.id ? persistedInteraction : item);
      });
      throw error;
    }

    const normalizedInteraction = {
      ...data,
      cafe: data.cafe ? normalizeCafe(data.cafe) : persistedInteraction?.cafe || null,
    };

    setInteractions((current) => {
      const remaining = current.filter((item) => item.id !== optimisticInteraction.id && item.id !== normalizedInteraction.id)
        .map((item) => item.cafe_id === cafeId ? { ...item, is_favorite: normalizedInteraction.is_favorite, in_waitlist: normalizedInteraction.in_waitlist } : item);
      return [normalizedInteraction, ...remaining];
    });
    setInteractionsLoaded(true);
    if (Object.hasOwn(patch, 'rating')) loadCafes({ force: true }).catch(() => {});

    return normalizedInteraction;
  }, [interactions, loadCafes, userId]);

  const deleteCafeInteraction = useCallback(async (interactionId) => {
    if (!userId || !isUuid(interactionId)) return null;

    const removedInteraction = interactions.find((interaction) => interaction.id === interactionId);
    if (!removedInteraction) return null;

    setInteractions((current) => current.filter((interaction) => interaction.id !== interactionId));
    const { error } = await supabase
      .from('user_cafes')
      .delete()
      .eq('id', interactionId)
      .eq('user_id', userId);

    if (error) {
      setInteractions((current) => [removedInteraction, ...current].sort((first, second) => String(second.updated_at || '').localeCompare(String(first.updated_at || ''))));
      throw error;
    }

    if (Number(removedInteraction.rating) > 0) loadCafes({ force: true }).catch(() => {});
    return removedInteraction;
  }, [interactions, loadCafes, userId]);

  useEffect(() => {
    if (!userId) {
      setInteractions([]);
      setInteractionsLoaded(false);
      setInteractionsError('');
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
    return summarizeCafeInteractions(interactions);
  }, [interactions]);

  const value = useMemo(() => ({
    cafes: cafesState.cafes,
    cafeById,
    cafesLoading,
    cafesLoaded: cafesState.cafesLoaded,
    cafesError: cafesState.cafesError,
    interactions,
    interactionsError,
    interactionsByCafeId,
    interactionsLoading,
    interactionsLoaded,
    loadCafes,
    refreshCafes: () => loadCafes({ force: true }),
    addCafes,
    updateCafe,
    removeCafe,
    preloadInitialData,
    refreshUserInteractions,
    saveCafeInteraction,
    deleteCafeInteraction,
  }), [
    addCafes,
    updateCafe,
    removeCafe,
    cafeById,
    cafesLoading,
    cafesState.cafes,
    cafesState.cafesError,
    cafesState.cafesLoaded,
    interactions,
    interactionsError,
    interactionsByCafeId,
    interactionsLoaded,
    interactionsLoading,
    loadCafes,
    preloadInitialData,
    refreshUserInteractions,
    saveCafeInteraction,
    deleteCafeInteraction,
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
