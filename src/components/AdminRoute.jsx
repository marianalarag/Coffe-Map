import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PageLoading from './PageLoading';

function AdminRoute({ children }) {
  const { userProfile, loading } = useAuth();

  if (loading) {
    return <PageLoading message="Verificando permisos..." />;
  }

  if (userProfile?.role !== 'administrador') {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
