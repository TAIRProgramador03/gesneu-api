const express = require("express");
const router = express.Router();
const poInspeccionController = require("../controllers/poInspeccionController");

/**
 * @swagger
 * /api/inspeccion:
 *   post:
 *     summary: Registra una o varias inspecciones de neumáticos y su movimiento asociado
 *     description: >-
 *       Permite registrar una inspección de neumático o un lote de inspecciones (enviar un objeto o un array de objetos). Cada inspección genera también un registro en NEU_MOVIMIENTO.
 *     tags:
 *       - Inspección
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/InspeccionNeumatico'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/InspeccionNeumatico'
 *           example:
 *             - CODIGO: "2114"
 *               MARCA: "PIRELLI"
 *               MEDIDA: "225/60R17"
 *               DISEÑO: "H/T"
 *               REMANENTE: 13
 *               PR: "6"
 *               CARGA: "1400"
 *               VELOCIDAD: "180"
 *               FECHA_FABRICACION: "3521-01-01"
 *               RQ: ""
 *               OC: "180"
 *               PROYECTO: "ILO"
 *               COSTO: 138.06
 *               OBSERVACION: "prueba inspeccion array"
 *               PROVEEDOR: "LLANTACENTRO GEPSA E I R L"
 *               FECHA_REGISTRO: "2025-06-09"
 *               FECHA_COMPRA: "2019-05-19"
 *               USUARIO_SUPER: "AHELFER"
 *               TIPO_MOVIMIENTO: "INSPECCION"
 *               PRESION_AIRE: 33
 *               TORQUE_APLICADO: 121
 *               ESTADO: 100
 *               PLACA: "AVR-701"
 *               POSICION_NEU: "POS01"
 *               FECHA_ASIGNACION: "2025-06-09"
 *               KILOMETRO: 275588
 *               FECHA_MOVIMIENTO: "2025-06-09T20:32:06.510Z"
 *     responses:
 *       201:
 *         description: Inspección(es) y movimiento(s) registrados correctamente
 *         content:
 *           application/json:
 *             example:
 *               mensaje: "Inspección(es) y movimiento(s) registrados correctamente"
 *               idsInspeccion: [1,2,3]
 *       400:
 *         description: Error de validación en los datos enviados
 *       500:
 *         description: Error interno al registrar inspección
 *
 * components:
 *   schemas:
 *     InspeccionNeumatico:
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
 *         OBSERVACION: { type: string }
 *         PROVEEDOR: { type: string }
 *         FECHA_REGISTRO: { type: string, format: date }
 *         FECHA_COMPRA: { type: string, format: date }
 *         USUARIO_SUPER: { type: string }
 *         TIPO_MOVIMIENTO: { type: string }
 *         PRESION_AIRE: { type: number }
 *         TORQUE_APLICADO: { type: number }
 *         ESTADO: { type: integer }
 *         PLACA: { type: string }
 *         POSICION_NEU: { type: string }
 *         FECHA_ASIGNACION: { type: string, format: date }
 *         KILOMETRO: { type: integer }
 *         FECHA_MOVIMIENTO: { type: string, format: date-time }
 */
router.post("/", poInspeccionController.crearInspeccion);

/**
 * @swagger
 * /api/inspeccion/existe:
 *   get:
 *     summary: Consulta si existe una inspección para un neumático y placa en una fecha específica
 *     description: >-
 *       Devuelve si existe una inspección para el neumático y placa en la fecha dada (YYYY-MM-DD). Si no existe, devuelve la fecha de la última inspección registrada.
 *     tags:
 *       - Inspección
 *     parameters:
 *       - in: query
 *         name: codigo
 *         required: true
 *         schema:
 *           type: string
 *         description: Código del neumático
 *       - in: query
 *         name: placa
 *         required: true
 *         schema:
 *           type: string
 *         description: Placa del vehículo
 *       - in: query
 *         name: fecha
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha a consultar (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Resultado de la consulta
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 existe:
 *                   type: boolean
 *                   description: Indica si existe inspección para la fecha dada
 *                 fecha:
 *                   type: string
 *                   format: date
 *                   description: Fecha de la inspección encontrada (si existe)
 *                 ultima:
 *                   type: string
 *                   format: date
 *                   description: Fecha de la última inspección registrada (si no existe para la fecha dada)
 *             examples:
 *               existe:
 *                 value: { "existe": true, "fecha": "2025-06-12" }
 *               noExiste:
 *                 value: { "existe": false, "ultima": "2025-06-10" }
 *       400:
 *         description: Faltan parámetros requeridos
 *       500:
 *         description: Error interno al consultar inspección
 */
router.get("/existe", poInspeccionController.existeInspeccionHoy);

module.exports = router;