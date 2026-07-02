import { User, House, Bookmark } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const isMap = location.pathname === '/';
  const isProfile = location.pathname === '/profile';

  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 w-full max-w-sm h-16 bg-[#27201A] flex items-center justify-around px-2 border-2 border-[#27201A]">
      
      {/* Botón izquierdo de extras */}
      <button className="p-3 rounded-2xl transition-colors active:scale-95 flex items-center justify-center">
        <Bookmark className="text-[#E6DAC1]" size={24} />
      </button>

      {/* Botón central de mapa */}
      <button 
        onClick={() => !isMap && navigate('/')}
        className={"p-3 rounded-2xl shadow-inner transition-colors active:scale-95 flex items-center justify-center "}
      >
        <House className="text-[#E6DAC1]" size={24} />
      </button>

      {/* Botón derecho de usuario */}
      <button 
        onClick={() => !isProfile && navigate('/profile')}
        className={"p-3 rounded-2xl transition-colors active:scale-95 flex items-center justify-center "}
      >
        <User className="text-[#E6DAC1]" size={24} />
      </button>

    </div>
  );
}

export default BottomNav;
