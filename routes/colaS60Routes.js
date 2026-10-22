const express = require('express');
const router = express.Router();
const colaS60Controller = require('../controllers/colaS60Controller');

/**
 * @swagger
 * tags:
 *   name: Cola S60
 *   description: Cola obligatoria de regularizacion de salidas S60
 */

/**
 * @swagger
 * /api/cola-s60/estado:
 *   get:
 *     summary: Estado de la cola para los talleres del usuario logueado
 *     description: >
 *       Devuelve la S60 que toca regularizar (la mas antigua pendiente) con sus
 *       lineas todavia abiertas. Si no hay pendientes, `hayPendientes` es false
 *       y no se bloquea ninguna placa.
 *     tags: [Cola S60]
 *     responses:
 *       200:
 *         description: Estado de la cola
 *       401:
 *         description: No autenticado
 */
router.get('/estado', colaS60Controller.obtenerEstado);

/**
 * @swagger
 * /api/cola-s60/pendientes:
 *   get:
 *     summary: Cola completa en orden
 *     tags: [Cola S60]
 *     parameters:
 *       - in: query
 *         name: limite
 *         schema: { type: integer, default: 50, maximum: 500 }
 *     responses:
 *       200:
 *         description: Lineas de S60 pendientes, de la mas antigua a la mas nueva
 *       401:
 *         description: No autenticado
 */
router.get('/pendientes', colaS60Controller.listarPendientes);

/**
 * @swagger
 * /api/cola-s60/placa/{placa}:
 *   get:
 *     summary: Si una placa se puede trabajar ahora
 *     tags: [Cola S60]
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: "{ habilitada, cabeza, mensaje }"
 *       401:
 *         description: No autenticado
 */
router.get('/placa/:placa', colaS60Controller.verificarPlaca);

module.exports = router;
