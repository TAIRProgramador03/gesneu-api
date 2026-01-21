const express = require('express');
const router = express.Router();
const poNeumaticoController = require('../controllers/poNeumaticoController');

/**
 * @swagger
 * tags:
 *   - name: Neumáticos
 *     description: Gestión de neumáticos
 */

/**
 * @swagger
 * /api/po-neumaticos:
 *   get:
 *     summary: Obtener neumáticos según el perfil del usuario
 *     description: >-
 *       - Si el usuario tiene perfil 005 (OPERACIONES), obtiene todos los neumáticos.
 *       - Si el usuario tiene perfil 002 (JEFE DE TALLER), solo obtiene los neumáticos asignados a él (USUARIO_SUPER).
 *       - Otros perfiles no tienen acceso a este recurso.
 *     tags:
 *       - Neumáticos
 *     responses:
 *       '200':
 *         description: Lista de neumáticos filtrada según el perfil del usuario autenticado
 *         content:
 *           application/json:
 *             example:
 *               - CODIGO: 1000
 *                 MARCA: "PIRELLI"
 *                 MEDIDA: "245/75R16"
 *                 ESTADO: "DISPONIBLE"
 *       '401':
 *         description: No autenticado o sin permisos
 */
router.get('/', poNeumaticoController.getPoNeumaticos);


/**
 * @swagger
 * /api/po-neumaticos/{codigo}:
 *   put:
 *     summary: Actualizar un neumático por código
 *     tags:
 *       - Neumáticos
 *     parameters:
 *       - name: codigo
 *         in: path
 *         required: true
 *         description: Código del neumático a actualizar
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marca:
 *                 type: string
 *                 description: Marca del neumático
 *               medida:
 *                 type: string
 *                 description: Medida del neumático
 *               estado:
 *                 type: string
 *                 description: Estado del neumático
 *     responses:
 *       '200':
 *         description: Neumático actualizado correctamente
 *       '400':
 *         description: Error de validación
 *       '500':
 *         description: Error del servidor
 */
router.put('/:codigo', poNeumaticoController.actualizarNeumatico);


/**
 * @swagger
 * /api/po-neumaticos/{codigo}:
 *   delete:
 *     summary: Eliminar un neumático por código
 *     tags: [Neumáticos]
 *     parameters:
 *       - in: path
 *         name: codigo
 *         schema:
 *           type: integer
 *         required: true
 *         description: Código del neumático a eliminar
 *     responses:
 *       '200':
 *         description: Neumático eliminado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Neumático eliminado correctamente
 *       '400':
 *         description: Código inválido
 *       '404':
 *         description: Neumático no encontrado
 *       '500':
 *         description: Error del servidor
 */
router.delete('/:codigo', poNeumaticoController.eliminarNeumatico);

/**
 * @swagger
 * /api/po-neumaticos/proyectos/cantidad:
 *   get:
 *     summary: Obtener la cantidad de proyectos 
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad de proyectos distintos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 5
 *       500:
 *         description: Error al contar proyectos
 */
router.get('/proyectos/cantidad', poNeumaticoController.contarProyectosNeumatico);

/**
 * @swagger
 * /api/po-neumaticos/cantidad:
 *   get:
 *     summary: Obtener la cantidad total de neumáticos según el perfil del usuario
 *     description: >-
 *       - Si el usuario tiene perfil 005 (OPERACIONES), obtiene la cantidad total de neumáticos.
 *       - Si el usuario tiene perfil 002 (JEFE DE TALLER), obtiene solo la cantidad de neumáticos asignados a él (USUARIO_SUPER).
 *       - Otros perfiles no tienen acceso a este recurso.
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad total de neumáticos según el perfil del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 100
 *       401:
 *         description: No autenticado o sin permisos
 *       500:
 *         description: Error al contar neumáticos
 */
router.get('/cantidad', poNeumaticoController.contarNeumaticos);

/**
 * @swagger
 * /api/po-neumaticos/asignados/cantidad:
 *   get:
 *     summary: Obtener la cantidad de neumáticos asignados según el perfil del usuario
 *     description: >-
 *       - Si el usuario tiene perfil 005 (OPERACIONES), obtiene la cantidad total de neumáticos asignados.
 *       - Si el usuario tiene perfil 002 (JEFE DE TALLER), obtiene solo la cantidad de neumáticos asignados a él (USUARIO_SUPER).
 *       - Otros perfiles no tienen acceso a este recurso.
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad de neumáticos asignados según el perfil del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 10
 *       401:
 *         description: No autenticado o sin permisos
 *       500:
 *         description: Error al contar neumáticos asignados
 */
