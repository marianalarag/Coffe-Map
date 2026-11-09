import { Coffee, MapPin } from 'lucide-react';
import CoffeeBeanIcon from './CoffeeBeanIcon';
import { formatAverageRating, formatRating } from '../utils/formatRating';
import { getCafeNeighborhood } from '../utils/cafeAddress';

export default function ProfileCafeCard({ cafe, onClick, locationInside = false, ratingKind = 'personal' }) {
  const location = <span className="profile-place-location" title={cafe.address || getCafeNeighborhood(cafe)}><MapPin size={13} /><span>{getCafeNeighborhood(cafe)}</span></span>;
  return <button type="button" className={`profile-place-card${locationInside ? ' has-integrated-location' : ''}`} onClick={onClick} aria-label={`Ver ${cafe.nombre}`}>
    <span className="profile-place-media">
      {cafe.imageUrl ? <img src={cafe.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="profile-place-placeholder"><Coffee size={34} /></span>}
      <span className="profile-place-rating" title={ratingKind === 'public' ? `Promedio de la app · ${cafe.ratingsCount || 0} calificaciones` : 'Tu calificación'}><CoffeeBeanIcon size={12} filled tone="light" />{Number(cafe.rating) > 0 ? (ratingKind === 'public' ? formatAverageRating(cafe.rating) : formatRating(cafe.rating)) : '—'}</span>
      <strong>{cafe.nombre}</strong>
      {locationInside && location}
    </span>
    {!locationInside && location}
  </button>;
}
