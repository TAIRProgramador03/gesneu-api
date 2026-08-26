// asignacionMasivaController.js
const { randomUUID } = require('crypto');
const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA || 'SPEED400AT'; // AJUSTAR según cuál uses aquí
const loteStore = require('./../loteStore');
const {
  leerExcelAsignacion,
  generarPlantillaBuffer,
  validarAsignacionMasiva,
  serializarReporte,
  confirmarLote,
} = require('./../services/neumaticosAsignacionMasivaService');

// GET /api/neumaticos/asignacion-masiva/plantilla
const descargarPlantilla = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
  try {
    const buffer = generarPlantillaBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_asignacion_masiva.xlsx"');
    res.send(buffer);
  } catch (error) {
    console.error('Error al generar plantilla de asignación masiva:', error);
    res.status(500).json({ error: 'Error al generar la plantilla' });
  }
};

// POST /api/neumaticos/asignacion-masiva/validar  (multipart/form-data, campo "archivo")
const validarArchivoMasivo = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
  try {
    if (!req.file) return res.status(400).json({ mensaje: 'No se recibió el archivo (campo "archivo")' });

    const usuario = req.session.user.usuario;
    const filas = leerExcelAsignacion(req.file.buffer);
    if (filas.length === 0) return res.status(400).json({ mensaje: 'El Excel no tiene filas de datos' });

    const contexto = await validarAsignacionMasiva(db, BD_SCHEMA, filas);
    const batchId = randomUUID();

    loteStore.guardarLote(batchId, { ...contexto, usuario });

    const reporte = serializarReporte(batchId, filas.length, contexto.reportePorPlaca);
    res.json(reporte);
  } catch (error) {
    console.error('Error al validar asignación masiva:', error);
    res.status(500).json({ error: 'Error al validar el archivo' });
  }
};

// POST /api/neumaticos/asignacion-masiva/confirmar   body: { batchId }
const confirmarArchivoMasivo = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
  try {
    const { batchId } = req.body;
    if (!batchId) return res.status(400).json({ mensaje: 'Falta batchId' });

    const lote = loteStore.obtenerLote(batchId);
    if (!lote) return res.status(410).json({ mensaje: 'El lote venció o no existe, vuelve a subir el archivo' });

    const usuario = req.session.user.usuario;
    const resultado = await confirmarLote(db, BD_SCHEMA, lote, usuario);

    loteStore.eliminarLote(batchId);

    res.json({
      placasRegistradas: resultado.registradas.length,
      neumaticosRegistrados: resultado.registradas.reduce((acc, r) => acc + r.neumaticos, 0),
      placas: resultado.registradas.map((r) => r.placa),
      rechazadas: resultado.rechazadas,
    });
  } catch (error) {
    console.error('Error al confirmar asignación masiva:', error);
    res.status(500).json({ error: 'Error al confirmar la asignación' });
  }
};

// GET /api/neumaticos/asignacion-masiva/lotes/:batchId
const obtenerLoteMasivo = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
  try {
    const lote = loteStore.obtenerLote(req.params.batchId);
    if (!lote) return res.status(404).json({ mensaje: 'Lote no encontrado o vencido' });

    const reporte = serializarReporte(req.params.batchId, null, lote.reportePorPlaca);
    res.json(reporte);
  } catch (error) {
    console.error('Error al obtener lote de asignación masiva:', error);
    res.status(500).json({ error: 'Error al obtener el lote' });
  }
};

// GET /api/neumaticos/asignacion-masiva/reporte/:batchId
const descargarReporte = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
  try {
    const lote = loteStore.obtenerLote(req.params.batchId);
    if (!lote) return res.status(404).json({ mensaje: 'Lote no encontrado o vencido' });

    const buffer = generarReporteBuffer(lote.reportePorPlaca);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_asignacion_${req.params.batchId}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error al generar reporte de asignación masiva:', error);
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
};

module.exports = {
  descargarPlantilla,
  validarArchivoMasivo,
  confirmarArchivoMasivo,
  obtenerLoteMasivo,
  descargarReporte
};