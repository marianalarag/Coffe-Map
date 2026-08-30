import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, MapPin, Coffee, Heart, CheckCircle2, Clock, Edit3 } from 'lucide-react';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { supabase } from '../supabase';

const MAP_TARGET_STORAGE_KEY = 'coffee-map:focus-cafe';
const getLocalDate = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
};

function CafePage({ cafeId }) {
  const { id: routeCafeId } = useParams();
  const id = cafeId ?? routeCafeId;
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    cafeById,
    cafesLoaded,
    cafesLoading,
    loadCafes,
    interactionsByCafeId,
    interactionsLoading,
    saveCafeInteraction,
  } = useCoffeeData();

  const cafe = cafeById.get(id) || null;
  const interaction = interactionsByCafeId.get(id);

  const [isVisited, setIsVisited] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [inWaitlist, setInWaitlist] = useState(false);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [communityPhotos, setCommunityPhotos] = useState([]);

  useEffect(() => {
    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes]);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('cafe_photos')
      .select('id,public_url,is_cover,created_at')
      .eq('cafe_id', id)
      .eq('status', 'approved')
      .order('is_cover', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12)
      .then(({ data }) => setCommunityPhotos(data || []));
  }, [id]);

  useEffect(() => {
    setIsVisited(interaction?.is_visited || false);
    setIsFavorite(interaction?.is_favorite || false);
    setInWaitlist(interaction?.in_waitlist || false);
    setRating(Number(interaction?.rating) || 0);
    setReviewText(interaction?.review_text || '');
  }, [interaction, id]);

  const saveInteraction = async (updates) => {
    if (!user || !cafe) return;

    const hasUpdate = (key) => Object.prototype.hasOwnProperty.call(updates, key);
    setSavingInteraction(true);
    setSaveError('');
    try {
      const savedInteraction = await saveCafeInteraction(cafe.id, {
        is_visited: hasUpdate('is_visited') ? updates.is_visited : isVisited,
        is_favorite: hasUpdate('is_favorite') ? updates.is_favorite : isFavorite,
        in_waitlist: hasUpdate('in_waitlist') ? updates.in_waitlist : inWaitlist,
        rating: hasUpdate('rating') ? updates.rating : (rating === 0 ? null : rating),
        review_text: hasUpdate('review_text') ? updates.review_text : reviewText,
        ...(hasUpdate('visited_on') ? { visited_on: updates.visited_on } : {}),
      });
      return savedInteraction;
    } catch (error) {
      console.error('Error al guardar interaccion', error);
      setSaveError('No pudimos guardar tu reseña. Intenta otra vez.');
      return false;
    } finally {
      setSavingInteraction(false);
    }
  };

  const toggleVisited = () => {
    const nextValue = !isVisited;
    setIsVisited(nextValue);
    saveInteraction({ is_visited: nextValue, ...(nextValue ? { visited_on: getLocalDate() } : {}) });
  };

  const toggleFavorite = () => {
    const nextValue = !isFavorite;
    setIsFavorite(nextValue);
    saveInteraction({ is_favorite: nextValue });
  };

  const toggleWaitlist = () => {
    const nextValue = !inWaitlist;
    setInWaitlist(nextValue);
    saveInteraction({ in_waitlist: nextValue });
  };

  const openReviewComposer = () => {
    if (!cafe) return;
    navigate(`/new-post?cafe=${encodeURIComponent(cafe.id)}`);
  };

  const showInAppMap = () => {
    if (!cafe) return;

    window.sessionStorage.setItem(MAP_TARGET_STORAGE_KEY, JSON.stringify({
      id: cafe.id,
      nombre: cafe.nombre,
      lat: cafe.lat,
      lng: cafe.lng,
    }));

    navigate('/map');
  };

  const personalStatusItems = [
    isVisited && { label: 'Ya fui', className: 'bg-[#4B6B40]/20 text-[#8BC34A] border-[#8BC34A]/40' },
    isFavorite && { label: 'Favorita', className: 'bg-red-500/15 text-red-300 border-red-400/30' },
    inWaitlist && { label: 'Ir luego', className: 'bg-blue-500/15 text-blue-300 border-blue-400/30' },
  ].filter(Boolean);

  if ((cafesLoading && !cafesLoaded) || (interactionsLoading && !interaction)) {
    return <PageLoading message="Cargando cafeteria..." />;
  }

  if (!cafe) {
    return (
      <main className="h-screen w-full bg-[#1D1A15] flex flex-col items-center justify-center p-4">
        <p className="text-xl text-[#E6DAC1]/60 mb-4">Cafeteria no encontrada</p>
        <button onClick={() => navigate('/map')} className="bg-[#372821] text-[#E6DAC1] px-6 py-3 rounded-full font-bold hover:bg-[#493A33] transition-colors">
          Volver al mapa
        </button>
      </main>
    );
  }

  return (
    <main className="h-full w-full bg-[#1D1A15] flex flex-col relative pb-10 overflow-y-auto">
      <button onClick={() => navigate(-1)} className="cafe-back-button fixed left-6 z-50 w-10 h-10 rounded-full bg-black/70 backdrop-blur-md hover:bg-black/80 flex items-center justify-center transition-colors shadow-lg">
        <ArrowLeft className="text-[#E6DAC1]" size={24} />
      </button>

      <div className="h-[40vh] w-full relative shrink-0">
        {cafe.imageUrl ? (
          <>
            <img src={cafe.imageUrl} alt={cafe.nombre} className="w-full h-full object-cover" />
            {cafe.imageSourceUrl && (
              <a href={cafe.imageSourceUrl} target="_blank" rel="noreferrer" className="cafe-image-credit">
                Foto: {cafe.imageAttribution || 'Wikimedia Commons'}{cafe.imageLicense ? ` · ${cafe.imageLicense}` : ''}
              </a>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#372821]/10">
            <Coffee className="text-[#372821]/30" size={80} />
          </div>
        )}
        <div className="absolute bottom-0 left-0 w-full h-24 bg-linear-to-t from-[#1D1A15] to-transparent"></div>
      </div>

      <div className="flex flex-col -mt-10 relative z-10 px-4">
        <div className="bg-[#27201A] rounded-4xl p-6 shadow-xl w-full border border-white/5 mb-6">
          <h1 className="text-2xl font-black text-[#E6DAC1] mb-2 leading-tight uppercase font-lancelot truncate">
            {cafe.nombre}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
            <div className="flex items-center gap-1 bg-[#372821] px-3 py-1.5 rounded-full">
              <Star className={rating > 0 ? 'text-yellow-500 fill-yellow-500' : 'text-[#E6DAC1]/35'} size={16} />
              <span className="font-bold text-[#E6DAC1]">{rating > 0 ? rating : 'Sin calificar'}</span>
            </div>
            {personalStatusItems.map((item) => (
              <span key={item.label} className={`border px-3 py-1.5 rounded-full text-sm font-bold ${item.className}`}>
                {item.label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={toggleVisited}
              disabled={savingInteraction}
              className={`flex flex-col items-center py-3 rounded-2xl transition-colors disabled:opacity-60 ${isVisited ? 'bg-[#4B6B40]/20 text-[#8BC34A] border border-[#8BC34A]/50' : 'bg-[#372821] text-[#E6DAC1]/50'}`}
            >
              <CheckCircle2 size={24} className="mb-1" />
              <span className="text-xs font-bold">Fui</span>
            </button>
            <button
              onClick={toggleFavorite}
              disabled={savingInteraction}
              className={`flex flex-col items-center py-3 rounded-2xl transition-colors disabled:opacity-60 ${isFavorite ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-[#372821] text-[#E6DAC1]/50'}`}
            >
              <Heart size={24} className={`mb-1 ${isFavorite ? 'fill-current' : ''}`} />
              <span className="text-xs font-bold">Me gusta</span>
            </button>
            <button
              onClick={toggleWaitlist}
              disabled={savingInteraction}
              className={`flex flex-col items-center py-3 rounded-2xl transition-colors disabled:opacity-60 ${inWaitlist ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' : 'bg-[#372821] text-[#E6DAC1]/50'}`}
            >
              <Clock size={24} className="mb-1" />
              <span className="text-xs font-bold">Ir luego</span>
            </button>
          </div>
          {saveError && <p className="mt-3 text-center text-xs text-red-300" role="alert">{saveError}</p>}
        </div>

        {communityPhotos.length > 0 && (
          <section className="bg-[#27201A] rounded-4xl p-4 shadow-xl w-full border border-white/5 mb-6">
            <div className="px-2 pb-3">
              <h3 className="font-bold text-[#E6DAC1] text-lg">Fotos de la comunidad</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {communityPhotos.map((photo) => (
                <img key={photo.id} src={photo.public_url} alt={cafe.nombre} className="w-full aspect-square object-cover rounded-2xl" />
              ))}
            </div>
          </section>
        )}

        <div className="bg-[#27201A] rounded-4xl p-6 shadow-xl w-full border border-white/5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-[#E6DAC1] text-lg">Mi reseña</h3>
            <button onClick={openReviewComposer} className="text-[#E6DAC1]/50 hover:text-[#E6DAC1]" aria-label="Editar reseña">
              <Edit3 size={18} />
            </button>
          </div>

          <div className="flex flex-col">
            {rating > 0 ? (
              <div className="flex gap-1 mb-3 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={20}
                    className={star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-[#372821] fill-[#372821]'}
                  />
                ))}
              </div>
            ) : (
              <p className="text-center text-[#E6DAC1]/30 text-sm mb-4">Aún no has calificado este lugar</p>
            )}

            {reviewText ? (
              <p className="text-[#E6DAC1] text-sm bg-[#1D1A15] p-4 rounded-2xl border border-white/5 italic text-center">
                “{reviewText}”
              </p>
            ) : (
              <button onClick={openReviewComposer} className="w-full py-4 border-2 border-dashed border-[#372821] hover:border-[#372821]/80 rounded-2xl text-[#E6DAC1]/55 font-bold text-sm transition-colors">
                Escribir reseña...
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#27201A] rounded-4xl p-4 shadow-xl w-full border border-white/5 mb-6">
          <div className="flex items-center px-2 pb-3">
            <h3 className="font-bold text-[#E6DAC1] text-lg">Ubicacion</h3>
          </div>

          <button
            type="button"
            onClick={showInAppMap}
            className="w-full min-h-24 rounded-3xl bg-[#372821] hover:bg-[#493A33] border border-white/10 p-4 text-left transition-colors flex items-center gap-4"
          >
            <span className="w-12 h-12 rounded-full bg-[#E6DAC1]/12 flex items-center justify-center shrink-0">
              <MapPin size={25} className="text-[#E6DAC1]" />
            </span>
            <div className="min-w-0">
              <p className="text-[#E6DAC1] font-black text-base">Ver en el mapa de Coffee Map</p>
              <p className="text-[#E6DAC1]/55 text-sm mt-1 leading-relaxed">{cafe.address || 'Dirección detallada pendiente de verificar'}</p>
            </div>
          </button>
        </div>
      </div>

    </main>
  );
}

export default CafePage;
