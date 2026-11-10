# Metal Assault

App para organizar torneos de Clash Royale: registro de jugadores, tipos y reglas de torneo, sorteo aleatorio, fase de grupos + eliminatoria, liga todos contra todos, clasificación, publicaciones (con imágenes) y redes sociales.

Los datos se guardan en el servidor y se sincronizan en tiempo real: todo lo que un organizador cambia (inscripciones, sorteos, resultados) lo ven al instante los demás que tengan la página abierta.

## Desplegar en Railway

1. En el proyecto de Railway, agrega una base de datos: **New → Database → PostgreSQL**.
2. En el servicio de la app, abre **Variables** y agrega una referencia a la base de datos:
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}`
3. Despliega (cada `git push` a `main` redespliega). Las tablas se crean solas al arrancar.

Si el servicio arranca sin `DATABASE_URL`, la app funciona, pero guarda los datos en el disco temporal del contenedor y **se pierden en cada despliegue**. Los logs lo advierten.

Variables opcionales:

| Variable | Uso |
| --- | --- |
| `DATABASE_SSL=true` | Solo si te conectas por la URL pública de Postgres (con la red interna de Railway no hace falta). |
| `DATA_DIR` | Carpeta del almacenamiento local cuando no hay Postgres (por defecto `./data`). |

## Desarrollo local

```
npm install
npm start      # http://localhost:3000 — sin DATABASE_URL usa ./data/store.json
npm test       # pruebas del motor de torneos
```

Para probar contra Postgres en local, define `DATABASE_URL` antes de `npm start`.

## Formatos de torneo

- **Grupos + eliminatoria** (por defecto): los participantes se reparten en grupos de 3 a 5 y juegan todos contra todos dentro de su grupo. Los 2 mejores de cada grupo pasan a una llave con cruces 1° vs 2° de otro grupo, así dos jugadores del mismo grupo solo pueden volver a cruzarse en la final.
  - 8 participantes → 2 grupos de 4 (3 partidas cada uno) → semifinales → final.
  - 16 participantes → 4 grupos de 4 → cuartos → semis → final.
  - 2 participantes → final directa.
- **Liga**: un solo grupo, todos contra todos, y final entre los 2 primeros.

Desempate dentro de un grupo: victorias, luego duelo directo entre los empatados y, si persiste, el orden del sorteo (se indica en la tabla).

### Corregir un resultado

- Toca al otro jugador de un partido ya decidido para cambiar el ganador.
- O usa **↺ Quitar resultado** y vuelve a elegir.
- Si el cambio afecta rondas siguientes (por ejemplo, el ganador ya había jugado la final), la app avisa y limpia esos resultados en cascada.
- Si un cambio en la fase de grupos altera quién clasifica, la eliminatoria se vuelve a armar (también con aviso).

## Datos de la versión anterior

La versión anterior guardaba todo solo en el `localStorage` de cada navegador. Al abrir la nueva versión desde un navegador que tenga esos datos, aparece un aviso para **subirlos al servidor** (no sobrescribe nada que ya exista allí).

## Estructura

- `index.html` — interfaz (HTML + CSS + JS)
- `bracket.js` — motor del torneo: grupos, cruces, desempates, avance y corrección de resultados (sin DOM, se usa en el navegador y en las pruebas)
- `server.js` — servidor Express: API (`/api/state`, `/api/batch`, `/api/events`, `/api/images`) y archivos públicos
- `store.js` — almacenamiento: Postgres (`DATABASE_URL`) o archivo local
- `test/` — pruebas del motor (`npm test`)
- `logo.jpg` — logo de Metal Assault
