const express = require("express");
const router = express.Router();
const { asignarNeumatico } = require("../controllers/poAsignarNeumaticoController");

/**
 * @swagger
 * /api/po-asignar-neumatico:
 *   post:
 *     summary: Asignar uno o varios neumáticos a un vehículo
 *     description: >
 *       Requiere sesión autenticada. El usuario que realiza la asignación se toma automáticamente de la sesión y no debe enviarse en el body.
 *       Puede enviar un objeto para una sola asignación o un array de objetos para asignaciones en lote.
 *     tags: [Asignar Neumático]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/AsignarNeumaticoInput'
 *               - type: array
 *                 items:
 *                   $ref: '#/components/schemas/AsignarNeumaticoInput'
 *           examples:
 *             EjemploUnico:
 *               summary: Asignar un solo neumático
 *               value:
 *                 CodigoNeumatico: 12345
 *                 Remanente: 10.5
 *                 PresionAire: 32
 *                 TorqueAplicado: 120
 *                 Placa: "ABC123"
 *                 Posicion: "DELANTERA_IZQUIERDA"
 *                 Odometro: 50000
 *                 FechaRegistro: "2025-06-10"
 *             EjemploArray:
 *               summary: Asignar varios neumáticos
 *               value:
 *                 - CodigoNeumatico: 2395
 *                   Remanente: 20
 *                   PresionAire: 30
 *                   TorqueAplicado: 110
 *                   Placa: "AXT-313"
 *                   Posicion: "POS01"
 *                   Odometro: 14002
 *                   FechaRegistro: "2025-06-10"
 *                 - CodigoNeumatico: 2398
 *                   Remanente: 19
 *                   PresionAire: 29
 *                   TorqueAplicado: 111
 *                   Placa: "AXT-313"
 *                   Posicion: "POS02"
 *                   Odometro: 14002
 *                   FechaRegistro: "2025-06-10"
 *     responses:
 *       200:
 *         description: Neumático asignado correctamente
 *       207:
 *         description: Resultado de asignaciones múltiples (lote)
 *       400:
 *         description: Error de validación
 *       401:
 *         description: No autenticado
 *       409:
 *         description: El neumático ya está asignado a otro vehículo o posición
 *       500:
 *         description: Error del servidor
 *
 * components:
 *   schemas:
 *     AsignarNeumaticoInput:
 *       type: object
 *       required:
 *         - CodigoNeumatico
 *         - Remanente
 *         - PresionAire
 *         - TorqueAplicado
 *         - Placa
 *         - Posicion
 *         - Odometro
 *         - FechaRegistro
 *       properties:
 *         CodigoNeumatico:
 *           type: integer
 *           description: Código del neumático
 *           example: 12345
 *         Remanente:
 *           type: number
 *           description: Remanente del neumático
 *           example: 10.5
 *         PresionAire:
 *           type: number
 *           description: Presión de aire
 *           example: 32
 *         TorqueAplicado:
 *           type: number
 *           description: Torque aplicado
 *           example: 120
 *         Placa:
 *           type: string
 *           description: Placa del vehículo
 *           example: "ABC123"
 *         Posicion:
 *           type: string
 *           description: Posición del neumático
 *           example: "DELANTERA_IZQUIERDA"
 *         Odometro:
 *           type: integer
 *           description: Kilometraje del vehículo
 *           example: 50000
 *         FechaRegistro:
 *           type: string
 *           format: date
 *           description: Fecha de asignación (YYYY-MM-DD)
 *           example: "2025-06-10"
 */
router.post("/", asignarNeumatico);

module.exports = router;
