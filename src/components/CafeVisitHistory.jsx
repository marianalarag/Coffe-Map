import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coffee, Heart, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCoffeeData } from '../context/CoffeeDataContext';
import { CoffeeBeanRating } from './CoffeeBeanIcon';
import HalfStarRating from './HalfStarRating';
import { getPersonalCafeRating } from '../utils/personalRating';
import { formatRating } from '../utils/formatRating';

export default function CafeVisitHistory({ cafe, visits, onClose }) {
  const { userProfile } = useAuth();
  const { saveCafeInteraction, deleteCafeInteraction, interactionsByCafeId } = useCoffeeData();
  const dialogRef = useRef(null);
  const [tab, setTab] = useState('diary');
  const [sort, setSort] = useState('recent');
  const [editingId, setEditingId] = useState(null);
  const [text, setText] = useState('');
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const chronological = [...visits].sort((a, b) => String(a.visited_on || a.updated_at || '').localeCompare(String(b.visited_on || b.updated_at || '')) || String(a.id).localeCompare(String(b.id)));
  const visitNumber = new Map(chronological.map((visit, index) => [visit.id, index + 1]));
  const entries = (sort === 'recent' ? [...chronological].reverse() : chronological).filter((visit) => tab !== 'reviews' || visit.review_text?.trim());
  const personalRating = getPersonalCafeRating(visits, cafe.id);
  const favorite = interactionsByCafeId.get(cafe.id)?.is_favorite;
  const username = userProfile?.username || 'Tú';

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  const edit = (visit) => {
    setEditingId(visit.id);
    setText(visit.review_text || '');
    setRating(Number(visit.rating) || 0);
    setError('');
  };
  const save = async (event, visit) => {
    event.preventDefault();
    if (!text.trim() && !rating) { setError('Agrega una calificación o escribe tu reseña.'); return; }
    setSaving(true);
    setError('');
    try {
      await saveCafeInteraction(cafe.id, { rating: rating || null, review_text: text.trim() }, { interactionId: visit.id });
      setEditingId(null);
    } catch { setError('No pudimos guardar la reseña. Intenta otra vez.'); }
    finally { setSaving(false); }
  };
  const remove = async (visit, reviewOnly) => {
    if (!window.confirm(reviewOnly ? '¿Borrar la reseña y calificación de esta visita? La visita se conserva.' : '¿Eliminar esta visita de tu diario?')) return;
    setSaving(true);
    setError('');
    try {
      if (reviewOnly) await saveCafeInteraction(cafe.id, { review_text: '', rating: null }, { interactionId: visit.id });
      else await deleteCafeInteraction(visit.id);
      setEditingId(null);
    } catch { setError('No pudimos guardar el cambio. Intenta otra vez.'); }
    finally { setSaving(false); }
  };

  return createPortal(<dialog ref={dialogRef} className="cafe-diary-dialog" aria-labelledby="cafe-diary-title" onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <header className="cafe-diary-header"><div><small>TU DIARIO CAFETERO</small><h2 id="cafe-diary-title">Tus visitas a {cafe.nombre}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar historial" autoFocus><X size={22} /></button></header>
    <div className="cafe-diary-layout">
      <div className="cafe-diary-main">
        <nav className="cafe-diary-tabs" aria-label="Mostrar historial"><button type="button" className={tab === 'diary' ? 'is-active' : ''} onClick={() => setTab('diary')}>Diario <b>{visits.length}</b></button><button type="button" className={tab === 'reviews' ? 'is-active' : ''} onClick={() => setTab('reviews')}>Reseñas</button><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenar visitas"><option value="recent">Más recientes</option><option value="oldest">Más antiguas</option></select></nav>
        {entries.map((visit) => {
          const number = visitNumber.get(visit.id);
          const dateLabel = visit.visited_on ? new Date(`${visit.visited_on}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Fecha sin registrar';
          const hasReview = Boolean(visit.review_text?.trim() || Number(visit.rating) > 0);
          return <article className="cafe-diary-entry" key={visit.id}>
            <img className="cafe-diary-avatar" src={userProfile?.avatar_url || '/logo.png'} alt="" />
            <div className="cafe-diary-entry-body">
              <div className="cafe-diary-entry-rating">{Number(visit.rating) > 0 && <><CoffeeBeanRating value={visit.rating} size={18} label="Tu calificación de esta visita" /><strong>{formatRating(visit.rating)}</strong></>}{favorite && <Heart size={15} fill="currentColor" aria-label="Entre tus favoritos" />}</div>
              <div className="cafe-diary-entry-meta">{number > 1 && <RefreshCw size={13} />}<span><b>{username}</b> · Visita {number}</span><time dateTime={visit.visited_on || undefined}>{dateLabel}</time></div>
              {editingId === visit.id ? <form className="cafe-diary-edit" onSubmit={(event) => save(event, visit)}><label>Tu calificación<HalfStarRating value={rating} onChange={setRating} size={22} readOnly={saving} /></label><label>Tu reseña<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} disabled={saving} /></label><div className="cafe-diary-entry-actions"><button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button><button type="button" onClick={() => setEditingId(null)} disabled={saving}>Cancelar</button></div></form> : <>
                {visit.review_text?.trim() ? <p className="cafe-diary-review">{visit.review_text}</p> : <p className="cafe-diary-unreviewed">{Number(visit.rating) > 0 ? 'Calificaste esta visita sin escribir una reseña.' : 'Visita registrada · Puedes agregar tu calificación y reseña.'}</p>}
                <div className="cafe-diary-entry-actions"><button type="button" onClick={() => edit(visit)} disabled={saving}>{hasReview ? 'Editar reseña' : 'Añadir reseña'}</button>{hasReview && <button type="button" onClick={() => remove(visit, true)} disabled={saving}>Borrar reseña</button>}<button type="button" onClick={() => remove(visit, false)} disabled={saving}>Eliminar visita</button></div>
              </>}
            </div>
          </article>;
        })}
        {entries.length === 0 && <p className="cafe-diary-empty">{tab === 'reviews' ? 'Aún no has escrito reseñas para esta cafetería.' : 'Aún no tienes visitas registradas.'}</p>}
        {error && <p className="cafe-diary-error" role="alert">{error}</p>}
      </div>
      <aside className="cafe-diary-poster">{cafe.imageUrl ? <img src={cafe.imageUrl} alt={cafe.nombre} /> : <div><Coffee size={52} /></div>}<strong>{cafe.nombre}</strong><span>{visits.length} {visits.length === 1 ? 'visita registrada' : 'visitas registradas'}</span>{personalRating > 0 && <div className="cafe-diary-personal-rating"><CoffeeBeanRating value={personalRating} size={15} /><b>{formatRating(personalRating)}</b><small>Tu calificación</small></div>}</aside>
    </div>
  </dialog>, document.body);
}
