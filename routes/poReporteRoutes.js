const express = require('express');
const router = express.Router();
const poReporteController = require('../controllers/poReporteController');

/**
 * @swagger
 * /api/po-reportes/disponibles-por-mes:
 *   get:
 *     summary: Obtener cantidad de neumáticos disponibles por mes para un usuario
 *     tags:
 *       - Reportes
 *     parameters:
 *       - in: query
 *         name: usuario
 *         schema:
 *           type: string
 *         required: true
 *         description: Código del usuario
 *     responses:
 *       200:
 *         description: Lista de fechas y cantidades
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   fecha:
 *                     type: string
 *                   cantidad:
 *                     type: integer
 */

// Endpoint para cantidad de neumáticos disponibles por mes
router.get('/disponibles-por-mes', poReporteController.getDisponiblesPorMes);

/**
 * @swagger
 * /api/po-reportes/asignados-por-mes:
 *   get:
 *     summary: Obtener cantidad de neumáticos asignados por mes para un usuario
 *     tags:
 *       - Reportes
 *     parameters:
 *       - in: query
 *         name: usuario
 *         schema:
 *           type: string
 *         required: true
 *         description: Código del usuario
 *     responses:
 *       200:
 *         description: Lista de fechas y cantidades
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   fecha:
 *                     type: string
 *                   cantidad:
 *                     type: integer
 */

// Endpoint para cantidad de neumáticos asignados por mes
router.get('/asignados-por-mes', poReporteController.getAsignadosPorMes);

/**
 * @swagger
 * /api/po-reportes/neu-inspeccion-por-fechas:
 *   get:
 *     summary: Obtener inspecciones de neumáticos por rango de fechas y usuario
 *     tags:
 *       - Reportes
 *     parameters:
 *       - in: query
 *         name: usuario
 *         schema:
 *           type: string
 *         required: true
 *         description: Código del usuario
 *       - in: query
 *         name: fechaInicio
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Fecha de inicio del rango (YYYY-MM-DD)
 *       - in: query
 *         name: fechaFin
 *         schema:
 *           type: string
 *           format: date
 *         required: true
 *         description: Fecha de fin del rango (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lista de inspecciones
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   CODIGO:
 *                     type: string
 *                   POSICION:
 *                     type: string
 *                   REMANENTE:
 *                     type: number
 *                   KILOMETRAJE:
 *                     type: number
 *                   FECHA_REGISTRO:
 *                     type: string
 *                   PLACA:
 *                     type: string
 *                   USUARIO_SUPER:
 *                     type: string
 */

// Endpoint para inspecciones de neumáticos por rango de fechas
router.get('/neu-inspeccion-por-fechas', poReporteController.getNeuInspeccionPorFechas);

module.exports = router;