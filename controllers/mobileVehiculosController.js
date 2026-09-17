const mobileVehiculosService = require('../services/mobileVehiculosService');

async function snapshotVehiculosController(req, res) {
  try {
    const talleres = req.usuarioMobile?.talleres;

    if (!Array.isArray(talleres) || talleres.length === 0) {
      return res.status(200).json({ vehiculos: [], generado_en: new Date().toISOString() });
    }

    const vehiculos = await mobileVehiculosService.obtenerSnapshotVehiculos(talleres);
    return res.status(200).json({ vehiculos, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileVehiculosController.snapshotVehiculosController]', err);
    return res.status(500).json({ message: 'Error obteniendo snapshot de vehículos' });
  }
}

module.exports = { snapshotVehiculosController };
