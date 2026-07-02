import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { Settings, Coffee, Star, Heart, ArrowLeft, LogOut, Camera, Loader2 } from 'lucide-react';
import BottomNav from '../components/BottomNav';
import PageLoading from '../components/PageLoading';
import { supabase } from '../supabase';

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

  const [uploading, setUploading] = useState(false);
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
    waiting_list: interactions.filter((interaction) => interaction.in_waitlist).length,
    reviews: interactions.filter((interaction) => interaction.review_text?.trim()).length,
    rateds: interactions.filter((interaction) => interaction.rating && interaction.rating > 0).length,
  }), [interactions]);

  const profile = useMemo(() => {
    const username = userProfile?.username || user?.user_metadata?.username || 'Usuario Coffee';

    return {
      id: user?.id,
      username,
      avatar_url: userProfile?.avatar_url || `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(username)}`,
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
      .filter((interaction) => interaction.cafe);
  }, [cafeById, interactions]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const uploadAvatar = async (event) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('Debes seleccionar una imagen para subir.');
      }

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const updates = {
        id: user.id,
        avatar_url: data.publicUrl,
        username: profile.username,
        role: profile.role,
      };

      const { error } = await supabase.from('profiles').upsert(updates);
      if (error) throw error;

      updateCachedProfile(updates);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (!user || ((cafesLoading && !cafesLoaded) || interactionsLoading)) {
    return <PageLoading message="Cargando perfil..." />;
  }

  return (
    <main className="h-full w-full bg-[#1D1A15] flex flex-col relative overflow-hidden">
      <div className="px-6 pt-10 pb-4 flex justify-between items-center z-10">
        <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="text-[#E6DAC1]" size={24} />
        </button>

        <div className="relative">
          <button onClick={() => setShowSettings((current) => !current)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Settings className="text-[#E6DAC1]" size={24} />
          </button>

          {showSettings && (
            <div className="absolute top-12 right-0 bg-[#372821] rounded-2xl p-2 shadow-2xl border border-white/10 min-w-37.5">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-red-400 font-bold hover:bg-white/5 rounded-xl flex items-center gap-2"
              >
                <LogOut size={16} /> Salir
              </button>
            </div>
          )}
        </div>
      </div>

      <section className="flex-1 overflow-y-auto pb-24">
        <div className="flex flex-col items-center mt-2 px-6">
          <div className="relative w-28 h-28 mb-4">
            <div className="w-full h-full rounded-full border-4 border-[#372821] bg-[#493A33] overflow-hidden shadow-xl">
              <img
                src={profile.avatar_url}
                alt="Perfil"
                className={`w-full h-full object-cover ${uploading ? 'opacity-50' : ''}`}
              />
            </div>

            <label className="absolute bottom-0 right-0 bg-[#372821] border-2 border-[#1D1A15] p-2 rounded-full cursor-pointer hover:bg-[#493A33] transition-colors shadow-lg z-10 w-10 h-10 flex items-center justify-center">
              {uploading ? (
                <Loader2 className="text-[#E6DAC1] animate-spin" size={16} />
              ) : (
                <Camera className="text-[#E6DAC1]" size={16} />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={uploadAvatar}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
          <h1 className="text-3xl font-black text-[#E6DAC1] mb-1 font-lancelot tracking-wider">{profile.username}</h1>
        </div>

        <div className="mt-10">
          <div className="flex justify-between items-end px-6 mb-4">
            <h2 className="text-[#E6DAC1] font-bold text-xl">Lugares visitados</h2>
            <span className="text-sm font-bold text-[#E6DAC1]/50">{profile.stats.visited}</span>
          </div>

          <div className="w-full overflow-x-auto pb-4 hide-scrollbar">
            <div className="flex gap-4 px-6 w-max">
              {visitedPlaces.length > 0 ? visitedPlaces.map((visit) => (
                <button
                  key={visit.id}
                  type="button"
                  onClick={() => navigate(`/cafe/${visit.cafe_id}`)}
                  className="w-30 h-30 p-1 rounded-2xl bg-[#372821] shadow-lg flex flex-col overflow-hidden border border-white/5 shrink-0 flex-none snap-start cursor-pointer hover:bg-[#493A33] transition-colors"
                >
                  <div className="h-full w-full flex items-center justify-center relative">
                    {visit.cafe.imageUrl ? (
                      <img src={visit.cafe.imageUrl} alt={visit.cafe.nombre} className="w-full h-full rounded-2xl object-cover" />
                    ) : (
                      <Coffee className="text-[#E6DAC1]/30" size={32} />
                    )}
                  </div>
                </button>
              )) : (
                <div className="w-[80vw] h-32 flex flex-col items-center justify-center border-2 border-dashed border-[#372821] rounded-3xl shrink-0 flex-none">
                  <span className="text-[#E6DAC1]/50 font-bold text-sm">Aun no has visitado cafeterias</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 mt-6 pb-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#372821] rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg border border-white/5">
              <Heart className="text-red-400 mb-2" size={28} />
              <span className="text-2xl font-black text-[#E6DAC1]">{profile.stats.favorites}</span>
              <span className="text-xs text-[#E6DAC1]/50 font-bold uppercase tracking-widest mt-1">Favoritos</span>
            </div>

            <div className="bg-[#372821] rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg border border-white/5">
              <Star className="text-yellow-400 mb-2" size={28} />
              <span className="text-2xl font-black text-[#E6DAC1]">{profile.stats.reviews}</span>
              <span className="text-xs text-[#E6DAC1]/50 font-bold uppercase tracking-widest mt-1">Reviews</span>
            </div>

            <div className="bg-[#372821] rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg border border-white/5">
              <Coffee className="text-orange-300 mb-2" size={28} />
              <span className="text-2xl font-black text-[#E6DAC1]">{profile.stats.waiting_list}</span>
              <span className="text-xs text-[#E6DAC1]/50 font-bold uppercase tracking-widest mt-1">Por visitar</span>
            </div>

            <div className="bg-[#372821] rounded-3xl p-5 flex flex-col items-center justify-center shadow-lg border border-white/5">
              <span className="font-lancelot text-3xl font-bold text-blue-400 mb-1">R</span>
              <span className="text-2xl font-black text-[#E6DAC1]">{profile.stats.rateds}</span>
              <span className="text-xs text-[#E6DAC1]/50 font-bold uppercase tracking-widest mt-1">Clasificados</span>
            </div>
          </div>
        </div>
      </section>

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
