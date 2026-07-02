import { Navigate, useLocation } from 'react-router-dom';
import { useLayoutEffect, useMemo, useRef } from 'react';
import App from '../App.jsx';
import SearchPage from '../pages/SearchPage.jsx';
import CafePage from '../pages/CafePage.jsx';
import ProfilePage from '../pages/ProfilePage.jsx';
import AdminDashboardPage from '../pages/AdminDashboardPage.jsx';
import AdminRoute from './AdminRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const routeCacheByUser = new Map();

const getRouteEntry = (pathname) => {
  if (pathname === '/') {
    return { key: 'map', type: 'map' };
  }

  if (pathname === '/search') {
    return { key: 'search', type: 'search' };
  }

  if (pathname === '/profile') {
    return { key: 'profile', type: 'profile' };
  }

  if (pathname === '/admin') {
    return { key: 'admin', type: 'admin' };
  }

  const cafeMatch = pathname.match(/^\/cafe\/([^/]+)$/);
  if (cafeMatch) {
    return {
      key: `cafe:${decodeURIComponent(cafeMatch[1])}`,
      type: 'cafe',
      cafeId: decodeURIComponent(cafeMatch[1]),
    };
  }

  return null;
};

const renderRoute = (entry) => {
  switch (entry.type) {
    case 'map':
      return <App />;
    case 'search':
      return <SearchPage />;
    case 'profile':
      return <ProfilePage />;
    case 'admin':
      return (
        <AdminRoute>
          <AdminDashboardPage />
        </AdminRoute>
      );
    case 'cafe':
      return <CafePage cafeId={entry.cafeId} />;
    default:
      return null;
  }
};

function CachedProtectedRoutes() {
  const location = useLocation();
  const { user } = useAuth();
  const activeEntry = useMemo(() => getRouteEntry(location.pathname), [location.pathname]);
  const cacheKey = user?.id || 'anonymous';
  const sectionRefs = useRef(new Map());

  useLayoutEffect(() => {
    if (!activeEntry) return;

    const activeSection = sectionRefs.current.get(activeEntry.key);
    if (!activeSection) return;

    if (activeSection.contains(document.activeElement)) return;
    activeSection.focus({ preventScroll: true });
  }, [activeEntry]);

  if (!activeEntry) {
    return <Navigate to="/" replace />;
  }

  const cachedEntries = routeCacheByUser.get(cacheKey) || [];
  if (!cachedEntries.some((entry) => entry.key === activeEntry.key)) {
    routeCacheByUser.set(cacheKey, [...cachedEntries, activeEntry]);
  }
  const visibleEntries = routeCacheByUser.get(cacheKey) || [activeEntry];

  return (
    <main className="h-full w-full relative overflow-hidden bg-[#1D1A15]">
      {visibleEntries.map((entry) => {
        const isActive = entry.key === activeEntry.key;

        return (
          <section
            key={entry.key}
            ref={(node) => {
              if (node) {
                sectionRefs.current.set(entry.key, node);
              } else {
                sectionRefs.current.delete(entry.key);
              }
            }}
            inert={isActive ? undefined : true}
            tabIndex={isActive ? -1 : undefined}
            className={`absolute inset-0 h-full w-full transition-opacity duration-150 ${
              isActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none'
            }`}
          >
            {renderRoute(entry)}
          </section>
        );
      })}
    </main>
  );
}

export default CachedProtectedRoutes;
