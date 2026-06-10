# CLAUDE.md — GesNeumatico Backend

## Project

**App**: Sistema de Gestión de Neumáticos (tire management) for TAIR company.  
**Stack**: Node.js + Express.js → ODBC → IBM AS400/iSeries DB2  
**Schema**: `SPEED400AT` (env `DB_SCHEMA`)  
**Port**: 3001  
**Entry**: `server.js`

## Run

```bash
npm start           # production (bare node)
npm run dev         # nodemon watch — respects nodemon.json (sessions/ excluded)
npm run test:db     # verify DB connectivity
npm run test        # no-op (echo only, no real tests)
npm run test:modulo1  # runs test_modulo_1.js (file not present in repo — will error)
```

## Architecture

```
server.js              ← entry, CORS, session (FileStore), route mount
routes/                ← endpoint definitions (14 files — see Routes below)
controllers/           ← request handling + business logic (13 files)
services/neumaticoService.js  ← complex JOINs, normalization, assignment logic
models/                ← thin data-access wrappers (mostly bypassed — 4 files)
config/db.js           ← ODBC pool (odbc.pool), reconnect on stale connection
config/swagger.js      ← Swagger UI at /api-docs
migrations/            ← 11 SQL files for AS400 schema (001–010 + DEPLOY_FINAL)
sessions/              ← session files (session-file-store) — gitignored, nodemon-ignored
nodemon.json           ← excludes sessions/ from watch to prevent restart on session write
consulta-bd.js         ← dev helper: raw DB query runner (not imported anywhere)
consulta-simple.js     ← dev helper: simplified query runner (not imported anywhere)
investigate.js         ← dev script: TDQ-854 investigation (not imported anywhere)
verificar-neu-movimiento.js  ← dev script: NEU_MOVIMIENTOS verification (not imported anywhere)
```

### Request flow
`route → controller → neumaticoService (complex) | db.query (simple) → AS400 DB2`

## Database

**Type**: IBM AS400/iSeries DB2 via ODBC  
**Connection**: `config/db.js` — `odbc.pool()` (lazy connections), reconnects automatically on stale connection after WiFi drop. Throws `Error` with `err.code = 'DB_UNAVAILABLE'` when pool is unavailable — controllers catch it via try/catch.

**Reconnect behavior**:
- Query fails → pool invalidated → reconnect attempt
- Reconnect failures use exponential backoff: 1s → 2s → 4s → … → 30s max
- Concurrent reconnect calls deduplicated via `_connectingPromise`

**Primary tables:**

| Table | Purpose |
|-------|---------|
| `NEU_PADRON` | Master tire catalog |
| `NEU_INFORMACION` | Tire state / current info |
| `NEU_MOVIMIENTOS` | Full audit trail of all movements |
| `NEU_MARCA` | Brand lookup |
| `NEU_ESTADO` | State codes (1=operativo, 2=disponible, 3=baja definitiva, 4=recuperado) |
| `NEU_ACCION` | Action codes |
| `NEU_VKILOMETRAJE` | Vehicle odometer records |
| `MAE_USUARIO` / `MAE_PERFIL_MAE_USUARIO` / `MAE_PERFIL` | User & RBAC |
| `MAE_TALLER_X_USUARIO` | Workshop ↔ user assignments |
| `PO_TALLER` | Workshops/projects |
| `PO_VEHICULO` | Vehicles |

## Authentication & Authorization

**Method**: `express-session` + `session-file-store` (persisted to `./sessions/*.json`)  
**Login**: `POST /api/login` → session stores user + profiles → `req.session.save()` explicit  
**Logout**: `POST /api/logout` → `req.session.destroy()` + clear cookie  
**Cookie**: `httpOnly: true`, `sameSite: lax`, `secure: false`, `maxAge: 8h`  
**Session TTL**: 8 hours (cookie + FileStore `ttl` in sync)  
**FileStore**: `retries: 0`, `reapInterval: 3600` (cleans expired files hourly), `logFn: () => {}` (silent)  
**Sessions survive**: process restarts, nodemon reloads, deploys

**Profiles (RBAC)**:
- `005` OPERACIONES — full access to all tires
- `002` JEFE DE TALLER — limited to assigned workshop tires
- Others — no tire resource access

