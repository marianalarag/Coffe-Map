const GOOGLE_MAPS_SCRIPT_ID = 'google-maps-api';

let googleMapsBootstrapPromise = null;

const getLoadedLibrary = (libraryName) => {
  const maps = window.google?.maps;

  switch (libraryName) {
    case 'maps':
      return maps?.Map ? { Map: maps.Map } : null;
    case 'marker':
      return maps?.marker?.AdvancedMarkerElement ? maps.marker : null;
    case 'places':
      return maps?.places?.PlacesService ? maps.places : null;
    default:
      return null;
  }
};

const installGoogleMapsBootstrap = (apiKey) => {
  const google = window.google || (window.google = {});
  const maps = google.maps || (google.maps = {});

  if (typeof maps.importLibrary === 'function') {
    return maps;
  }

  if (document.getElementById(GOOGLE_MAPS_SCRIPT_ID)) {
    return maps;
  }

  const requestedLibraries = new Set();

  maps.importLibrary = (libraryName) => {
    requestedLibraries.add(libraryName);

    if (!googleMapsBootstrapPromise) {
      googleMapsBootstrapPromise = new Promise((resolve, reject) => {
        const params = new URLSearchParams({
          key: apiKey,
          v: 'beta',
          loading: 'async',
          callback: 'google.maps.__ib__',
        });

        params.set('libraries', [...requestedLibraries].join(','));

        const script = document.createElement('script');
        script.id = GOOGLE_MAPS_SCRIPT_ID;
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.onerror = () => {
          googleMapsBootstrapPromise = null;
          reject(new Error('No se pudo cargar Google Maps.'));
        };

        maps.__ib__ = () => {
          delete maps.__ib__;
          resolve(maps);
        };

        document.head.appendChild(script);
      });
    }

    return googleMapsBootstrapPromise.then(() => maps.importLibrary(libraryName));
  };

  return maps;
};

export function loadGoogleMapsApi() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY en .env'));
  }

  const maps = installGoogleMapsBootstrap(apiKey);

  if (typeof maps.importLibrary === 'function') {
    return maps.importLibrary('maps').then(() => window.google.maps);
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google.maps);
  }

  return Promise.reject(new Error('Google Maps ya existe en la pagina, pero no expone importLibrary.'));
}

export async function importGoogleMapsLibrary(libraryName) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Falta VITE_GOOGLE_MAPS_API_KEY en .env');
  }

  const maps = installGoogleMapsBootstrap(apiKey);

  if (typeof maps.importLibrary === 'function') {
    return maps.importLibrary(libraryName);
  }

  const loadedLibrary = getLoadedLibrary(libraryName);
  if (loadedLibrary) {
    return loadedLibrary;
  }

  throw new Error(`Google Maps se cargo sin soporte para importLibrary (${libraryName}). Recarga la pagina para reinicializar la API.`);
}
