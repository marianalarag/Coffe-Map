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
import ConfigErrorPage from './components/ConfigErrorPage'
import PWAExperience from './components/PWAExperience'
import { supabaseConfig } from './supabase'

const appRunsNatively = window.Capacitor?.isNativePlatform?.() === true;
const appRunsStandalone = window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true;

if (appRunsNatively || appRunsStandalone) {
  document.documentElement.classList.add('is-app-mode');
  document.documentElement.classList.toggle('is-native-app', appRunsNatively);
  document.documentElement.classList.toggle('is-standalone-app', appRunsStandalone && !appRunsNatively);
}

// Reload once when a new service worker takes control so installed iOS PWAs
// do not keep running an outdated JavaScript bundle after a deployment.
let reloadingForServiceWorkerUpdate = false
window.navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (reloadingForServiceWorkerUpdate) return
  reloadingForServiceWorkerUpdate = true
  window.location.reload()
})

// Registrar el Service Worker para la PWA
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('coffee-map:pwa-update', {
      detail: { update: updateSW },
    }))
  },
  onOfflineReady() {
    console.log('Coffee Map quedó instalada para abrirse desde tu dispositivo.')
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PWAExperience />
    {supabaseConfig.hasSupabaseConfig ? (
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
    ) : (
      <ConfigErrorPage
        hasSupabaseUrl={supabaseConfig.hasSupabaseUrl}
        hasSupabaseKey={supabaseConfig.hasSupabaseKey}
      />
    )}
  </StrictMode>,
)
