# Coffee Map Mérida

App social tipo Letterboxd para descubrir, guardar, reseñar y compartir cafeterías de Mérida. La misma base React/Vite funciona como PWA, app Android y app iOS mediante Capacitor.

## Funciones principales

- Mapa limitado al área metropolitana de Mérida.
- Favoritas, visitadas, lista por visitar, calificaciones y reseñas personales.
- Publicaciones comunitarias con fotos y cafetería relacionada.
- Galería moderada de fotos por cafetería.
- Panel `/admin` con métricas, escáner abierto OSM/Overture, altas manuales, portadas, moderación de fotos/posts y roles.
- Filtros del mapa por colonia, preview de cafeterías con doble toque en móvil y carga diferida de imágenes.
- Asistente administrativo de enriquecimiento: propone ubicación, colonia, horarios y portadas desde fuentes abiertas; cada sugerencia exige revisión manual antes de guardarse.
- Datos, autenticación y archivos en Supabase.
- PWA desplegable en Vercel y proyectos nativos en `android/` e `ios/`.

## Configuración local

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICA
```

Nunca agregues contraseñas ni la `service_role` a variables `VITE_*`: todo lo que empiece con `VITE_` queda visible en el cliente.

```bash
npm install
npm run dev
```

## Supabase

1. Si el proyecto es nuevo, aplica primero `supabase/schema.sql`.
2. Aplica `supabase/migrations/20260808_admin_social_photos.sql` desde SQL Editor.
3. Confirma por correo la cuenta administradora solicitada.
4. Inicia sesión y abre `/admin`.

La migración crea `posts`, `cafe_photos`, `app_events`, el bucket `cafe-photos`, políticas RLS seguras y promueve el correo administrador sin almacenar su contraseña.

## Escáner de cafeterías

El panel usa únicamente fuentes gratuitas y abiertas dentro de un bounding box fijo de Mérida. Evita duplicados por nombre y distancia y guarda la identidad de origen:

1. Ejecuta el escáner OSM periódicamente.
2. Importa Overture GeoJSON o usa el script `scripts/scan-open-cafes.mjs` para sincronizaciones administrativas.
3. Agrega manualmente faltantes desde el panel.
4. Usa reportes de la comunidad para detectar aperturas/cierres.
5. Revisa fotos y estados antes de hacerlos públicos.

Las imágenes automáticas solo se aceptan desde Wikimedia Commons cuando la API confirma una licencia compatible y se conserva la atribución. Coffee Map prioriza fotos propias de administradores y usuarios, moderadas desde Supabase. No se copian fotos de servicios propietarios ni de sitios comerciales.

El asistente del panel funciona como chat. Si `VITE_CAFE_ASSISTANT_URL` está vacío, responde en modo fuentes abiertas (Nominatim + Openverse). Para conectar una IA propia, configura esa variable con un endpoint del servidor que reciba `{ message, cafe, history, locale, city }` y devuelva `{ message, suggestion, sources }`. La interfaz no guarda nada sin confirmación del administrador.

## Web, Android e iPhone

Coffee Map ya está preparado como un producto multiplataforma. La web y la PWA usan React/Vite; Android tiene un punto de entrada nativo en Kotlin y iPhone un punto de entrada nativo en Swift. Ambos clientes comparten la misma experiencia, autenticación, datos y backend, así que una cafetería, reseña o favorito se refleja en todas las plataformas.

La decisión evita mantener tres versiones distintas de la interfaz y deja Kotlin/Swift disponibles para funciones específicas de cada sistema cuando sean necesarias. La arquitectura completa está documentada en [`docs/multiplatform-architecture.md`](docs/multiplatform-architecture.md).

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

- Android requiere Android Studio y un SDK configurado.
- iOS requiere macOS y Xcode; el proyecto puede sincronizarse en Windows, pero no compilarse ni firmarse allí.
- Después de cualquier cambio web ejecuta `npm run mobile:sync`.
- Identificador nativo: `mx.coffeemap.merida`.

## Vercel

Configura las dos variables de Supabase en todos los entornos, ejecuta `npm run build` y vuelve a desplegar. `vercel.json` conserva el fallback necesario para las rutas de React.

## Verificación

```bash
npm run lint
npm run build
npm run mobile:sync
```
