const mobileVehiculosService = require('../services/mobileVehiculosService');

async function snapshotVehiculosController(req, res) {
  try {
    // Una placa pertenece a una OPERACIÓN, no a un taller — ver el
    // comentario en mobileVehiculosService.obtenerSnapshotVehiculos.
    const usuario = req.usuarioMobile?.id;

    if (!usuario) {
      return res.status(200).json({ vehiculos: [], generado_en: new Date().toISOString() });
    }

    const vehiculos = await mobileVehiculosService.obtenerSnapshotVehiculos(usuario);
    return res.status(200).json({ vehiculos, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileVehiculosController.snapshotVehiculosController]', err);
    return res.status(500).json({ message: 'Error obteniendo snapshot de vehículos' });
  }
}

module.exports = { snapshotVehiculosController };
