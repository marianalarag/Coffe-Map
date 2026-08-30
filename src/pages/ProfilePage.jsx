import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Coffee,
  Heart,
  ListPlus,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  Star,
  UserPlus,
  Users,
  Search,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import PageLoading from '../components/PageLoading';
import { supabase } from '../supabase';
import { ActivityFeed } from './ActivityPage';
import { getCafeNeighborhood } from '../utils/cafeAddress';

const getOptimizedProfileImageUrl = (url, width) => {
  if (!url || typeof window === 'undefined' || !window.location.hostname.endsWith('.vercel.app')) return url;
  if (!url.startsWith('https://zuojhckhlphpkcwcufae.supabase.co/storage/v1/object/public/avatars/')) return url;
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=90`;
};

const getProfileAssetPath = (userId, kind, file) => {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${userId}/${kind}-${fileId}.${fileExt}`;
};

const optimizeProfileImage = async (file, kind) => {
  if (!window.createImageBitmap || !file.type.startsWith('image/')) return file;

  try {
    const bitmap = await window.createImageBitmap(file);
    const maxDimension = kind === 'avatar' ? 1200 : 2400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', kind === 'avatar' ? 0.92 : 0.88));
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || kind;
    return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } catch {
    return file;
  }
};

const getProfileSaveErrorMessage = (error) => {
  const message = error?.message || 'No se pudo guardar el perfil.';

  if (
    message.includes('cover_url')
    || message.includes('text_color')
    || error?.code === 'PGRST204'
  ) {
    return 'Falta correr el SQL actualizado en Supabase para agregar cover_url y text_color en profiles. Después recarga la página.';
  }

  return message;
};

