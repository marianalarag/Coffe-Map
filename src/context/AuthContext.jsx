/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase';

const AuthContext = createContext(null);

const PROFILE_COLUMNS = 'id,username,avatar_url,role';
const PROFILE_CACHE_PREFIX = 'coffee-map:profile:';
const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;

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
  const profileRequestRef = useRef(null);

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
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setUserProfile(null);
        return null;
      }

      setUserProfile(data || null);
      if (data) writeCachedProfile(data);
      return data || null;
    })();

    profileRequestRef.current = { userId, promise: profilePromise };

    try {
      return await profilePromise;
    } finally {
      profileRequestRef.current = null;
    }
  }, []);

  const syncSession = useCallback(async (session) => {
    setLoading(true);
    const currentUser = session?.user ?? null;
    setUser(currentUser);

    if (!currentUser) {
      setUserProfile(null);
      setLoading(false);
      return;
    }

    await fetchProfile(currentUser.id);
    setLoading(false);
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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) syncSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) syncSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const value = useMemo(
    () => ({
      user,
      userProfile,
      loading,
      updateCachedProfile,
      login: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
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
            data: {
              username: trimmedUsername,
            },
          },
        });
        if (error) throw error;

        if (data?.user) {
          const profile = {
            id: data.user.id,
            username: trimmedUsername,
            avatar_url: `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(trimmedUsername)}`,
            role: 'usuario',
          };

          const { error: profileError } = await supabase
            .from('profiles')
            .insert([profile]);

          if (!profileError) {
            setUserProfile(profile);
            writeCachedProfile(profile);
          } else {
            console.error('Error al crear perfil en DB:', profileError);
          }
        }

        return data;
      },
      logout: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setUserProfile(null);
      },
    }),
    [loading, updateCachedProfile, user, userProfile]
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
