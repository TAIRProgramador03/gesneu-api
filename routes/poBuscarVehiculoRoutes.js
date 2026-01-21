const express = require('express');
const router = express.Router();
const poBuscarVehiculoController = require('../controllers/poBuscarVehiculoController');

/**
 * @swagger
 * /api/vehiculo/cantidad:
 *   get:
 *     summary: Obtener la cantidad de placas/vehículos asignados al usuario autenticado
 *     description: Devuelve la cantidad total de placas (vehículos) asignadas al usuario autenticado según la lógica de usuario_super.
 *     tags:
 *       - Vehículos
 *     responses:
 *       200:
 *         description: Cantidad de placas asignadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 19
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: No autenticado
 *       500:
 *         description: Error interno
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al obtener cantidad de placas
 *                 detalle:
 *                   type: string
 */
router.get('/cantidad', poBuscarVehiculoController.obtenerCantidadPlacas);

/**
 * @swagger
 * /api/vehiculo/cantidad-por-supervisor:
 *   get:
 *     summary: Listar la cantidad de placas/vehículos por supervisor
 *     description: Devuelve un array con todos los supervisores (usuario_super) y la cantidad de placas/vehículos asignados a cada uno.
 *     tags:
 *       - Vehículos
 *     responses:
 *       200:
 *         description: Lista de supervisores y cantidad de placas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   usuario_super:
 *                     type: string
 *                     example: "LVARGAS"
 *                   cantidad:
 *                     type: integer
 *                     example: 19
 *       500:
 *         description: Error interno
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al obtener cantidad de placas por supervisor
 *                 detalle:
 *                   type: string
 */
router.get('/cantidad-por-supervisor', poBuscarVehiculoController.obtenerCantidadPlacasPorSupervisor);

/**
 * @swagger
 * /api/vehiculo/buscar-todas/{placa}:
 *   get:
 *     summary: Buscar vehículo por placa en toda la empresa (sin filtro de usuario)
 *     description: Devuelve información detallada del vehículo cuya placa coincida, sin importar el usuario asignado.
 *     tags:
 *       - Vehículos
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         description: Placa del vehículo a buscar
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información detallada del vehículo (toda la empresa)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 PLACA:
 *                   type: string
 *                   example: "BHG-874"
 *                 MARCA:
 *                   type: string
 *                   example: "TOYOTA"
 *                 MODELO:
 *                   type: string
 *                   example: "HILUX"
 *                 TIPO:
 *                   type: string
 *                   example: "CAMIONETA"
 *                 COLOR:
 *                   type: string
 *                   example: "BLANCO"
 *                 ANO:
 *                   type: integer
 *                   example: 2022
 *                 KILOMETRAJE:
 *                   type: integer
 *                   example: 35000
 *                 PROYECTO:
 *                   type: string
 *                   example: "TAR ARQUIPA"
 *                 ID_OPERACION:
 *                   type: integer
 *                   example: 1234
 *                 OPERACION:
 *                   type: string
 *                   example: "TAR ARQUIPA"
 *                 USUARIO_SUPER:
 *                   type: string
 *                   example: "LVARGAS"
 *       404:
 *         description: Vehículo no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Vehículo no encontrado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al buscar vehículo por placa (empresa)
 *                 detalle:
 *                   type: string
 */
router.get('/buscar-todas/:placa', poBuscarVehiculoController.buscarVehiculoPorPlacaEmpresa);

/**
 * @swagger
 * /api/vehiculo/{placa}:
 *   get:
 *     summary: Buscar vehículo por placa (solo placas asignadas al usuario autenticado)
 *     description: >-
 *       Devuelve información detallada del vehículo cuya placa esté asignada al usuario autenticado. Si la placa no pertenece al usuario, devuelve 404.
 *     tags:
 *       - Vehículos
 *     parameters:
 *       - in: path
 *         name: placa
 *         required: true
 *         description: Placa del vehículo a buscar
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Información detallada del vehículo (solo si pertenece al usuario autenticado)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 PLACA:
 *                   type: string
 *                   example: "BHG-874"
 *                 MARCA:
 *                   type: string
 *                   example: "HYUNDAI"
 *                 MODELO:
 *                   type: string
 *                   example: "TUCSON"
 *                 TIPO:
 *                   type: string
 *                   example: "SUV"
 *                 COLOR:
 *                   type: string
 *                   example: "BLANCO"
 *                 ANO:
 *                   type: integer
 *                   example: 2022
 *                 KILOMETRAJE:
 *                   type: integer
 *                   example: 35000
 *                 PROYECTO:
 *                   type: string
 *                   example: "PROYECTO A"
 *                 ID_OPERACION:
 *                   type: integer
 *                   example: 1234
 *                 OPERACION:
 *                   type: string
 *                   example: "OPERACIÓN LIMA"
 *                 USUARIO_SUPER:
 *                   type: string
 *                   example: "LVARGAS"
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: No autenticado
 *       404:
 *         description: Vehículo no encontrado o no asignado al usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Vehículo no encontrado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Error al buscar vehículo por placa
 *                 detalle:
 *                   type: string
 */
router.get('/:placa', poBuscarVehiculoController.buscarVehiculoPorPlaca);

module.exports = router;
