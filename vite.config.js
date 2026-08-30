import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'coffee-map.webmanifest',
      includeAssets: ['favicon.png', 'logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
      },
      manifest: {
        id: '/',
        name: 'Coffee Map',
        short_name: 'Coffee Map',
        description: 'Descubre, guarda y comparte cafeterías de Mérida.',
        lang: 'es-MX',
        dir: 'ltr',
        theme_color: '#27201A',
        background_color: '#FFFFFF',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        categories: ['food', 'lifestyle', 'navigation'],
        scope: '/',
        start_url: '/',
        shortcuts: [
          {
            name: 'Explorar mapa',
            short_name: 'Mapa',
            url: '/map',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Buscar cafetería',
            short_name: 'Buscar',
            url: '/search',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})
