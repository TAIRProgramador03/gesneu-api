const express = require("express");
const router = express.Router();
const poAsignadosController = require("../controllers/poAsignadosController");

/**
 * @swagger
 * /api/po-asignados/{placa}:
 *   get:
 *     summary: Obtener neumáticos asignados vigentes por placa (uno por posición, excluye los dados de baja definitiva)
 *     description: >-
 *       Devuelve la lista de neumáticos actualmente asignados a un vehículo, mostrando solo el neumático vigente por cada posición (el de mayor fecha de asignación) y excluyendo aquellos cuya última acción registrada en movimientos es "BAJA DEFINITIVA".
 *     tags: [Neumáticos Asignados]
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         description: Placa del vehículo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de neumáticos asignados vigentes (uno por posición, sin los dados de baja definitiva)
 *         content:
 *           application/json:
 *             example:
 *               - ID: 1
 *                 PLACA: "BLR-241"
 *                 POSICION: "POS01"
 *                 CODIGO: 1001
 *                 MARCA: "PIRELLI"
 *                 MEDIDA: "245/75R16"
 *                 REMANENTE: 14
 *                 ESTADO: "ASIGNADO"
 *                 FECHA_ASIGNADO: "2025-05-09"
 *                 USUARIO_ASIGNA: "JZAVALETA"
 *       400:
 *         description: Error de validación
 *       500:
 *         description: Error del servidor
 */
router.get("/:placa", poAsignadosController.listarNeumaticosAsignados);

/**
 * @swagger
 * /api/po-asignados/ultimo-movimiento/{placa}:
 *   get:
 *     summary: Obtener el último movimiento de cada posición de un vehículo por placa (sin BAJA DEFINITIVA ni RECUPERADO)
 *     tags: [Neumáticos Asignados]
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         description: Placa del vehículo
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Últimos movimientos por posición
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       400:
 *         description: La placa es requerida
 *       500:
 *         description: Error al obtener últimos movimientos por placa
 */
router.get("/ultimo-movimiento/:placa", poAsignadosController.listaUltimoMovPlaca);

module.exports = router;
