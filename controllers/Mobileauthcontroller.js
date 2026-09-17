require('dotenv').config();
const mobileAuthService = require('./../services/mobileAuthService');

async function loginController(req, res) {

  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });

  try {
    const resultado = await mobileAuthService.login(usuario, contrasena);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('[mobileAuthController.loginController]', err);
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
  }
}

// Va montado DESPUÉS de verificarToken (ver poMobileRoutes.js) — req.usuarioMobile
// ya viene decodificado y validado por el middleware, así que si el token
// estuviera vencido o fuera inválido esto ni se ejecuta (responde 401 antes).
async function refreshController(req, res) {
  try {
    const resultado = mobileAuthService.refresh(req.usuarioMobile);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('[mobileAuthController.refreshController]', err);
    return res.status(500).json({ message: 'No se pudo renovar la sesión' });
  }
}

module.exports = { loginController, refreshController };
