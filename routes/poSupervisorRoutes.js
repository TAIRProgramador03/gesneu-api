const express = require('express');
const router = express.Router();
const { getSupervisores } = require('../controllers/poSupervisoresController');

/**
 * @swagger
 * /api/po-supervisores:
 *   get:
 *     summary: Obtener lista de supervisores
 *     tags: [Supervisores]
 *     responses:
 *       200:
 *         description: Lista de supervisores
 *         content:
 *           application/json:
 *             example:
 *               - ID: 1
 *                 CODPLA: "001"
 *                 APE: "PEREZ"
 *                 NOM: "JUAN"
 *                 SITUACION: "ACTIVO"
 *                 EMAIL: "juan.perez@example.com"
 *       500:
 *         description: Error del servidor
 */
router.get('/po-supervisores', getSupervisores);

module.exports = router;
