import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Share, Smartphone, WifiOff, X } from 'lucide-react';

const DISMISS_KEY = 'coffee-map:pwa-install-dismissed-at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isAppInstalled = () => (
  window.Capacitor?.isNativePlatform?.() === true
  || window.matchMedia('(display-mode: standalone)').matches
  || window.navigator.standalone === true
);

function PWAExperience() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(isAppInstalled);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [updateApp, setUpdateApp] = useState(null);

  const device = useMemo(() => {
    const userAgent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/i.test(userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
    return { ios, safari };
  }, []);

  useEffect(() => {
    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    const canSuggestInstall = !dismissedAt || Date.now() - dismissedAt > DISMISS_TTL_MS;
    const timerId = window.setTimeout(() => {
      if (!isAppInstalled() && device.ios && canSuggestInstall) setShowInstall(true);
    }, 1400);

    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      if (canSuggestInstall) setShowInstall(true);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setShowInstall(false);
      setShowIosSteps(false);
      setInstallPrompt(null);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleUpdate = (event) => setUpdateApp(() => event.detail?.update || null);
    const handleShowInstall = () => {
      setShowInstall(true);
      if (device.ios && !installPrompt) setShowIosSteps(true);
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('coffee-map:pwa-update', handleUpdate);
    window.addEventListener('coffee-map:pwa-show-install', handleShowInstall);

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('coffee-map:pwa-update', handleUpdate);
      window.removeEventListener('coffee-map:pwa-show-install', handleShowInstall);
    };
  }, [device.ios, installPrompt]);

  const dismissInstall = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShowInstall(false);
    setShowIosSteps(false);
  };

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setShowInstall(false);
      setInstallPrompt(null);
      return;
    }

    setShowIosSteps(true);
  };

  return (
    <>
      {!online && (
        <div className="pwa-offline-banner" role="status">
          <WifiOff size={14} /> Sin conexión. El mapa y los datos nuevos necesitan internet.
        </div>
      )}

      {updateApp && (
        <aside className="pwa-update-card" aria-live="polite">
          <RefreshCw size={18} />
          <div>
            <strong>Nueva versión lista</strong>
            <span>Actualiza Coffee Map sin perder tu sesión.</span>
          </div>
          <button type="button" onClick={() => updateApp(true)}>Actualizar</button>
        </aside>
      )}

      {!installed && showInstall && (
        <aside className="pwa-install-card" aria-label="Instalar Coffee Map">
          <button type="button" className="pwa-card-close" onClick={dismissInstall} aria-label="Cerrar">
            <X size={16} />
          </button>
          <img src="/pwa-192x192.png" alt="" aria-hidden="true" />
          <div className="pwa-install-copy">
            <span>GRATIS · SIN APP STORE</span>
            <strong>Instala Coffee Map</strong>
            <p>Úsala desde tu pantalla de inicio como cualquier otra app.</p>
          </div>
          <button type="button" className="pwa-install-action" onClick={installApp}>
            <Download size={16} /> Instalar gratis
          </button>
        </aside>
      )}

      {showIosSteps && (
        <div className="pwa-install-modal" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
          <section>
            <button type="button" className="pwa-card-close" onClick={() => setShowIosSteps(false)} aria-label="Cerrar instrucciones">
              <X size={18} />
            </button>
            <div className="pwa-modal-icon"><Smartphone size={27} /></div>
            <span className="pwa-modal-kicker">IPHONE · INSTALACIÓN GRATIS</span>
            <h2 id="pwa-install-title">Añade Coffee Map a tu inicio</h2>
            {!device.safari && <p className="pwa-safari-note">Primero abre esta página en Safari.</p>}
            <ol>
              <li><b>1</b><span>Pulsa <strong>Compartir</strong> <Share size={15} /> en Safari.</span></li>
              <li><b>2</b><span>Elige <strong>Agregar a pantalla de inicio</strong>.</span></li>
              <li><b>3</b><span>Activa <strong>Abrir como app</strong> y pulsa Agregar.</span></li>
            </ol>
            <button type="button" className="pwa-modal-done" onClick={dismissInstall}>Entendido</button>
          </section>
        </div>
      )}
    </>
  );
}

export default PWAExperience;
