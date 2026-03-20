const express = require("express");
const router = express.Router();
const poMantenimientoController = require("../controllers/poMantenimientoController");

/**
 * @swagger
 * /api/registrorotacionneumatico:
 *   post:
 *     summary: Registra la reubicación (rotación) de uno o varios neumáticos en el vehículo
 *     tags:
 *       - Mantenimiento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/ReubicacionNeumatico'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/ReubicacionNeumatico'
 *     responses:
 *       201:
 *         description: Reubicación registrada correctamente
 *       500:
 *         description: Error al registrar la reubicación
 *
 * components:
 *   schemas:
 *     ReubicacionNeumatico:
 *       type: object
 *       properties:
 *         CODIGO: { type: string }
 *         MARCA: { type: string }
 *         MEDIDA: { type: string }
 *         DISEÑO: { type: string }
 *         REMANENTE: { type: integer }
 *         PR: { type: string }
 *         CARGA: { type: string }
 *         VELOCIDAD: { type: string }
 *         FECHA_FABRICACION: { type: string }
 *         RQ: { type: string }
 *         OC: { type: string }
 *         PROYECTO: { type: string }
 *         COSTO: { type: number }
 *         PROVEEDOR: { type: string }
 *         FECHA_REGISTRO: { type: string, format: date }
 *         FECHA_COMPRA: { type: string, format: date }
 *         USUARIO_SUPER: { type: string }
 *         PRESION_AIRE: { type: number }
 *         TORQUE_APLICADO: { type: number }
 *         ESTADO: { type: integer }
 *         PLACA: { type: string }
 *         POSICION_ORIGEN: { type: string, description: "Posición original del neumático" }
 *         POSICION_DESTINO: { type: string, description: "Nueva posición del neumático" }
 *         DESTINO: { type: string }
 *         FECHA_ASIGNACION: { type: string, format: date }
 *         KILOMETRO: { type: integer }
 *         FECHA_MOVIMIENTO: { type: string, format: date-time }
 *         OBSERVACION: { type: string }
 */

router.post("/registrorotacionneumatico", poMantenimientoController.registrarReubicacionNeumatico);

/**
 * @swagger
 * /api/registrardesasignacionneumatico:
 *   post:
 *     summary: Registra la desasignación (baja definitiva o recuperado) de uno o varios neumáticos
 *     tags:
 *       - Mantenimiento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/DesasignacionNeumatico'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/DesasignacionNeumatico'
 *     responses:
 *       201:
 *         description: Desasignación registrada correctamente
 *       500:
 *         description: Error al registrar la desasignación
 *
 * components:
 *   schemas:
 *     DesasignacionNeumatico:
 *       type: object
 *       properties:
 *         CODIGO: { type: string }
 *         MARCA: { type: string }
 *         MEDIDA: { type: string }
 *         DISEÑO: { type: string }
 *         REMANENTE: { type: integer }
 *         PR: { type: string }
 *         CARGA: { type: string }
 *         VELOCIDAD: { type: string }
 *         FECHA_FABRICACION: { type: string }
 *         RQ: { type: string }
 *         OC: { type: string }
 *         PROYECTO: { type: string }
 *         COSTO: { type: number }
 *         PROVEEDOR: { type: string }
 *         FECHA_REGISTRO: { type: string, format: date }
 *         FECHA_COMPRA: { type: string, format: date }
 *         USUARIO_SUPER: { type: string }
 *         TIPO_MOVIMIENTO: { type: string, description: "BAJA DEFINITIVA o RECUPERADO" }
 *         PRESION_AIRE: { type: number }
 *         TORQUE_APLICADO: { type: number }
 *         ESTADO: { type: integer }
 *         PLACA: { type: string }
 *         POSICION_NEU: { type: string }
 *         DESTINO: { type: string }
 *         FECHA_ASIGNACION: { type: string, format: date }
 *         KILOMETRO: { type: integer }
 *         FECHA_MOVIMIENTO: { type: string, format: date-time }
 *         OBSERVACION: { type: string }
 */

router.post("/registrardesasignacionneumatico", poMantenimientoController.registrarDesasignacionNeumatico);

/**
 * @swagger
 * /api/desasignar-con-reemplazo:
 *   post:
 *     summary: Desasignar neumáticos CON asignación de reemplazos (Transacción)
 *     description: Ejecuta asignaciones primero, luego desasignaciones. Todo o nada.
 *     tags:
 *       - Mantenimiento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               desasignaciones:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/DesasignacionNeumatico'
 *               asignaciones:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Operación completada correctamente
 *       500:
 *         description: Error al registrar la operación
 */
router.post("/desasignar-con-reemplazo", poMantenimientoController.desasignarConReemplazo);

/**
 * @swagger
 * /api/ultima-fecha-inspeccion:
 *   get:
 *     summary: Obtener la última fecha de inspección para un neumático y placa
 *     tags:
 *       - Mantenimiento
 *     parameters:
 *       - in: query
 *         name: codigo
 *         schema:
 *           type: string
 *         required: true
 *         description: Código del neumático
 *       - in: query
 *         name: placa
 *         schema:
 *           type: string
 *         required: true
 *         description: Placa del vehículo
 *     responses:
 *       200:
 *         description: Última fecha de inspección encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ultima:
 *                   type: string
 *                   nullable: true
 *                   description: Fecha de la última inspección o null si no existe
 */
router.get('/ultima-fecha-inspeccion', poMantenimientoController.getUltimaFechaInspeccion);

/**
 * @swagger
 * /api/ultima-fecha-inspeccion-por-placa:
 *   get:
 *     summary: Obtener la última fecha de inspección solo por placa
 *     tags:
 *       - Mantenimiento
 *     parameters:
 *       - in: query
 *         name: placa
 *         schema:
 *           type: string
 *         required: true
 *         description: Placa del vehículo
 *     responses:
 *       200:
 *         description: Última fecha de inspección encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ultima:
 *                   type: string
 *                   nullable: true
 *                   description: Fecha de la última inspección o null si no existe
 */
router.get('/ultima-fecha-inspeccion-por-placa', poMantenimientoController.getUltimaFechaInspeccionPorPlaca);

router.get('/fechas-inspeccion-vehicular-por-placa', poMantenimientoController.getFechasInspeccionVehicularPorPlaca);

router.get('/inspecciones-por-placa', poMantenimientoController.getInspeccionesPorPlaca);

router.get('/neumaticos-por-inspeccion', poMantenimientoController.getNeumaticosPorInspeccion);

module.exports = router;
