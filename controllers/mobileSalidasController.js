const mobileSalidasService = require('../services/mobileSalidasService');

/**
 * Salidas de almacen (S60) emparejadas de los talleres del tecnico, ventana de
 * 4 dias. Mismo contrato que los otros dos snapshots: filtra por los talleres
 * del JWT, nunca por usuario individual.
 */
async function snapshotSalidasController(req, res) {
  try {
    const talleres = req.usuarioMobile?.talleres;

    if (!Array.isArray(talleres) || talleres.length === 0) {
      return res.status(200).json({ salidas: [], generado_en: new Date().toISOString() });
    }

    const salidas = await mobileSalidasService.obtenerSnapshotSalidas(talleres);
    return res.status(200).json({ salidas, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileSalidasController.snapshotSalidasController]', err);
    return res.status(500).json({ message: 'Error obteniendo snapshot de salidas de almacén' });
  }
}

module.exports = { snapshotSalidasController };
