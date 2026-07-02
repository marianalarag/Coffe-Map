import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, MapPin, ExternalLink, Coffee, Heart, CheckCircle2, Clock, Edit3, Save } from 'lucide-react';
import PageLoading from '../components/PageLoading';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';

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
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [savingInteraction, setSavingInteraction] = useState(false);

  useEffect(() => {
    if (!cafesLoaded) {
      loadCafes().catch(() => {});
    }
  }, [cafesLoaded, loadCafes]);

  useEffect(() => {
    setIsVisited(interaction?.is_visited || false);
    setIsFavorite(interaction?.is_favorite || false);
    setInWaitlist(interaction?.in_waitlist || false);
    setRating(interaction?.rating || 0);
    setReviewText(interaction?.review_text || '');
  }, [interaction, id]);

  const saveInteraction = async (updates) => {
    if (!user || !cafe) return;

    const hasUpdate = (key) => Object.prototype.hasOwnProperty.call(updates, key);
    setSavingInteraction(true);
    try {
      await saveCafeInteraction(cafe.id, {
        is_visited: hasUpdate('is_visited') ? updates.is_visited : isVisited,
        is_favorite: hasUpdate('is_favorite') ? updates.is_favorite : isFavorite,
        in_waitlist: hasUpdate('in_waitlist') ? updates.in_waitlist : inWaitlist,
        rating: hasUpdate('rating') ? updates.rating : (rating === 0 ? null : rating),
        review_text: hasUpdate('review_text') ? updates.review_text : reviewText,
      });
    } catch (error) {
      console.error('Error al guardar interaccion', error);
    } finally {
      setSavingInteraction(false);
    }
  };

  const toggleVisited = () => {
    const nextValue = !isVisited;
    setIsVisited(nextValue);
    saveInteraction({ is_visited: nextValue });
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

  const handleSaveReview = () => {
    setIsEditingReview(false);
    saveInteraction({ rating: rating === 0 ? null : rating, review_text: reviewText });
  };

  if ((cafesLoading && !cafesLoaded) || (interactionsLoading && !interaction)) {
    return <PageLoading message="Cargando cafeteria..." />;
  }

  if (!cafe) {
    return (
      <main className="h-screen w-full bg-[#1D1A15] flex flex-col items-center justify-center p-4">
        <p className="text-xl text-[#E6DAC1]/60 mb-4">Cafeteria no encontrada</p>
        <button onClick={() => navigate('/')} className="bg-[#372821] text-[#E6DAC1] px-6 py-3 rounded-full font-bold hover:bg-[#493A33] transition-colors">
          Volver al mapa
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#1D1A15] flex flex-col relative pb-10">
      <button onClick={() => navigate(-1)} className="fixed top-6 left-6 z-50 w-10 h-10 rounded-full bg-black/70 backdrop-blur-md hover:bg-black/80 flex items-center justify-center transition-colors shadow-lg">
        <ArrowLeft className="text-[#E6DAC1]" size={24} />
      </button>

      <div className="h-[40vh] w-full relative shrink-0">
        {cafe.imageUrl ? (
          <img src={cafe.imageUrl} alt={cafe.nombre} className="w-full h-full object-cover" />
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

          <div className="flex items-center gap-4 mt-2 mb-4 w-fit">
            <div className="flex items-center gap-1 bg-[#372821] px-3 py-1.5 rounded-full">
              <Star className="text-yellow-500 fill-yellow-500" size={16} />
              <span className="font-bold text-[#E6DAC1]">{cafe.rating || 'N/A'}</span>
            </div>
            <span className="text-[#E6DAC1]/50 text-sm font-medium">
              {cafe.reviews || 0} reseñas globales
            </span>
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
        </div>

        <div className="bg-[#27201A] rounded-4xl p-6 shadow-xl w-full border border-white/5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-[#E6DAC1] text-lg">Mi reseña</h3>
            {!isEditingReview && (
              <button onClick={() => setIsEditingReview(true)} className="text-[#E6DAC1]/50 hover:text-[#E6DAC1]">
                <Edit3 size={18} />
              </button>
            )}
          </div>

          {isEditingReview ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2 justify-center py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={32}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className={`cursor-pointer transition-all ${star <= (hoverRating || rating) ? 'text-yellow-400 fill-yellow-400' : 'text-[#372821] fill-[#372821]'}`}
                  />
                ))}
              </div>

              <textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                placeholder="Que tal estuvo el cafe? Y el internet?"
                className="w-full bg-[#1D1A15] text-[#E6DAC1] p-4 rounded-2xl outline-none min-h-30 resize-none border border-white/5 focus:border-[#E6DAC1]/30"
              />

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setIsEditingReview(false)}
                  className="flex-1 py-3 text-[#E6DAC1]/50 font-bold hover:bg-[#372821] rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveReview}
                  disabled={savingInteraction}
                  className="flex-1 bg-[#372821] hover:bg-[#493A33] text-[#E6DAC1] py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-white/10 disabled:opacity-60"
                >
                  <Save size={18} /> {savingInteraction ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
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
                <p className="text-center text-[#E6DAC1]/30 text-sm mb-4">Aun no has calificado este lugar</p>
              )}

              {reviewText ? (
                <p className="text-[#E6DAC1] text-sm bg-[#1D1A15] p-4 rounded-2xl border border-white/5 italic text-center">
                  "{reviewText}"
                </p>
              ) : (
                <button onClick={() => setIsEditingReview(true)} className="w-full py-4 border-2 border-dashed border-[#372821] hover:border-[#372821]/80 rounded-2xl text-[#E6DAC1]/40 font-bold text-sm transition-colors">
                  Escribir reseña...
                </button>
              )}
            </div>
          )}
        </div>

        {cafe.link && (
          <a href={cafe.link} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-3 p-4 rounded-2xl bg-[#372821] hover:bg-[#493A33] transition-colors text-[#E6DAC1] border border-white/5">
            <MapPin size={24} className="shrink-0 text-blue-400" />
            <span className="font-bold">Ver en Google Maps</span>
            <ExternalLink size={18} className="ml-auto opacity-50" />
          </a>
        )}
      </div>
    </main>
  );
}

export default CafePage;