**Auth check**: inline per controller — `if (!req.session.user || !req.session.user.usuario) return res.status(401)`  
No centralized auth middleware.

**`jsonwebtoken` dependency exists but is NOT used** (legacy/unused).

## API Surface

Base prefix: `/api`

| Prefix | Controller | Purpose |
|--------|-----------|---------|
| `/api/login`, `/api/session`, `/api/logout` | poInicioSesion | Auth |
| `/api/health` | inline | DB health check — `200 {status:'ok'}` or `503 {status:'db_down'}` |
| `/api/po-neumaticos` | poNeumatico | Tire CRUD + stats |
| `/api/po-asignados` | poAsignados | Current assignments per vehicle |
| `/api/po-asignar-neumatico` | poAsignarNeumatico | Assign tire to vehicle |
| `/api/po-neumaticos-disponibles` | poNeumaticosDisponibles | Available tire list |
| `/api/inspeccion` | poInspeccion | Inspections |
| `/api/po-movimiento` | poMovimiento | Movement history |
| `/api` (maintenance routes) | poMantenimiento | Rotation, removal, replacement |
| `/api/vehiculo` | poBuscarVehiculo | Vehicle lookup |
| `/api/po-supervisores` | poSupervisores | Supervisor list |
| `/api/po-padron` | poPadron | Excel bulk import |
| `/api/po-reportes` | poReporte | Monthly/date-range reports |
| `/api/mapa` | poMapa | Fleet count per workshop |

**Total endpoints**: ~79 (78 mounted + 1 inline health check). Swagger UI: `http://localhost:3001/api-docs`

> `routes/debugRoutes.js` exists (`GET /debug/mis-neumaticos`) but is **never imported or mounted** in `server.js` — dead file.

## Key Behaviors

### Health Check (`GET /api/health`)
- Runs `SELECT 1 FROM SYSIBM.SYSDUMMY1` via `db.validate()`
- `200 { status: 'ok' }` — backend + DB responding
- `503 { status: 'db_down' }` — backend alive, AS400 unreachable
- `Cache-Control: no-store`

### ODBC Pool (`config/db.js`)
- Uses `odbc.pool(connStr)` — simple string form for IBM i ODBC driver compatibility
- `db.query()` retries once on ODBC error (pool invalidated → reconnect → retry)
- `db.validate()` — lightweight check, does NOT trigger reconnect
- **Never returns `null`** — throws `{ code: 'DB_UNAVAILABLE', status: 503 }` if pool unavailable

### Excel Import (`POST /api/po-padron/cargar-padron`)
- Parses with `xlsx` library
- Auto-detects column name variants (e.g. `DISEÑO` vs `DISENO`)
- Missing columns → stored as `null` (no hard failure)
- Returns `{ total, inserted, errors[] }`

### Tire Assignment (`POST /api/po-asignar-neumatico`)
- Accepts single object or array (multi-assign)
- Validates tire registration date
- Updates `NEU_VKILOMETRAJE` with odometer on assign
- Returns 207 for partial success on multi-assign

### Desasignación con Reemplazo (`POST /api/desasignar-con-reemplazo`)
- Atomic: assigns replacement tires first, then removes old
- No DB-level transaction — if step 2 fails, step 1 is already committed

### CORS
Hardcoded IP whitelist in `server.js` + `process.env.URL_GESNEU_WEB`. `null` origin allowed (Postman/curl testing). To add a new frontend IP, edit the `whitelist` array in `server.js`.

## Frontend / Proxy Integration

This backend is consumed by a Next.js frontend via an Edge Runtime proxy route (`route.ts`). The proxy:
- Adds CF-Access service token headers to every request to the backend
- Forwards `Cookie` header from browser to backend (so `connect.sid` reaches the session middleware)
- Forwards `Set-Cookie` from backend responses back to browser (so login cookie persists)

**Known SSR issue**: Next.js Server Components that fetch from the proxy without explicitly passing `cookies()` from `next/headers` will arrive at the backend without `connect.sid` → new empty session → 401. All authenticated fetches must be client-side or explicitly pass the cookie in SSR context.

## Environment Variables

See `.env.example`. Required:

