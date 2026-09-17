const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'Token no proporcionado' });

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    req.usuarioMobile = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    console.log({ err })

    const message = err.name === 'TokenExpiredError' ? 'Token expirado' : 'Token inválido';
    return res.status(401).json({ message });
  }
}

module.exports = { verificarToken };