function ProfilePage() {
  const { user, userProfile, logout, updateCachedProfile } = useAuth();
  const {
    cafeById,
    cafes,
    cafesLoaded,
    loadCafes,
    interactions,
    interactionsLoaded,
    interactionsLoading,
  } = useCoffeeData();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = new URLSearchParams(location.search).get('tab') || 'profile';

  const [uploadingField, setUploadingField] = useState('');
  const [savingColor, setSavingColor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const settingsMenuRef = useRef(null);
  const avatarPressTimerRef = useRef(null);
  const colorSaveTimerRef = useRef(null);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [draftTextColor, setDraftTextColor] = useState(userProfile?.text_color || '#E6DAC1');

  const openProfileTab = (tab) => navigate(tab === 'profile' ? '/profile' : `/profile?tab=${tab}`);

  const startAvatarPress = () => {
    window.clearTimeout(avatarPressTimerRef.current);
    avatarPressTimerRef.current = window.setTimeout(() => setShowAvatarViewer(true), 450);
  };

  const cancelAvatarPress = () => window.clearTimeout(avatarPressTimerRef.current);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes, navigate, user]);

  useEffect(() => {
    if (!showSettings) return undefined;

    const closeSettings = (event) => {
      if (event.key === 'Escape' || !settingsMenuRef.current?.contains(event.target)) {
        setShowSettings(false);
      }
    };

    document.addEventListener('pointerdown', closeSettings);
    document.addEventListener('keydown', closeSettings);
    return () => {
      document.removeEventListener('pointerdown', closeSettings);
      document.removeEventListener('keydown', closeSettings);
    };
  }, [showSettings]);

  useEffect(() => {
    setDraftTextColor(userProfile?.text_color || '#E6DAC1');
  }, [userProfile?.text_color]);

  useEffect(() => () => window.clearTimeout(colorSaveTimerRef.current), []);

  const stats = useMemo(() => ({
    visited: interactions.filter((interaction) => interaction.is_visited).length,
    favorites: interactions.filter((interaction) => interaction.is_favorite).length,
    waitingList: interactions.filter((interaction) => interaction.in_waitlist).length,
    reviews: interactions.filter((interaction) => interaction.review_text?.trim()).length,
    rated: interactions.filter((interaction) => interaction.rating && interaction.rating > 0).length,
  }), [interactions]);

  const profile = useMemo(() => {
    const username = userProfile?.username || user?.user_metadata?.username || 'Usuario Coffee';

    return {
      id: user?.id,
      username,
      handle: user?.email?.split('@')[0] || username,
      avatarUrl: userProfile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(username)}`,
      coverUrl: userProfile?.cover_url || '',
      textColor: userProfile?.text_color || '#E6DAC1',
      role: userProfile?.role || 'usuario',
      stats,
    };
  }, [stats, user, userProfile]);

  const visitedPlaces = useMemo(() => {
    return interactions
      .filter((interaction) => interaction.is_visited)
      .map((interaction) => ({
        ...interaction,
        cafe: interaction.cafe || cafeById.get(interaction.cafe_id),
      }))
      .filter((interaction) => interaction.cafe)
      .sort((a, b) => (b.visited_on || b.updated_at || '').localeCompare(a.visited_on || a.updated_at || ''));
  }, [cafeById, interactions]);

  const favoritePlaces = useMemo(() => {
    return interactions
      .filter((interaction) => interaction.is_favorite)
      .map((interaction) => interaction.cafe || cafeById.get(interaction.cafe_id))
      .filter(Boolean);
  }, [cafeById, interactions]);

  const topVisitedPlaces = visitedPlaces.slice(0, 5);
  const recentCafes = topVisitedPlaces.length > 0
    ? topVisitedPlaces.map((visit) => visit.cafe).filter(Boolean).slice(0, 3)
    : cafes.slice(0, 3);

  const persistProfileUpdates = async (updates) => {
    if (!user?.id) return;

    const payload = {
      updated_at: new Date().toISOString(),
      ...updates,
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select('id,username,avatar_url,cover_url,text_color,role')
      .single();

    if (error) throw error;
    updateCachedProfile(data);
  };

  const uploadProfileImage = async (event, kind) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        throw new Error('Selecciona una imagen válida.');
      }

      if (file.size > 8 * 1024 * 1024) {
        throw new Error('La imagen debe pesar menos de 8 MB.');
      }

      setShowSettings(false);
      setUploadingField(kind);
      const optimizedFile = await optimizeProfileImage(file, kind);
      const fileName = getProfileAssetPath(user.id, kind, optimizedFile);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, optimizedFile, {
          contentType: optimizedFile.type,
          cacheControl: '31536000',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const field = kind === 'cover' ? 'cover_url' : 'avatar_url';
      await persistProfileUpdates({ [field]: data.publicUrl });
    } catch (error) {
      alert(getProfileSaveErrorMessage(error));
    } finally {
      setUploadingField('');
      event.target.value = '';
    }
  };

  const updateTextColor = async (textColor) => {
    try {
      setSavingColor(true);
      await persistProfileUpdates({ text_color: textColor });
    } catch (error) {
      alert(getProfileSaveErrorMessage(error));
    } finally {
      setSavingColor(false);
    }
  };

  const previewAndSaveTextColor = (textColor) => {
    setDraftTextColor(textColor);
    window.clearTimeout(colorSaveTimerRef.current);
    colorSaveTimerRef.current = window.setTimeout(() => {
      void updateTextColor(textColor);
    }, 350);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const shareProfile = async () => {
    const shareUrl = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Coffee Map', text: profile.username, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copiado.');
      }
    } catch {
      // User cancelled native share.
    }
  };

  if (!user || !interactionsLoaded || (interactionsLoading && interactions.length === 0)) {
    return <PageLoading message="Cargando perfil..." />;
  }

  const textStyle = { color: draftTextColor };
  const avatarDisplayUrl = getOptimizedProfileImageUrl(profile.avatarUrl, 512);
  const avatarViewerUrl = getOptimizedProfileImageUrl(profile.avatarUrl, 1024);
  const coverStyle = profile.coverUrl
    ? { backgroundImage: `url(${profile.coverUrl})` }
    : undefined;

  return (
    <main className="profile-page" style={textStyle}>
      <section className="profile-scroll">
        <header className="profile-hero">
          <div
            className="profile-cover"
            style={coverStyle}
            role="img"
            aria-label={profile.coverUrl ? `Portada de ${profile.username}` : 'Portada predeterminada del perfil'}
          >
            <div className="absolute inset-0 bg-linear-to-b from-black/35 via-[#1D1A15]/20 to-[#1D1A15]" />
            {!profile.coverUrl && (
              <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_30%_20%,#765446,transparent_34%),radial-gradient(circle_at_70%_30%,#B39978,transparent_30%),linear-gradient(135deg,#372821,#1D1A15)]" />
            )}
          </div>

          <label
            className="profile-cover-edit"
            aria-label="Cambiar foto de portada"
            aria-hidden={showSettings || undefined}
          >
            {uploadingField === 'cover' ? <Loader2 className="animate-spin" size={15} /> : <Camera size={15} />}
            <span>Cambiar portada</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => uploadProfileImage(event, 'cover')}
              disabled={Boolean(uploadingField)}
              className="hidden"
            />
          </label>

          <div className={`relative flex items-center justify-between ${showSettings ? 'z-50' : 'z-20'}`}>
            <button onClick={() => navigate('/')} className="profile-icon-button">
              <ArrowLeft size={22} />
            </button>

            <div className="relative" ref={settingsMenuRef}>
              <button
                onClick={() => setShowSettings((current) => !current)}
                className="profile-icon-button"
                aria-label="Abrir configuración"
                aria-expanded={showSettings}
                aria-controls="profile-settings-menu"
              >
                <Settings size={21} />
              </button>

              {showSettings && (
                <>
                  <button
                    type="button"
                    className="profile-settings-backdrop"
                    onClick={() => setShowSettings(false)}
                    aria-label="Cerrar configuración"
                  />
                  <div id="profile-settings-menu" className="profile-settings-panel" role="menu">
                    <p className="profile-settings-title">Configuración</p>
                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-sm font-bold">
                      <Camera size={16} />
                      Cambiar portada
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => uploadProfileImage(event, 'cover')}
                        disabled={Boolean(uploadingField)}
                        className="hidden"
                      />
                    </label>

                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-sm font-bold">
                      <Camera size={16} />
                      Cambiar avatar
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => uploadProfileImage(event, 'avatar')}
                        disabled={Boolean(uploadingField)}
                        className="hidden"
                      />
                    </label>

                    <button
                      onClick={() => {
                        setShowSettings(false);
                        navigate('/settings');
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm font-bold"
                    >
                      <SlidersHorizontal size={16} />
                      Ajustes
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full mt-1 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm font-bold text-red-300"
                    >
                      <LogOut size={16} />
                      Salir
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="profile-identity">
            <div
              className="relative profile-avatar-wrap"
              role="button"
              tabIndex={0}
              aria-label="Mantén pulsado para ver la foto de perfil"
              onPointerDown={startAvatarPress}
              onPointerUp={cancelAvatarPress}
              onPointerCancel={cancelAvatarPress}
              onPointerLeave={cancelAvatarPress}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div className="profile-avatar">
                <img
                  src={avatarDisplayUrl}
                  alt={profile.username}
                  width="320"
                  height="320"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={(event) => {
                    if (event.currentTarget.src !== profile.avatarUrl) event.currentTarget.src = profile.avatarUrl;
                  }}
                  className={`w-full h-full object-cover ${uploadingField === 'avatar' ? 'opacity-50' : ''}`}
                />
              </div>
              {uploadingField === 'avatar' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin" size={22} />
                </div>
              )}
            </div>

            <div className="profile-identity-copy">
              <h1 className="profile-name" style={textStyle}>
                {profile.username}
              </h1>
              <p className="profile-handle" style={textStyle}>
                @{profile.handle}
              </p>
            </div>

            <div className="profile-stats" aria-label="Estadísticas del perfil">
              <button type="button" onClick={() => openProfileTab('visited')}>
                <strong>{profile.stats.visited}</strong><span>Visitadas</span>
              </button>
              <button type="button" onClick={() => navigate('/favorites')}>
                <strong>{profile.stats.favorites}</strong><span>Favoritas</span>
              </button>
              <button type="button" onClick={() => navigate('/reviews')}>
                <strong>{profile.stats.reviews}</strong><span>Reviews</span>
              </button>
              <button type="button" onClick={() => navigate('/list')}>
                <strong>{profile.stats.waitingList}</strong><span>Lista</span>
              </button>
              <button type="button" onClick={() => navigate('/ratings')}>
                <strong>{profile.stats.rated}</strong><span>Calificadas</span>
              </button>
            </div>
          </div>
        </header>

        <nav className="profile-navigation" aria-label="Secciones del perfil">
          <button type="button" className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => openProfileTab('profile')}>Perfil</button>
          <button type="button" className={activeTab === 'activity' ? 'is-active' : ''} onClick={() => openProfileTab('activity')}>Actividad</button>
          <button type="button" className={activeTab === 'visited' ? 'is-active' : ''} onClick={() => openProfileTab('visited')}>Visitadas</button>
          <button type="button" className={activeTab === 'friends' ? 'is-active' : ''} onClick={() => openProfileTab('friends')}>Amigos</button>
          <button type="button" onClick={() => navigate('/reviews')}>Reviews</button>
          <button type="button" onClick={() => navigate('/list')}>Lista</button>
          <button type="button" onClick={() => navigate('/favorites')}>Favoritos</button>
        </nav>

        {activeTab === 'profile' && <div className="profile-content-grid">
        <section className="profile-recent-section">
          <div className="profile-section-heading">
            <h2 style={textStyle}>Lugares recientemente visitados</h2>
            <button type="button" style={textStyle} onClick={() => openProfileTab('visited')}>Ver más</button>
          </div>

          <div className="profile-recent-row">
            {recentCafes.length > 0 ? (
              recentCafes.map((cafe) => (
                  <button
                    key={cafe.id}
                    type="button"
                    onClick={() => navigate(`/cafe/${cafe.id}`)}
                    className="profile-cafe-card"
                  >
                    {cafe.imageUrl ? (
                      <img src={cafe.imageUrl} alt={cafe.nombre} />
                    ) : (
                      <div className="profile-cafe-placeholder">
                        <Coffee className="opacity-40" size={24} />
                      </div>
                    )}
                    <div className="profile-cafe-copy">
                      <strong>{cafe.nombre}</strong>
                      <span><Star size={9} fill="currentColor" /> {Number(cafe.rating || 4.5).toFixed(1)}</span>
                      <span title={cafe.address || 'Dirección no disponible'}><MapPin size={9} /> {getCafeNeighborhood(cafe)}</span>
                    </div>
                  </button>
                ))
            ) : (
              <div className="profile-empty-recent">
                <Coffee className="opacity-45 mb-2" size={28} />
                <p className="text-sm opacity-70" style={textStyle}>Marca cafeterías como visitadas para llenar esta sección.</p>
              </div>
            )}
          </div>
        </section>

        <section className="profile-shortcuts-section">
          <div className="profile-shortcuts">
            <button className="profile-shortcut profile-shortcut-dark" onClick={() => navigate('/favorites')}>
              <Heart className="fill-current" size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Favoritos</span>
              <span className="sr-only">{profile.stats.favorites}</span>
            </button>

            <button className="profile-shortcut profile-shortcut-mid" onClick={() => navigate('/reviews')}>
              <BookOpen size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Reviews</span>
              <span className="sr-only">{profile.stats.reviews}</span>
            </button>

            <button className="profile-shortcut profile-shortcut-light" onClick={() => navigate('/list')}>
              <ListPlus size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Lista</span>
              <span className="sr-only">{profile.stats.waitingList}</span>
            </button>

            <button className="profile-shortcut profile-shortcut-light" onClick={() => navigate('/ratings')}>
              <Star className="fill-current" size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Calificadas</span>
              <span className="sr-only">{profile.stats.rated}</span>
            </button>
          </div>
        </section>

        {favoritePlaces.length > 0 && (
          <section className="profile-favorites-section">
            <h2 className="text-base font-semibold mb-3" style={textStyle}>Favoritos recientes</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
              {favoritePlaces.slice(0, 8).map((cafe) => (
                <button
                  key={cafe.id}
                  type="button"
                  onClick={() => navigate(`/cafe/${cafe.id}`)}
                  className="w-30 h-20 rounded-2xl bg-[#372821] overflow-hidden shrink-0 relative"
                >
                  {cafe.imageUrl ? (
                    <img src={cafe.imageUrl} alt={cafe.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <Coffee className="opacity-40" size={24} />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-linear-to-t from-black/70 to-transparent">
                    <p className="text-[10px] text-white font-bold truncate">{cafe.nombre}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
        </div>}

        {activeTab === 'activity' && <section className="profile-tab-panel profile-activity-panel"><ActivityFeed userIdFilter={user.id} compact /></section>}

        {activeTab === 'visited' && (
          <section className="profile-tab-panel">
            <div className="profile-tab-heading"><div><small>TUS LUGARES</small><h2>Visitadas</h2></div><span>{visitedPlaces.length}</span></div>
            <div className="profile-visited-grid">
              {visitedPlaces.map(({ cafe, rating: visitRating, id: visitId }) => (
                <button type="button" key={visitId} onClick={() => navigate(`/cafe/${cafe.id}`)}>
                  {cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} /> : <div className="profile-cafe-placeholder"><Coffee size={26} /></div>}
                  <strong>{cafe.nombre}</strong>
                  <span><Star size={11} fill="currentColor" /> {Number(visitRating || cafe.rating || 0).toFixed(1)} <b><MapPin size={10} /> {getCafeNeighborhood(cafe)}</b></span>
                </button>
              ))}
            </div>
            {visitedPlaces.length === 0 && <div className="profile-tab-empty"><Coffee size={30} /><p>Aún no has marcado cafeterías como visitadas.</p></div>}
          </section>
        )}

        {activeTab === 'friends' && <FriendsPanel userId={user.id} />}
      </section>

      {showAvatarViewer && (
        <div className="profile-avatar-viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAvatarViewer(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Foto de perfil">
            <button type="button" onClick={() => setShowAvatarViewer(false)} aria-label="Cerrar"><X size={20} /></button>
            <img
              src={avatarViewerUrl}
              alt={profile.username}
              width="900"
              height="900"
              decoding="async"
              onError={(event) => {
                if (event.currentTarget.src !== profile.avatarUrl) event.currentTarget.src = profile.avatarUrl;
              }}
            />
            <label><Camera size={16} /> Cambiar foto<input type="file" accept="image/*" onChange={(event) => uploadProfileImage(event, 'avatar')} disabled={Boolean(uploadingField)} hidden /></label>
          </section>
        </div>
      )}

      <div className="profile-bottom-actions">
        <button
          onClick={() => navigate('/new-post')}
          className="profile-bottom-action"
          aria-label="Agregar una reseña"
        >
          <Plus size={13} />
          Agregar
        </button>
        <label className="profile-bottom-action profile-color-action">
          <input
            type="color"
            value={draftTextColor}
            onInput={(event) => previewAndSaveTextColor(event.currentTarget.value)}
            aria-label="Editar el color de la letra"
          />
          {savingColor && <Loader2 className="profile-color-saving animate-spin" size={11} />}
          Editar
        </label>
        <button
          onClick={shareProfile}
          className="profile-bottom-action"
        >
          <Share2 size={13} />
          Compartir
        </button>
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </main>
  );
}

function FriendsPanel({ userId }) {
  const [friendships, setFriendships] = useState([]);
  const [profiles, setProfiles] = useState(new Map());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadFriendships = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('friendships').select('id,requester_id,addressee_id,status,created_at').order('created_at', { ascending: false });
    if (error) {
      setNotice('No se pudieron cargar tus amigos.');
      setLoading(false);
      return;
    }
    const rows = data || [];
    const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.addressee_id]).filter((id) => id !== userId))];
    const { data: people } = ids.length ? await supabase.from('profiles').select('id,username,avatar_url').in('id', ids) : { data: [] };
    setFriendships(rows);
    setProfiles(new Map((people || []).map((person) => [person.id, person])));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(loadFriendships, 0);
    return () => window.clearTimeout(timer);
  }, [loadFriendships]);

  const searchUsers = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) return;
    setNotice('');
    const { data, error } = await supabase.from('profiles').select('id,username,avatar_url').ilike('username', `%${term}%`).neq('id', userId).limit(20);
    if (error) setNotice('No se pudo buscar usuarios.');
    else setResults(data || []);
  };

  const sendRequest = async (personId) => {
    setNotice('');
    const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: personId, status: 'pending' });
    if (error) setNotice(error.code === '23505' ? 'Ya existe una solicitud entre ustedes.' : 'No se pudo enviar la solicitud.');
    else {
      setNotice('Solicitud enviada.');
      await loadFriendships();
    }
  };

  const acceptRequest = async (friendshipId) => {
    const { error } = await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
    setNotice(error ? 'No se pudo aceptar la solicitud.' : 'Ahora son amigos.');
    if (!error) await loadFriendships();
  };

  const removeFriendship = async (friendshipId) => {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    setNotice(error ? 'No se pudo quitar.' : 'Actualizado.');
    if (!error) await loadFriendships();
  };

  const incoming = friendships.filter((row) => row.status === 'pending' && row.addressee_id === userId);
  const accepted = friendships.filter((row) => row.status === 'accepted');
  const relationshipFor = (personId) => friendships.find((row) => row.requester_id === personId || row.addressee_id === personId);
  const getOtherId = (row) => row.requester_id === userId ? row.addressee_id : row.requester_id;

  return (
    <section className="profile-tab-panel friends-panel">
      <div className="profile-tab-heading"><div><small>COMUNIDAD</small><h2>Amigos</h2></div><span>{accepted.length}</span></div>
      <form className="friends-search" onSubmit={searchUsers}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre de usuario" /><button type="submit">Buscar</button></form>
      {notice && <p className="friends-notice">{notice}</p>}

      {incoming.length > 0 && <div className="friends-section"><h3>Solicitudes</h3>{incoming.map((row) => { const person = profiles.get(row.requester_id); return <article key={row.id}><FriendAvatar person={person} /><div><strong>{person?.username || 'Usuario'}</strong><small>Quiere agregarte</small></div><button onClick={() => acceptRequest(row.id)}>Aceptar</button><button className="is-secondary" onClick={() => removeFriendship(row.id)}>Quitar</button></article>; })}</div>}

      {results.length > 0 && <div className="friends-section"><h3>Resultados</h3>{results.map((person) => { const relationship = relationshipFor(person.id); const received = relationship?.status === 'pending' && relationship.addressee_id === userId; return <article key={person.id}><FriendAvatar person={person} /><div><strong>{person.username || 'Usuario'}</strong><small>{relationship?.status === 'accepted' ? 'Ya son amigos' : relationship ? 'Solicitud pendiente' : 'Coffee lover'}</small></div>{received ? <button onClick={() => acceptRequest(relationship.id)}>Aceptar</button> : <button disabled={Boolean(relationship)} onClick={() => sendRequest(person.id)}><UserPlus size={14} /> {relationship ? 'Enviada' : 'Agregar'}</button>}</article>; })}</div>}

      <div className="friends-section"><h3>Mis amigos</h3>{loading && <p className="friends-empty">Cargando…</p>}{!loading && accepted.length === 0 && <div className="friends-empty"><Users size={25} /><p>Busca usuarios para empezar tu círculo cafetero.</p></div>}{accepted.map((row) => { const person = profiles.get(getOtherId(row)); return <article key={row.id}><FriendAvatar person={person} /><div><strong>{person?.username || 'Usuario'}</strong><small>Amigo</small></div><button className="is-secondary" onClick={() => removeFriendship(row.id)}>Quitar</button></article>; })}</div>
    </section>
  );
}

function FriendAvatar({ person }) {
  const src = person?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(person?.username || 'coffee-friend')}`;
  return <img src={src} alt="" />;
}

export default ProfilePage;
