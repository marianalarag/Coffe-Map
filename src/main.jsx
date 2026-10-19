import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { CoffeeDataProvider } from './context/CoffeeDataContext'
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
                element={<CachedProtectedRoutes />}
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
