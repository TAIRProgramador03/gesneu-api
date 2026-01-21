const express = require("express");
const router = express.Router();
const poMovimientoController = require("../controllers/poMovimientoController");

/**
 * @swagger
 * /api/po-movimiento/historial-codigo/{codigo}:
 *   get:
 *     summary: Obtiene el historial completo de movimientos de un neumático por su código
 *     tags:
 *       - Movimientos
 *     parameters:
 *       - in: path
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *         description: "Código del neumático (ejemplo: 1001)"
 *     responses:
 *       200:
 *         description: Historial completo de movimientos del neumático
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID_MOVIMIENTO:
 *                     type: integer
 *                   CODIGO:
 *                     type: string
 *                   POSICION_NEU:
 *                     type: string
 *                   TIPO_MOVIMIENTO:
 *                     type: string
 *                   FECHA_MOVIMIENTO:
 *                     type: string
 *                     format: date-time
 *                   KILOMETRO:
 *                     type: integer
 *                   PLACA:
 *                     type: string
 *                   USUARIO_SUPER:
 *                     type: string
 *       400:
 *         description: El código es requerido
 *       500:
 *         description: Error al obtener historial de movimientos por código
 */
router.get("/historial-codigo/:codigo", poMovimientoController.obtenerHistorialMovimientosPorCodigo);

/**
 * @swagger
 * /api/po-movimiento/ultimos/{placa}:
 *   get:
 *     summary: Obtiene el último movimiento de cada neumático instalado en una placa
 *     tags:
 *       - Movimientos
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         schema:
 *           type: string
 *         description: "Placa del vehiculo (ejemplo: BBD-715)"
 *     responses:
 *       200:
 *         description: Últimos movimientos de cada neumático en la placa
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID_MOVIMIENTO:
 *                     type: integer
 *                   CODIGO:
 *                     type: string
 *                   MARCA:
 *                     type: string
 *                   MEDIDA:
 *                     type: string
 *                   DISEÑO:
 *                     type: string
 *                   REMANENTE:
 *                     type: integer
 *                   PR:
 *                     type: string
 *                   CARGA:
 *                     type: string
 *                   VELOCIDAD:
 *                     type: string
 *                   FECHA_FABRICACION:
 *                     type: string
 *                   RQ:
 *                     type: string
 *                   OC:
 *                     type: string
 *                   PROYECTO:
 *                     type: string
 *                   COSTO:
 *                     type: number
 *                   PROVEEDOR:
 *                     type: string
 *                   FECHA_REGISTRO:
 *                     type: string
 *                     format: date
 *                   FECHA_COMPRA:
 *                     type: string
 *                     format: date
 *                   USUARIO_SUPER:
 *                     type: string
 *                   TIPO_MOVIMIENTO:
 *                     type: string
 *                   PRESION_AIRE:
 *                     type: number
 *                   TORQUE_APLICADO:
 *                     type: number
 *                   ESTADO:
 *                     type: integer
 *                   PLACA:
 *                     type: string
 *                   POSICION_NEU:
 *                     type: string
 *                   FECHA_ASIGNACION:
 *                     type: string
 *                     format: date
 *                   KILOMETRO:
 *                     type: integer
 *                   FECHA_MOVIMIENTO:
 *                     type: string
 *                     format: date-time
 *       400:
 *         description: La placa es requerida
 *       500:
 *         description: Error al obtener últimos movimientos de neumáticos
 */
router.get("/ultimos/:placa", poMovimientoController.listarUltimosMovimientosPorPlaca);

/**
 * @swagger
 * /api/po-movimiento/ultimos-codigo/{codigo}:
 *   get:
 *     summary: Obtiene el último movimiento general de un neumático por su código
 *     tags:
 *       - Movimientos
 *     parameters:
 *       - in: path
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *         description: "Código del neumático (ejemplo: 1001)"
 *     responses:
 *       200:
 *         description: Último movimiento general del neumático
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   ID_MOVIMIENTO:
 *                     type: integer
 *                   CODIGO:
 *                     type: string
 *                   MARCA:
 *                     type: string
 *                   MEDIDA:
 *                     type: string
 *                   DISEÑO:
 *                     type: string
 *                   REMANENTE:
 *                     type: integer
 *                   PR:
 *                     type: string
 *                   CARGA:
 *                     type: string
 *                   VELOCIDAD:
 *                     type: string
 *                   FECHA_FABRICACION:
 *                     type: string
 *                   RQ:
 *                     type: string
 *                   OC:
 *                     type: string
 *                   PROYECTO:
 *                     type: string
 *                   COSTO:
 *                     type: number
 *                   PROVEEDOR:
 *                     type: string
 *                   FECHA_REGISTRO:
 *                     type: string
 *                     format: date
 *                   FECHA_COMPRA:
 *                     type: string
 *                     format: date
 *                   USUARIO_SUPER:
 *                     type: string
 *                   TIPO_MOVIMIENTO:
 *                     type: string
 *                   PRESION_AIRE:
 *                     type: number
 *                   TORQUE_APLICADO:
 *                     type: number
 *                   ESTADO:
 *                     type: integer
 *                   PLACA:
 *                     type: string
 *                   POSICION_NEU:
 *                     type: string
 *                   FECHA_ASIGNACION:
 *                     type: string
 *                     format: date
 *                   KILOMETRO:
 *                     type: integer
 *                   FECHA_MOVIMIENTO:
 *                     type: string
 *                     format: date-time
 *       400:
 *         description: El código es requerido
 *       500:
 *         description: Error al obtener últimos movimientos por código
 */
router.get("/ultimos-codigo/:codigo", poMovimientoController.obtenerUltimosMovimientosPorCodigo);

module.exports = router;
