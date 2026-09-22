# Coffee Map multiplataforma

Coffee Map comparte la experiencia de producto entre tres destinos:

| Destino | Tecnología | Entrada |
| --- | --- | --- |
| Web | React + Vite + PWA | `src/` |
| Android | Kotlin + Capacitor | `android/` |
| iPhone | Swift + Capacitor | `ios/` |

## Qué se comparte

- La interfaz, navegación y experiencia principal viven en `src/`.
- Autenticación, datos, fotos y reglas de acceso viven en Supabase.
- Android e iPhone cargan el mismo build web dentro de una app nativa y conservan sus propios puntos de entrada para capacidades específicas de cada plataforma.
- La PWA permite instalar Coffee Map desde el navegador cuando el usuario no necesita descargarla desde una tienda.

## Flujo de desarrollo

```text
src/ + Supabase
       |
       +--> npm run build --> dist/ --> Web / PWA
       |
       +--> npx cap sync android --> Android Studio / APK / AAB
       |
       +--> npx cap sync ios --> Xcode / IPA
```

## Comandos

```bash
npm install
npm run dev
npm run build
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Android requiere Android Studio y un SDK configurado. iOS requiere macOS y Xcode para compilar, firmar y publicar; el proyecto iOS sí puede prepararse desde Windows ejecutando la sincronización.

## Siguiente evolución nativa

Cuando Coffee Map necesite funciones que no convenga resolver con APIs web, se agregan en los hosts nativos sin duplicar el producto completo:

- Kotlin: notificaciones, app links, ubicación avanzada y tareas en segundo plano.
- Swift: permisos, notificaciones, enlaces universales y servicios específicos de iOS.
- JavaScript compartido: contratos de datos y comportamiento visible al usuario.