router.get('/asignados/cantidad', poNeumaticoController.contarNeumaticosAsignados);

/**
 * @swagger
 * /api/po-neumaticos/disponibles/cantidad:
 *   get:
 *     summary: Obtener la cantidad de neumáticos disponibles según el perfil del usuario
 *     description: >-
 *       - Si el usuario tiene perfil 005 (OPERACIONES), obtiene la cantidad total de neumáticos disponibles.
 *       - Si el usuario tiene perfil 002 (JEFE DE TALLER), obtiene solo la cantidad de neumáticos disponibles asignados a él (USUARIO_SUPER).
 *       - Otros perfiles no tienen acceso a este recurso.
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad de neumáticos disponibles según el perfil del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 15
 *       401:
 *         description: No autenticado o sin permisos
 *       500:
 *         description: Error al contar neumáticos disponibles
 */
router.get('/disponibles/cantidad', poNeumaticoController.contarNeumaticosDisponibles);

// NUEVAS RUTAS PARA VISIBILIDAD DE ESTADOS - MÓDULO I

/**
 * @swagger
 * /api/po-neumaticos/todos:
 *   get:
 *     summary: Obtener todos los neumáticos (operativos + baja definitiva + recuperados)
 *     description: >-
 *       Retorna una vista unificada de todos los neumáticos del sistema incluyendo:
 *       - Neumáticos operativos (PO_NEUMATICO)
 *       - Neumáticos en baja definitiva (NEU_ELIMINADO)  
 *       - Neumáticos recuperados (NEU_RECUPERADO)
 *       Cada registro incluye un campo ORIGEN_ESTADO para identificar su estado actual.
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Lista completa de neumáticos con todos los estados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   CODIGO:
 *                     type: string
 *                     example: "1000001"
 *                   MARCA:
 *                     type: string
 *                     example: "PIRELLI"
 *                   ORIGEN_ESTADO:
 *                     type: string
 *                     enum: [OPERATIVO, BAJA_DEFINITIVA, RECUPERADO]
 *                     example: "OPERATIVO"
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/todos', poNeumaticoController.getTodosNeumaticos);

/**
 * @swagger
 * /api/po-neumaticos/baja-definitiva/cantidad:
 *   get:
 *     summary: Obtener cantidad de neumáticos en baja definitiva
 *     description: Cuenta los neumáticos que están en estado de baja definitiva según el perfil del usuario
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad de neumáticos en baja definitiva
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/baja-definitiva/cantidad', poNeumaticoController.contarNeumaticosBajaDefinitiva);

/**
 * @swagger
 * /api/po-neumaticos/recuperados/cantidad:
 *   get:
 *     summary: Obtener cantidad de neumáticos recuperados
 *     description: Cuenta los neumáticos que están en estado recuperado según el perfil del usuario
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Cantidad de neumáticos recuperados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cantidad:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/recuperados/cantidad', poNeumaticoController.contarNeumaticoRecuperados);

/**
 * @swagger
 * /api/po-neumaticos/baja-definitiva:
 *   get:
 *     summary: Obtener neumáticos en baja definitiva
 *     description: Retorna todos los neumáticos que están en estado de baja definitiva según el perfil del usuario
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Lista de neumáticos en baja definitiva
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   CODIGO:
 *                     type: string
 *                     example: "1000001"
 *                   MARCA:
 *                     type: string
 *                     example: "PIRELLI"
 *                   ORIGEN_ESTADO:
 *                     type: string
 *                     example: "BAJA_DEFINITIVA"
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/baja-definitiva', poNeumaticoController.getNeumaticosBajaDefinitiva);

/**
 * @swagger
 * /api/po-neumaticos/recuperados:
 *   get:
 *     summary: Obtener neumáticos recuperados
 *     description: Retorna todos los neumáticos que están en estado recuperado según el perfil del usuario
 *     tags: [Neumáticos]
 *     responses:
 *       200:
 *         description: Lista de neumáticos recuperados
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   CODIGO:
 *                     type: string
 *                     example: "1000001"
 *                   MARCA:
 *                     type: string
 *                     example: "PIRELLI"
 *                   ORIGEN_ESTADO:
 *                     type: string
 *                     example: "RECUPERADO"
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/recuperados', poNeumaticoController.getNeumaticoRecuperados);

module.exports = router;