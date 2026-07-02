import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageLoading from './PageLoading';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <PageLoading message="Cargando sesion..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
