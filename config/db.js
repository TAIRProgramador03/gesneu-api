const odbc = require('odbc');
require('dotenv').config();

const getConnStr = () =>
    `DRIVER={${process.env.ODBC_DRIVER}};SYSTEM=${process.env.DB_HOST};UID=${process.env.DB_USER};PWD=${process.env.DB_PASSWORD};CCSID=1208;UNICODE=UCS-2`;

// Backoff exponencial: 1s → 2s → 4s → 8s → 16s → 30s (máx)
const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;

let _connectingPromise = null;
let _nextAllowedMs = 0;
let _backoffMs = BACKOFF_INITIAL_MS;

const db = {
    pool: null,

    connect: async () => {
        if (Date.now() < _nextAllowedMs) return;
        if (_connectingPromise) return _connectingPromise;

        _connectingPromise = (async () => {
            if (db.pool) {
                try { await db.pool.close(); } catch (_) { /* ignorar */ }
                db.pool = null;
            }

            console.log(`[${new Date().toISOString()}] 🔄 Creando pool ODBC → ${process.env.DB_HOST}`);
            // Sin initialSize para compatibilidad con driver IBM i ODBC
            // El pool crea conexiones bajo demanda (lazy)
            db.pool = await odbc.pool(getConnStr());
            console.log(`[${new Date().toISOString()}] ✅ Pool ODBC listo`);

            _backoffMs = BACKOFF_INITIAL_MS;
            _nextAllowedMs = 0;
        })()
            .catch(err => {
                db.pool = null;
                _nextAllowedMs = Date.now() + _backoffMs;
                _backoffMs = Math.min(_backoffMs * 2, BACKOFF_MAX_MS);
                console.error(
                    `❌ Pool ODBC falló (próximo intento en ${_backoffMs / 1000}s):`,
                    err.message || err
                );
            })
            .finally(() => { _connectingPromise = null; });

        return _connectingPromise;
    },

    query: async (sql, params = [], _retried = false) => {
        if (!db.pool) {
            await db.connect();
        }

        // Lanzar error en vez de retornar null silencioso
        // Los controllers devolverán 500 vía el error middleware de Express
        if (!db.pool) {
            const err = new Error('Base de datos no disponible');
            err.code = 'DB_UNAVAILABLE';
            err.status = 503;
            throw err;
        }

        try {
            return await db.pool.query(sql, params);
        } catch (err) {
            if (!_retried) {
                console.warn(`⚠️ ODBC error (${err.message || err}), reconectando pool...`);
                db.pool = null;
                await db.connect();
                if (db.pool) return db.query(sql, params, true);
            }
            throw err;
        }
    },

    // Usado por /api/health — no dispara reconexión, solo reporta estado
    validate: async () => {
        if (!db.pool) return false;
        try {
            await db.pool.query('SELECT 1 FROM SYSIBM.SYSDUMMY1');
            return true;
        } catch {
            return false;
        }
    },

    close: async () => {
        if (db.pool) {
            await db.pool.close();
            db.pool = null;
            console.log('🔌 Pool ODBC cerrado.');
        }
    },
};

module.exports = db;
