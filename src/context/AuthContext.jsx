/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { clearLocalSupabaseSession, supabase } from '../supabase';

const AuthContext = createContext(null);

const PROFILE_COLUMNS = 'id,username,avatar_url,cover_url,text_color,role';
const PROFILE_CACHE_PREFIX = 'coffee-map:profile:';
const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;
const AUTH_REQUEST_TIMEOUT_MS = 12 * 1000;
const PROFILE_REQUEST_TIMEOUT_MS = 10 * 1000;
const AUTH_CONNECTION_MESSAGE = 'No pudimos conectar con el servidor de Coffee Map. Intenta de nuevo en un momento.';

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
};

const getProfileCacheKey = (userId) => `${PROFILE_CACHE_PREFIX}${userId}`;

const readCachedProfile = (userId) => {
  try {
    const cached = window.sessionStorage.getItem(getProfileCacheKey(userId));
    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > PROFILE_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(getProfileCacheKey(userId));
      return null;
    }

    return parsed.data || null;
  } catch {
    return null;
  }
};

const writeCachedProfile = (profile) => {
  if (!profile?.id) return;

  try {
    window.sessionStorage.setItem(
      getProfileCacheKey(profile.id),
      JSON.stringify({ savedAt: Date.now(), data: profile }),
    );
  } catch {
    // Auth works without sessionStorage; this only saves redundant profile reads.
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const profileRequestRef = useRef(null);
  const hasResolvedSessionRef = useRef(false);

  const fetchProfile = useCallback(async (userId, { force = false } = {}) => {
    if (!userId) {
      setUserProfile(null);
      return null;
    }

    if (!force) {
      const cachedProfile = readCachedProfile(userId);
      if (cachedProfile) {
        setUserProfile(cachedProfile);
        return cachedProfile;
      }
    }

    if (profileRequestRef.current?.userId === userId) {
      return profileRequestRef.current.promise;
    }

    const profilePromise = (async () => {
      setProfileLoading(true);

      try {
        const { data, error } = await withTimeout(
          supabase
            .from('profiles')
            .select(PROFILE_COLUMNS)
            .eq('id', userId)
            .maybeSingle(),
          PROFILE_REQUEST_TIMEOUT_MS,
          'La carga del perfil tardó demasiado.',
        );

        if (error) throw error;

        setUserProfile(data || null);
        if (data) writeCachedProfile(data);
        return data || null;
      } catch (error) {
        console.error('[auth] No se pudo cargar el perfil:', error);
        setUserProfile(null);
        return null;
      } finally {
        setProfileLoading(false);
      }
    })();

    profileRequestRef.current = { userId, promise: profilePromise };

    try {
      return await profilePromise;
    } finally {
      profileRequestRef.current = null;
    }
  }, []);

  const syncSession = useCallback((session) => {
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    setAuthError('');

    if (!currentUser) {
      setUserProfile(null);
      setLoading(false);
      hasResolvedSessionRef.current = true;
      return;
    }

    setUserProfile((currentProfile) => (
      currentProfile?.id === currentUser.id ? currentProfile : null
    ));
    setLoading(false);
    hasResolvedSessionRef.current = true;

    // Keep the auth callback synchronous. Supabase can deadlock when another
    // async API call runs directly inside onAuthStateChange.
    window.setTimeout(() => {
      void fetchProfile(currentUser.id);
    }, 0);
  }, [fetchProfile]);

  const updateCachedProfile = useCallback((updates) => {
    setUserProfile((currentProfile) => {
      const nextProfile = {
        ...(currentProfile || {}),
        ...updates,
      };

      writeCachedProfile(nextProfile);
      return nextProfile;
    });
  }, []);

  useEffect(() => {
    let active = true;
    const deferredSessionTimers = new Set();

    // onAuthStateChange emits INITIAL_SESSION after the client finishes its
    // startup work. Calling getSession at the same time creates a second auth
    // operation and can leave Safari waiting on the same browser lock.
    const startupTimer = window.setTimeout(() => {
      if (!active || hasResolvedSessionRef.current) return;

      setUser(null);
      setUserProfile(null);
      setAuthError(AUTH_CONNECTION_MESSAGE);
      setLoading(false);
      hasResolvedSessionRef.current = true;
    }, AUTH_REQUEST_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      const timerId = window.setTimeout(() => {
        deferredSessionTimers.delete(timerId);
        if (active) syncSession(session);
      }, 0);
      deferredSessionTimers.add(timerId);
    });

    return () => {
      active = false;
      window.clearTimeout(startupTimer);
      deferredSessionTimers.forEach((timerId) => window.clearTimeout(timerId));
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading,
      profileLoading,
      authError,
      updateCachedProfile,
      login: async (email, password) => {
        setAuthError('');
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          AUTH_REQUEST_TIMEOUT_MS,
          AUTH_CONNECTION_MESSAGE,
        );
        if (error) throw error;
        return data;
      },
      restartSession: () => {
        clearLocalSupabaseSession();
        window.location.reload();
      },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
      },
      register: async (email, password, username) => {
        const trimmedUsername = username.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              username: trimmedUsername,
            },
          },
        });
        if (error) throw error;

        return data;
      },
      logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setUserProfile(null);
      },
    }),
    [authError, loading, profileLoading, updateCachedProfile, user, userProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
