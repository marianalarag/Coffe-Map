# Coffee Map

Mapa de cafeterías en Mérida con escaneo en Google Maps Places y autenticación con Firebase (email/contraseña).

## 1) Crear proyecto en Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com/) y crea un proyecto.
2. En el panel del proyecto: **Build > Authentication > Get started**.
3. En **Sign-in method**, habilita **Email/Password**.
4. Ve a **Project settings > General**.
5. En **Your apps**, crea una app web (`</>`).
6. Copia la configuración de Firebase (`apiKey`, `authDomain`, etc.).

## 2) Crear usuario de acceso

1. En **Authentication > Users**, haz clic en **Add user**.
2. Define correo y contraseña para tu login.

## 3) Configurar variables de entorno

1. Copia `.env.example` a `.env`.
2. Completa estos valores:

```env
VITE_GOOGLE_MAPS_API_KEY=...

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 4) Ejecutar proyecto

```bash
npm install
npm run dev
```

## Flujo de la app

- `/login`: formulario de inicio de sesión.
- `/`: mapa protegido (solo si hay sesión activa).
- Botón **Cerrar sesión** en la vista principal.

## Seguridad recomendada

- Restringe tu API key de Google Maps por dominio (HTTP referrers).
- En Firebase Auth, agrega dominios permitidos en **Authentication > Settings > Authorized domains**.
