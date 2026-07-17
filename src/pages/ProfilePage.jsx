import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  Check,
  Coffee,
  Edit3,
  Heart,
  ListPlus,
  Loader2,
  LogOut,
  Plus,
  Settings,
  Share2,
  Star,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { supabase } from '../supabase';

const TEXT_COLORS = ['#E6DAC1', '#FFFFFF', '#F2C6A0', '#C8E6C9', '#B9D7FF', '#F4B8C4'];

const getProfileAssetPath = (userId, kind, file) => {
  const fileExt = file.name.split('.').pop() || 'png';
  const fileId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  return `${userId}/${kind}-${fileId}.${fileExt}`;
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
    cafesLoaded,
    cafesLoading,
    loadCafes,
    interactions,
    interactionsLoading,
  } = useCoffeeData();
  const navigate = useNavigate();

  const [uploadingField, setUploadingField] = useState('');
  const [savingColor, setSavingColor] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes, navigate, user]);

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
        cafe: cafeById.get(interaction.cafe_id),
      }))
      .filter((interaction) => interaction.cafe)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }, [cafeById, interactions]);

  const favoritePlaces = useMemo(() => {
    return interactions
      .filter((interaction) => interaction.is_favorite)
      .map((interaction) => cafeById.get(interaction.cafe_id))
      .filter(Boolean);
  }, [cafeById, interactions]);

  const topVisitedPlaces = visitedPlaces.slice(0, 5);

  const persistProfileUpdates = async (updates) => {
    if (!user?.id) return;

    const payload = {
      id: user.id,
      username: profile.username,
      role: profile.role,
      updated_at: new Date().toISOString(),
      ...updates,
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) throw error;
    updateCachedProfile(payload);
  };

  const uploadProfileImage = async (event, kind) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingField(kind);
      const fileName = getProfileAssetPath(user.id, kind, file);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

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

  if (!user || ((cafesLoading && !cafesLoaded) || interactionsLoading)) {
    return <PageLoading message="Cargando perfil..." />;
  }

  const textStyle = { color: profile.textColor };
  const coverStyle = profile.coverUrl
    ? { backgroundImage: `url(${profile.coverUrl})` }
    : undefined;

  return (
    <main className="h-full w-full bg-[#1D1A15] relative overflow-hidden" style={textStyle}>
      <section className="h-full overflow-y-auto pb-30">
        <header className="relative min-h-[270px] px-5 pt-8">
          <div
            className="absolute inset-x-0 top-0 h-56 bg-[#372821] bg-cover bg-center"
            style={coverStyle}
          >
            <div className="absolute inset-0 bg-linear-to-b from-black/35 via-[#1D1A15]/20 to-[#1D1A15]" />
            {!profile.coverUrl && (
              <div className="absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_30%_20%,#765446,transparent_34%),radial-gradient(circle_at_70%_30%,#B39978,transparent_30%),linear-gradient(135deg,#372821,#1D1A15)]" />
            )}
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center hover:bg-black/40 transition-colors"
            >
              <ArrowLeft size={22} />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowSettings((current) => !current)}
                className="w-10 h-10 rounded-full bg-black/25 backdrop-blur-md flex items-center justify-center hover:bg-black/40 transition-colors"
              >
                <Settings size={21} />
              </button>

              {showSettings && (
                <div className="absolute top-12 right-0 w-56 rounded-2xl bg-[#27201A]/95 p-3 shadow-2xl border border-white/10 backdrop-blur-xl z-30">
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
                    onClick={handleLogout}
                    className="w-full mt-1 flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm font-bold text-red-300"
                  >
                    <LogOut size={16} />
                    Salir
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-center pt-9">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-[#493A33] border border-white/15 shadow-2xl">
                <img
                  src={profile.avatarUrl}
                  alt={profile.username}
                  className={`w-full h-full object-cover ${uploadingField === 'avatar' ? 'opacity-50' : ''}`}
                />
              </div>
              {uploadingField === 'avatar' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="animate-spin" size={22} />
                </div>
              )}
            </div>

            <h1 className="mt-3 text-base font-semibold leading-tight" style={textStyle}>
              {profile.username}
            </h1>
            <p className="mt-1 text-[10px] opacity-75" style={textStyle}>
              {profile.handle}
            </p>
          </div>
        </header>

        <section className="px-5 -mt-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={textStyle}>Where has been</h2>
            <button className="text-[10px] font-semibold opacity-75" style={textStyle}>See all</button>
          </div>

          <div className="rounded-2xl overflow-hidden bg-[#372821] border border-white/10 shadow-xl">
            {topVisitedPlaces.length > 0 ? (
              <div className="grid grid-cols-5 h-32">
                {topVisitedPlaces.map((visit) => (
                  <button
                    key={visit.id}
                    type="button"
                    onClick={() => navigate(`/cafe/${visit.cafe_id}`)}
                    className="relative overflow-hidden bg-[#493A33]"
                  >
                    {visit.cafe.imageUrl ? (
                      <img src={visit.cafe.imageUrl} alt={visit.cafe.nombre} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Coffee className="opacity-40" size={24} />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 min-h-10 bg-linear-to-t from-black/65 to-transparent" />
                    <span className="absolute left-2 right-2 bottom-2 text-[9px] font-bold text-white truncate">
                      {visit.cafe.nombre}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="h-32 flex flex-col items-center justify-center text-center px-6">
                <Coffee className="opacity-45 mb-2" size={28} />
                <p className="text-sm opacity-70" style={textStyle}>Marca cafeterias como visitadas para llenar tu portada.</p>
              </div>
            )}
          </div>
        </section>

        <section className="px-5 mt-7">
          <div className="grid grid-cols-2 gap-5">
            <button className="h-34 rounded-[28px] bg-[#3A281F] p-6 text-left flex flex-col justify-between shadow-xl">
              <Heart className="fill-current" size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Favoritos</span>
              <span className="sr-only">{profile.stats.favorites}</span>
            </button>

            <button className="h-34 rounded-[28px] bg-[#493A33] p-6 text-left flex flex-col justify-between shadow-xl">
              <BookOpen size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Reviews</span>
              <span className="sr-only">{profile.stats.reviews}</span>
            </button>

            <button className="h-34 rounded-[28px] bg-[#765446] p-6 text-left flex flex-col justify-between shadow-xl">
              <ListPlus size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Lista</span>
              <span className="sr-only">{profile.stats.waitingList}</span>
            </button>

            <button className="h-34 rounded-[28px] bg-[#765446] p-6 text-left flex flex-col justify-between shadow-xl">
              <Star className="fill-current" size={34} style={textStyle} />
              <span className="text-sm font-medium" style={textStyle}>Calificadas</span>
              <span className="sr-only">{profile.stats.rated}</span>
            </button>
          </div>
        </section>

        <section className="px-5 mt-7">
          <div className="rounded-3xl bg-[#27201A] border border-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold" style={textStyle}>Color de letra</span>
              {savingColor && <Loader2 className="animate-spin opacity-60" size={16} />}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => updateTextColor(color)}
                  className="w-9 h-9 rounded-full border border-white/20 flex items-center justify-center"
                  style={{ backgroundColor: color }}
                  aria-label={`Usar color ${color}`}
                >
                  {profile.textColor.toLowerCase() === color.toLowerCase() && (
                    <Check className="text-[#1D1A15]" size={18} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>

        {favoritePlaces.length > 0 && (
          <section className="px-5 mt-7">
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
      </section>

      <div className="absolute left-1/2 bottom-18 z-[35] -translate-x-1/2 w-[min(380px,calc(100%-24px))] grid grid-cols-3 gap-3">
        <button
          onClick={() => navigate('/search')}
          className="h-8 rounded-full bg-[#E6DAC1]/75 text-[#372821] text-[11px] font-semibold flex items-center justify-center gap-1.5"
        >
          <Plus size={13} />
          Agregar
        </button>
        <label className="h-8 rounded-full bg-[#E6DAC1]/75 text-[#372821] text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
          <Edit3 size={13} />
          Editar
          <input
            type="file"
            accept="image/*"
            onChange={(event) => uploadProfileImage(event, 'cover')}
            disabled={Boolean(uploadingField)}
            className="hidden"
          />
        </label>
        <button
          onClick={shareProfile}
          className="h-8 rounded-full bg-[#E6DAC1]/75 text-[#372821] text-[11px] font-semibold flex items-center justify-center gap-1.5"
        >
          <Share2 size={13} />
          Compartir
        </button>
      </div>

      <BottomNav />

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

export default ProfilePage;
