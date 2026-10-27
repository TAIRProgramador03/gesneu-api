const mobileSalidasService = require('../services/mobileSalidasService');

/**
 * Salidas de almacen (S60) emparejadas, ventana de 4 dias. Alcance CORREGIDO
 * (13-oct-2026): filtra por las OPERACIONES del usuario
 * (`MAE_OPERACION_X_USUARIO`, vía `req.usuarioMobile.id`), no por los
 * talleres del JWT — una placa pertenece a una operación, no a un taller.
 * Ver el comentario en mobileSalidasService.obtenerSnapshotSalidas.
 */
async function snapshotSalidasController(req, res) {
  try {
    const usuario = req.usuarioMobile?.id;

    if (!usuario) {
      return res.status(200).json({ salidas: [], generado_en: new Date().toISOString() });
    }

    const salidas = await mobileSalidasService.obtenerSnapshotSalidas(usuario);
    return res.status(200).json({ salidas, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileSalidasController.snapshotSalidasController]', err);
    return res.status(500).json({ message: 'Error obteniendo snapshot de salidas de almacén' });
  }
}

module.exports = { snapshotSalidasController };
