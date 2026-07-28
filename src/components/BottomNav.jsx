import { createElement } from 'react';
import { UserRound, House, Map, Plus, Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Inicio', path: '/', icon: House },
  { label: 'Mapa', path: '/map', icon: Map },
  { label: 'Nueva publicación', path: '/new-post', icon: Plus },
  { label: 'Actividad', path: '/activity', icon: Zap },
  { label: 'Perfil', path: '/profile', icon: UserRound },
];

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {navItems.map(({ label, path, icon, featured }) => {
        const isActive = !featured && location.pathname === path;

        return (
          <button
            key={path}
            type="button"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => (featured || !isActive) && navigate(path)}
            className={`bottom-nav-item ${isActive ? 'is-active' : ''} ${featured ? 'is-featured' : ''}`}
          >
            {createElement(icon, { size: featured ? 24 : 21, strokeWidth: featured ? 2.2 : 2 })}
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
