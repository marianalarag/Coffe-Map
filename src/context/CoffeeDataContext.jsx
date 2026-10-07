/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from './AuthContext';
import { areDuplicateCafes, deduplicateCafes, repairCafeText } from '../utils/cafeDeduplication';
import { geocodeCafeLocation, getCafeCoordinates } from '../utils/cafeLocation';

const CoffeeDataContext = createContext(null);

const CAFES_CACHE_KEY = 'coffee-map:cafes:v13';
const CAFES_CACHE_TTL_MS = 15 * 60 * 1000;
const CAFE_REQUEST_TIMEOUT_MS = 8 * 1000;
const CAFE_COLUMNS = 'id,nombre,lat,lng,rating,reviews,link,address,neighborhood,category,image_url,image_source_url,image_attribution,image_license,opening_hours,opening_hours_source,opening_hours_source_url,opening_hours_verified_at,source,source_id,source_url,status';
const INTERACTION_COLUMNS = 'id,user_id,cafe_id,is_visited,is_favorite,in_waitlist,rating,review_text,visited_on,updated_at';
const INTERACTION_WITH_CAFE_COLUMNS = `${INTERACTION_COLUMNS},cafe:cafes(${CAFE_COLUMNS})`;
// Change this version whenever a validated source scan is published so the next
// administrator session synchronizes only the newly discovered, unique cafes.
const ADMIN_SCAN_SYNC_KEY = 'coffee-map:admin-scan:2026-09-04-v2';
const COMMUNITY_LOCATION_CACHE_KEY = 'coffee-map:community-location:v2:';
const MERIDA_BOUNDS = { south: 20.86, west: -89.75, north: 21.08, east: -89.52 };
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

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