```
DB_DSN          ODBC DSN name
DB_HOST         AS400 system IP
DB_USER         DB username
DB_PASSWORD     DB password
DB_SCHEMA       Schema name (default: SPEED400AT)
ODBC_DRIVER     ODBC driver name
PORT            Server port (default: 3001)
SESSION_SECRET  Session encryption key
HOST            Local server IP
URL_GESNEU_WEB  Frontend URL (added to CORS whitelist)
```

## Known Limitations / Gotchas

1. **No DB transactions** — multi-step writes (desasignar-con-reemplazo) are not atomic
2. **No input validation library** — validation is manual in each controller
3. **No structured logging** — uses `console.error` / `console.log` with ISO timestamps on startup
4. **Models are underutilized** — most DB logic lives in controllers or `neumaticoService.js`
5. **No test suite** — zero test files in project
6. **`null` CORS origin** — allows Postman; acceptable for internal LAN app but note the risk
7. **Password comparison** — done directly in DB query against `MAE_USUARIO`; no bcrypt
8. **`multer` upload.js** — file in `middlewares/upload.js` is **DISABLED** (commented out)
9. **FileStore sessions on disk** — if `./sessions/` is deleted, all active sessions are invalidated (users must re-login). Session files are JSON, not encrypted.
10. **SSR + sessions** — Next.js SSR requests without explicit cookie forwarding arrive as unauthenticated (see Frontend/Proxy Integration above)
11. **Zombie dependencies** — `ibm_db`, `mysql2`, `node-fetch` in `package.json` but **not used anywhere** in codebase; legacy/accidental installs
12. **debugRoutes.js** — exists in `routes/` but never mounted; `GET /debug/mis-neumaticos` is unreachable
13. **test_modulo_1.js** — referenced in `npm run test:modulo1` but file does not exist in repo

## Coding Conventions

- Controllers named `po<Module>Controller.js`, routes named `po<Module>Routes.js`
- DB queries use `db.query(sql, params)` — always parameterized, async/await
- Error response pattern: `res.status(NNN).json({ error: '...' })`
- Success response: `res.json(data)` or `res.json({ message: '...', ...data })`
- Session user accessed via `req.session.user`
- Profile check: `req.session.user.perfiles.includes('005')`
- All controllers have `try/catch` — DB errors propagate as thrown exceptions, caught here

## Models

Thin wrappers — mostly bypassed in favor of direct `db.query()` in controllers:

| File | Wraps |
|------|-------|
| `models/PoNeumatico.js` | Tire queries |
| `models/PoBuscarVehiculo.js` | Vehicle lookup |
| `models/PoPadron.js` | Padron/bulk import |
| `models/PoSupervisor.js` | Supervisor list |

## Migrations

Ordered deployment sequence in `migrations/`:

```
001_normalized_schema.sql
002_migration_data_sample.sql
003_smart_migration.sql
004_clean_start.sql
005_fix_marcas.sql
006_repair_null_marcas.sql
007_sync_supervisors.sql
008_implement_state_catalog.sql
009_standardize_actions.sql
010_trim_supervisors.sql
DEPLOY_FINAL_ESTANDARIZACION.sql  ← final canonical deployment (use this for fresh installs)
```

## File Reference

```
server.js                                    ← CORS, session (FileStore), route mounting, error middleware
config/db.js                                 ← ODBC pool, reconnect logic, backoff, db.validate()
nodemon.json                                 ← watch config, sessions/ excluded
sessions/                                    ← session files (gitignored, nodemon-ignored)
services/neumaticoService.js                 ← core business logic for tires
controllers/poMantenimientoController.js     ← desasignar/rotation/inspection logic
controllers/poAsignarNeumaticoController.js  ← assignment with odometer update
controllers/poPadronController.js            ← Excel bulk import
models/PoNeumatico.js                        ← tire model (mostly bypassed)
models/PoBuscarVehiculo.js                   ← vehicle model (mostly bypassed)
routes/debugRoutes.js                        ← DEBUG ONLY — unmounted, unreachable
consulta-bd.js                               ← dev helper, not part of app
investigate.js                               ← dev script (TDQ-854), not part of app
migrations/DEPLOY_FINAL_ESTANDARIZACION.sql  ← final schema deployment
```
