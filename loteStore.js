// loteStore.js
// Almacén temporal en memoria para los lotes validados (opción rápida sin
// Redis/tabla nueva). Si el backend corre en varias instancias/PM2 cluster,
// esto debe migrarse a Redis o a una tabla temporal en DB2.

const lotes = new Map();
const TTL_MS = 10 * 60 * 1000; // 10 minutos de vida

function guardarLote(batchId, data) {
  lotes.set(batchId, { ...data, creadoEn: Date.now() });
}

function obtenerLote(batchId) {
  const lote = lotes.get(batchId);
  if (!lote) return null;
  if (Date.now() - lote.creadoEn > TTL_MS) {
    lotes.delete(batchId);
    return null;
  }
  return lote;
}

function eliminarLote(batchId) {
  lotes.delete(batchId);
}

// Limpieza periódica de lotes vencidos que nadie confirmó ni descartó
setInterval(() => {
  const ahora = Date.now();
  for (const [id, lote] of lotes) {
    if (ahora - lote.creadoEn > TTL_MS) lotes.delete(id);
  }
}, 5 * 60 * 1000);

module.exports = { guardarLote, obtenerLote, eliminarLote };