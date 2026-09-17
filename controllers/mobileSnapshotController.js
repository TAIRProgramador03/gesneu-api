const mobileSnapshotService = require('../services/mobileSnapshotService');

async function snapshotNeumaticosController(req, res) {
  try {
    const talleres = req.usuarioMobile?.talleres;

    if (!Array.isArray(talleres) || talleres.length === 0) {
      return res.status(200).json({ neumaticos: [], generado_en: new Date().toISOString() });
    }

    const neumaticos = await mobileSnapshotService.obtenerSnapshotNeumaticos(talleres);
    return res.status(200).json({ neumaticos, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileSnapshotController.snapshotNeumaticosController]', err);
    return res.status(500).json({ message: 'Error obteniendo snapshot de neumáticos' });
  }
}

module.exports = { snapshotNeumaticosController };
