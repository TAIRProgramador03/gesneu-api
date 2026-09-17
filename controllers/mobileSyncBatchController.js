const mobileSyncBatchService = require('../services/mobileSyncBatchService');

async function batchSyncController(req, res) {
  try {
    const usuarioId = req.usuarioMobile?.id;
    const operaciones = req.body?.operaciones;

    if (!Array.isArray(operaciones) || operaciones.length === 0) {
      return res.status(400).json({ message: 'Falta el array "operaciones"' });
    }

    const resultados = await mobileSyncBatchService.aplicarBatch(operaciones, usuarioId);
    return res.status(200).json({ resultados });
  } catch (err) {
    console.error('[mobileSyncBatchController.batchSyncController]', err);
    return res.status(500).json({ message: 'Error procesando el batch de sincronización' });
  }
}

module.exports = { batchSyncController };
