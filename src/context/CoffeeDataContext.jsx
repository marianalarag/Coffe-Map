/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';
import { deduplicateCafes } from '../utils/cafeDeduplication';

const CoffeeDataContext = createContext(null);

const CAFES_CACHE_KEY = 'coffee-map:cafes:v4';
const CAFES_CACHE_TTL_MS = 15 * 60 * 1000;
const VISIBLE_CAFE_SOURCES = ['manual', 'community', 'osm', 'overture'];
const CAFE_COLUMNS = 'id,nombre,lat,lng,rating,reviews,link,address,neighborhood,category,image_url,image_source_url,image_attribution,image_license,source,source_id,source_url';
const INTERACTION_COLUMNS = 'id,user_id,cafe_id,is_visited,is_favorite,in_waitlist,rating,review_text,visited_on,updated_at';
const INTERACTION_WITH_CAFE_COLUMNS = `${INTERACTION_COLUMNS},cafe:cafes(${CAFE_COLUMNS})`;

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
  const { user } = useAuth();
  const userId = user?.id;
  const cafeRequestRef = useRef(null);

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
        const { data, error } = await supabase
          .from('cafes')
          .select(CAFE_COLUMNS)
          .in('source', VISIBLE_CAFE_SOURCES)
          .order('nombre', { ascending: true });

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
        cafesLoadedRef.current = cafesRef.current.length > 0;
        setCafesState((current) => ({
          ...current,
          cafesLoaded: current.cafes.length > 0,
          cafesError: error.message || 'No se pudieron cargar las cafeterias.',
        }));
        throw error;
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