const normalizeCafe = (cafe) => {
  const coordinates = getCafeCoordinates(cafe) || { lat: Number(cafe.lat), lng: Number(cafe.lng) };

  return {
    ...cafe,
    nombre: repairCafeText(cafe.nombre),
    lat: coordinates.lat,
    lng: coordinates.lng,
    pos: { lat: coordinates.lat, lng: coordinates.lng },
    imageUrl: cafe.image_url || cafe.imageUrl || null,
    imageSourceUrl: cafe.image_source_url || cafe.imageSourceUrl || null,
    imageAttribution: cafe.image_attribution || cafe.imageAttribution || null,
    imageLicense: cafe.image_license || cafe.imageLicense || null,
    openingHours: cafe.opening_hours || cafe.openingHours || null,
    openingHoursSource: cafe.opening_hours_source || cafe.openingHoursSource || null,
    openingHoursSourceUrl: cafe.opening_hours_source_url || cafe.openingHoursSourceUrl || null,
    openingHoursVerifiedAt: cafe.opening_hours_verified_at || cafe.openingHoursVerifiedAt || null,
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

const isMeridaCoordinate = ({ lat, lng }) => (
  lat >= MERIDA_BOUNDS.south
  && lat <= MERIDA_BOUNDS.north
  && lng >= MERIDA_BOUNDS.west
  && lng <= MERIDA_BOUNDS.east
);

const readCommunityLocation = (address) => {
  try {
    const value = window.sessionStorage.getItem(`${COMMUNITY_LOCATION_CACHE_KEY}${address}`);
    const parsed = value ? JSON.parse(value) : null;
    return parsed && Number.isFinite(Number(parsed.lat)) && Number.isFinite(Number(parsed.lng))
      ? { lat: Number(parsed.lat), lng: Number(parsed.lng), neighborhood: parsed.neighborhood || null }
      : null;
  } catch {
    return null;
  }
};

const writeCommunityLocation = (address, location) => {
  try {
    window.sessionStorage.setItem(`${COMMUNITY_LOCATION_CACHE_KEY}${address}`, JSON.stringify(location));
  } catch {
    // Location repair is best effort; the saved cafe remains usable without it.
  }
};

const repairCommunityLocations = async (cafes) => {
  const candidates = cafes.filter((cafe) => (
    cafe.source === 'community' && (cafe.address?.trim() || cafe.link?.trim() || cafe.source_url?.trim())
  ));
  if (!candidates.length) return cafes;

  const repaired = new Map();
  for (const cafe of candidates) {
    const locationKey = [cafe.link, cafe.source_url, cafe.address].filter(Boolean).join('|');
    let location = readCommunityLocation(locationKey);
    if (!location) {
      try {
        location = await geocodeCafeLocation(cafe);
        if (location && isMeridaCoordinate(location)) writeCommunityLocation(locationKey, location);
      } catch {
        location = null;
      }
    }
    if (location && isMeridaCoordinate(location)) repaired.set(cafe.id, location);
  }

  if (!repaired.size) return cafes;
  const repairedCafes = cafes.map((cafe) => {
    const location = repaired.get(cafe.id);
    return location
      ? normalizeCafe({ ...cafe, lat: location.lat, lng: location.lng, neighborhood: cafe.neighborhood || location.neighborhood })
      : cafe;
  });

  // A stale row and its corrected row can be far apart before geocoding, so
  // they only become duplicates after both use the address coordinates.
  return deduplicateCafes(repairedCafes);
};

export function CoffeeDataProvider({ children }) {
  const { user, userProfile } = useAuth();
  const userId = user?.id;
  const cafeRequestRef = useRef(null);
  const adminDataSyncRef = useRef(false);
  const communityRepairStartedRef = useRef(false);

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

  useEffect(() => {
    if (!cafesState.cafesLoaded || !cafesState.cafes.length || communityRepairStartedRef.current) return;
    communityRepairStartedRef.current = true;
    repairCommunityLocations(cafesState.cafes).then((repairedCafes) => {
      if (repairedCafes === cafesState.cafes) return;
      cafesRef.current = repairedCafes;
      setCafesState((current) => ({ ...current, cafes: repairedCafes }));
      writeCachedCafes(repairedCafes);
    }).catch(() => {});
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
            .eq('status', 'active')
            .order('nombre', { ascending: true }),
          CAFE_REQUEST_TIMEOUT_MS,
          'La carga de cafeterías tardó demasiado.',
        );

        if (error) throw error;

        let normalizedCafes = deduplicateCafes((data || []).map(normalizeCafe));
        // A public Supabase query can legitimately return an empty array while
        // RLS is being deployed. Keep exploration useful with the bundled scan
        // until the database policies and data are available.
        if (!normalizedCafes.length) {
          const scanModule = await import('../data/openCafeScan.json');
          normalizedCafes = deduplicateCafes((scanModule.default?.cafes || []).map(normalizeCafe));
        }
        cafesRef.current = normalizedCafes;
        cafesLoadedRef.current = true;
        setCafesState({
          cafes: normalizedCafes,
          cafesLoaded: true,
          cafesError: '',
        });
        writeCachedCafes(normalizedCafes);
        communityRepairStartedRef.current = true;
        repairCommunityLocations(normalizedCafes).then((repairedCafes) => {
          if (repairedCafes === normalizedCafes) return;
          cafesRef.current = repairedCafes;
          setCafesState((current) => ({ ...current, cafes: repairedCafes }));
          writeCachedCafes(repairedCafes);
        }).catch(() => {});
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

  const saveCafeInteraction = useCallback(async (cafeId, updates, options = {}) => {
    if (!userId || !cafeId) return null;

    const currentInteraction = interactions
      .filter((interaction) => interaction.cafe_id === cafeId)
      .sort((first, second) => String(second.updated_at || '').localeCompare(String(first.updated_at || '')))[0];
    const persistedInteraction = isUuid(currentInteraction?.id) ? currentInteraction : null;
    const createNewVisit = Boolean(options.createNewVisit);
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
      id: createNewVisit ? `optimistic:${cafeId}:${Date.now()}` : (persistedInteraction?.id || `optimistic:${cafeId}`),
      is_visited: false,
      is_favorite: false,
      in_waitlist: false,
      rating: null,
      review_text: '',
      visited_on: null,
      ...persistedInteraction,
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
    const { data, error } = await interactionRequest
      .select(INTERACTION_WITH_CAFE_COLUMNS)
      .single();
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
      const exists = current.some((interaction) => interaction.id === normalizedInteraction.id);
      if (exists) return current.map((interaction) => (interaction.id === normalizedInteraction.id ? normalizedInteraction : interaction));
      return [normalizedInteraction, ...current.filter((interaction) => interaction.id !== optimisticInteraction.id)];
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
    const latestByCafe = new Map();
    interactions.forEach((interaction) => {
      if (!latestByCafe.has(interaction.cafe_id)) latestByCafe.set(interaction.cafe_id, interaction);
    });
    return latestByCafe;
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
