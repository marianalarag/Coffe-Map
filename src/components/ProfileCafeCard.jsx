import { Coffee, MapPin } from 'lucide-react';
import CoffeeBeanIcon from './CoffeeBeanIcon';
import { formatRating } from '../utils/formatRating';
import { getCafeNeighborhood } from '../utils/cafeAddress';

export default function ProfileCafeCard({ cafe, onClick }) {
  return <button type="button" className="profile-place-card" onClick={onClick} aria-label={`Ver ${cafe.nombre}`}>
    <span className="profile-place-media">
      {cafe.imageUrl ? <img src={cafe.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="profile-place-placeholder"><Coffee size={34} /></span>}
      <span className="profile-place-rating"><CoffeeBeanIcon size={12} filled tone="light" />{Number(cafe.rating) > 0 ? formatRating(cafe.rating) : '—'}</span>
      <strong>{cafe.nombre}</strong>
    </span>
    <span className="profile-place-location" title={cafe.address || getCafeNeighborhood(cafe)}><MapPin size={13} /><span>{getCafeNeighborhood(cafe)}</span></span>
  </button>;
}
