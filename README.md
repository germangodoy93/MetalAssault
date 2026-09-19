# Metal Assault

App para organizar torneos de Clash Royale: registro de jugadores, tipos y reglas de torneo, sorteo aleatorio, llave de eliminación dinámica / liga todos-contra-todos, clasificación, publicaciones (con imágenes) y redes sociales.

## Desplegar en Railway

Este repo ya incluye un pequeño servidor Express (`server.js`) que sirve `index.html` como sitio estático, así que Railway lo detecta automáticamente (Nixpacks + `npm start`). Solo conecta el repo en Railway y despliega — no requiere variables de entorno.

```
npm install
npm start
```

## ⚠️ Importante: persistencia de datos en este despliegue

La versión publicada en Claude (el artifact) usa capacidades propias de Claude (`window.claude.use('db')` y `window.claude.use('assets')`) para guardar los torneos, inscritos, llaves y publicaciones en un almacenamiento compartido en la nube de Claude, sincronizado en tiempo real entre todos los que abren el enlace.

**Esas capacidades solo existen dentro del visor de artifacts de Claude.** Al desplegar este mismo `index.html` en Railway (o cualquier otro hosting), `window.claude` no existe, así que la app cae automáticamente a su modo de respaldo:

- Los datos se guardan solo en el `localStorage` del navegador de cada visitante.
- **No se comparten entre distintas personas ni distintos dispositivos** — cada quien ve/edita su propia copia local.
- Las imágenes de las publicaciones se guardan como base64 dentro de ese mismo `localStorage` (ocupan más espacio y tienen un límite de tamaño del navegador, normalmente unos 5-10 MB en total).

Esto es correcto para probar el diseño y el flujo de la app, pero **si necesitas que todos los organizadores/jugadores vean los mismos torneos e inscripciones en tiempo real**, hay dos caminos:

1. Seguir usando el enlace del artifact de Claude para el uso real de la comunidad (ahí sí hay datos compartidos).
2. Agregar un backend propio (por ejemplo una API en este mismo `server.js` con una base de datos como SQLite/Postgres) y adaptar las funciones `initStore`, `setMatch`, `addTournament`, etc. en `index.html` para llamar a esa API en vez de `window.claude.use('db')`. Con gusto ayudo a construir esa versión si la necesitas.

## Estructura

- `index.html` — toda la aplicación (HTML + CSS + JS en un solo archivo)
- `logo.jpg` — logo de Metal Assault
- `server.js` — servidor estático Express para Railway
- `package.json` — dependencias y script de arranque
