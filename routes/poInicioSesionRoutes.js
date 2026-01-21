const express = require('express');
const router = express.Router();
const { login, session } = require('../controllers/poInicioSesionController');

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Iniciar sesión de usuario
 *     description: Valida usuario y contraseña, y retorna los datos del usuario junto a sus perfiles activos.
 *     tags:
 *       - Autenticación
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               usuario:
 *                 type: string
 *                 example: JUANDEDIOS
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Datos del usuario y sus perfiles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuario:
 *                   type: string
 *                 nombre:
 *                   type: string
 *                 apellido_paterno:
 *                   type: string
 *                 apellido_materno:
 *                   type: string
 *                 perfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       codigo:
 *                         type: string
 *                       descripcion:
 *                         type: string
 *       401:
 *         description: Usuario o contraseña incorrectos
 *       403:
 *         description: Usuario inactivo
 *       500:
 *         description: Error en el login
 */
// Ruta para inicio de sesión
router.post('/login', login);

/**
 * @swagger
 * /api/session:
 *   get:
 *     summary: Obtener información de la sesión activa
 *     description: Devuelve los datos del usuario si la sesión está activa.
 *     tags:
 *       - Autenticación
 *     responses:
 *       200:
 *         description: Datos del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuario:
 *                   type: string
 *                 nombre:
 *                   type: string
 *                 apellido_paterno:
 *                   type: string
 *                 apellido_materno:
 *                   type: string
 *                 perfiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       codigo:
 *                         type: string
 *                       descripcion:
 *                         type: string
 *       401:
 *         description: No autenticado
 */
// Validar sesión
router.get('/session', session);

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: Cerrar sesión de usuario
 *     description: Destruye la sesión activa y elimina la cookie de sesión.
 *     tags:
 *       - Autenticación
 *     responses:
 *       200:
 *         description: Sesión cerrada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: Sesión cerrada
 */
// Cerrar sesión
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ mensaje: 'Sesión cerrada' });
    });
});

module.exports = router;