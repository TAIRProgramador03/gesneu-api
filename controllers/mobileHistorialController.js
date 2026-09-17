const mobileHistorialService = require('../services/mobileHistorialService');

async function inspeccionesController(req, res) {
  const { placa } = req.query;
  if (!placa) return res.status(400).json({ message: 'Falta el parametro placa' });

  try {
    const inspecciones = await mobileHistorialService.obtenerInspeccionesPorPlaca(placa.trim().toUpperCase());
    return res.status(200).json({ inspecciones });
  } catch (err) {
    console.error('[mobileHistorialController.inspeccionesController]', err);
    return res.status(500).json({ message: 'Error al consultar el historial de inspecciones' });
  }
}

async function detalleInspeccionController(req, res) {
  const { placa, fecha } = req.query;
  if (!placa || !fecha) return res.status(400).json({ message: 'Faltan los parametros placa/fecha' });

  try {
    const neumaticos = await mobileHistorialService.obtenerNeumaticosPorInspeccion(placa.trim().toUpperCase(), fecha);
    return res.status(200).json({ neumaticos });
  } catch (err) {
    console.error('[mobileHistorialController.detalleInspeccionController]', err);
    return res.status(500).json({ message: 'Error al consultar el detalle de la inspeccion' });
  }
}

module.exports = { inspeccionesController, detalleInspeccionController };
