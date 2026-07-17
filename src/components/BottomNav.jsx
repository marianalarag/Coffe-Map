import { createElement } from 'react';
import { User, House, Bookmark } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Guardados', path: '/search', icon: Bookmark },
  { label: 'Mapa', path: '/', icon: House },
  { label: 'Perfil', path: '/profile', icon: User },
];

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-sm h-16 bg-[#27201A] flex items-center justify-around px-2 border-2 border-[#27201A]">
      {navItems.map(({ label, path, icon }) => {
        const isActive = location.pathname === path;

        return (
          <button
            key={path}
            type="button"
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => !isActive && navigate(path)}
            className={`h-12 flex-1 mx-1 rounded-2xl transition-colors active:scale-95 flex items-center justify-center ${
              isActive ? 'bg-[#3B3028]' : 'hover:bg-[#342A23]'
            }`}
          >
            {createElement(icon, { className: 'text-[#E6DAC1]', size: 25 })}
          </button>
        );
      })}
    </div>
  );
}

export default BottomNav;
