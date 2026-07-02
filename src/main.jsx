import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { CoffeeDataProvider } from './context/CoffeeDataContext'
import ProtectedRoute from './components/ProtectedRoute'
import CachedProtectedRoutes from './components/CachedProtectedRoutes'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import { registerSW } from 'virtual:pwa-register'

// Registrar el Service Worker para la PWA
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Nueva versión disponible. ¿Deseas actualizar?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('La aplicación está lista para usarse sin conexión')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <CoffeeDataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <CachedProtectedRoutes />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </CoffeeDataProvider>
    </AuthProvider>
  </StrictMode>,
)
