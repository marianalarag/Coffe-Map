import { Coffee, Home, Search, Map, Heart, List, UserRound, Settings, Camera, Users, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DesktopSidebar({ admin = false, tab, onTabChange }) {
  const navigate = useNavigate();
  const links = admin ? [
    ['Inicio', Home, () => onTabChange('overview'), tab === 'overview'],
    ['Cafeterías', Coffee, () => onTabChange('cafes'), tab === 'cafes'],
    ['Solicitudes', Shield, () => onTabChange('requests'), tab === 'requests'],
    ['Publicaciones', Camera, () => onTabChange('posts'), tab === 'posts'],
    ['Usuarios', Users, () => onTabChange('users'), tab === 'users'],
    ['Ver sitio', Home, () => navigate('/'), false],
  ] : [
    ['Inicio', Home, () => navigate('/'), false],
    ['Explorar', Search, () => navigate('/search'), false],
    ['Mapa', Map, () => navigate('/map'), false],
    ['Favoritos', Heart, () => navigate('/favorites'), false],
    ['Lista', List, () => navigate('/list'), false],
    ['Perfil', UserRound, () => navigate('/profile'), true],
    ['Ajustes', Settings, () => navigate('/settings'), false],
  ];
  return <aside className="desktop-sidebar" aria-label={admin ? 'Navegación del centro de control' : 'Navegación principal'}>
    <button type="button" className="desktop-sidebar-brand" onClick={() => navigate('/')}><Coffee size={40} strokeWidth={1.4} /><strong>CoffeeMap</strong></button>
    <nav>{links.map((entry) => { const [label, Icon, action, active] = entry; return <button key={label} type="button" className={active ? 'is-active' : ''} onClick={action}><Icon size={22} strokeWidth={1.6} /><span>{label}</span></button>; })}</nav>
    <div className="desktop-sidebar-landscape" aria-hidden="true"><Coffee size={54} strokeWidth={.7} /><span>Mérida, Yucatán</span></div>
  </aside>;
}
