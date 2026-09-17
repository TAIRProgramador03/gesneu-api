const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRA_DIAS = 30;

async function buscarUsuarioParaLogin(codigoUsuario) {
  const sql = `
    SELECT
      TRIM(CH_CODI_USUARIO) AS CH_CODI_USUARIO,
      CASE WHEN CH_CODI_USUARIO = 'GESNEU' THEN 'JOSE'    ELSE VC_DESC_NOMB_USUARIO     END AS VC_DESC_NOMB_USUARIO,
      CASE WHEN CH_CODI_USUARIO = 'GESNEU' THEN 'ARENAS'  ELSE VC_DESC_APELL_PATERNO    END AS VC_DESC_APELL_PATERNO,
      CASE WHEN CH_CODI_USUARIO = 'GESNEU' THEN 'ARIAS'   ELSE VC_DESC_APELL_MATERNO    END AS VC_DESC_APELL_MATERNO,
      CH_PASS_USUA,
      CH_ESTA_ACTIVO
    FROM ${BD_SCHEMA}.MAE_USUARIO
    WHERE TRIM(CH_CODI_USUARIO) = ?
  `;
  const users = await db.query(sql, [codigoUsuario.trim()]);
  return users[0] ?? null;
}

async function getTalleresForUser(codigoUsuario) {
  const sql = `
    SELECT pt.DESCRIPCION AS "taller"
    FROM ${BD_SCHEMA}.MAE_USUARIO MUF
    LEFT JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO mtxu
        ON mtxu.CH_CODI_USUARIO = MUF.CH_CODI_USUARIO
    LEFT JOIN ${BD_SCHEMA}.PO_TALLER pt
        ON mtxu.ID_TALLER = pt.ID
    WHERE MUF.CH_CODI_USUARIO = ?
  `;
  const talleres = await db.query(sql, [codigoUsuario.trim()]);
  return talleres ?? null;
}

async function getProfileForUser(codigoUsuario) {
  const sql = `
    SELECT P.CH_CODI_PERFIL, PF.VC_DESC_PERFIL
    FROM ${BD_SCHEMA}.MAE_PERFIL_MAE_USUARIO P
    JOIN ${BD_SCHEMA}.MAE_PERFIL PF ON P.CH_CODI_PERFIL = PF.CH_CODI_PERFIL
    WHERE TRIM(P.CH_CODI_USUARIO) = ?
    AND P.CH_ESTA_PERFIL_USUA = 'A' AND PF.CH_ESTA_PERFIL = 'A'
  `;
  const profile = await db.query(sql, [codigoUsuario.trim()]);
  return profile[0] ?? null;
}

async function login(codigoUsuario, contrasena) {
  const usuario = await buscarUsuarioParaLogin(codigoUsuario);

  if (!usuario) throw new Error('Usuario o contraseña incorrectos');

  const passwordValida = String(usuario.CH_PASS_USUA).trim() === String(contrasena).trim();

  if (!passwordValida) throw new Error('Usuario o contraseña incorrectos');

  if (usuario.CH_ESTA_ACTIVO !== 'A') throw new Error('Usuario inactivo');

  const talleres = await getTalleresForUser(codigoUsuario);
  const talleresNew = talleres.map((item) => item.taller)
  const perfiles = await getProfileForUser(codigoUsuario);

  const expiraEn = new Date();
  expiraEn.setDate(expiraEn.getDate() + JWT_EXPIRA_DIAS);

  const payload = {
    id: usuario.CH_CODI_USUARIO,
    nombre: usuario.VC_DESC_NOMB_USUARIO,
    apellido_paterno: usuario.VC_DESC_APELL_PATERNO,
    apellido_materno: usuario.VC_DESC_APELL_MATERNO,
    talleres: talleresNew,
    perfiles: {
      codigo: perfiles.CH_CODI_PERFIL,
      descripcion: perfiles.VC_DESC_PERFIL
    }
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_EXPIRA_DIAS}d` });

  return {
    token,
    expira_en: expiraEn.toISOString(),
    usuario: {
      id: usuario.CH_CODI_USUARIO,
      nombre: usuario.VC_DESC_NOMB_USUARIO,
      apellido_paterno: usuario.VC_DESC_APELL_PATERNO,
      apellido_materno: usuario.VC_DESC_APELL_MATERNO,
      talleres: talleresNew,
      perfiles: {
        codigo: perfiles.CH_CODI_PERFIL,
        descripcion: perfiles.VC_DESC_PERFIL
      }
    },
  };
}

/**
 * Renueva un JWT todavía válido (verificarToken ya lo decodificó antes de
 * llegar acá — si estuviera vencido/inválido, ni siquiera entra a este
 * controller). No vuelve a consultar DB2: re-firma el mismo payload
 * (id/nombre/talleres/perfiles) descartando iat/exp viejos, con una
 * expiración nueva de JWT_EXPIRA_DIAS a partir de ahora. Si talleres/perfiles
 * cambiaron desde el último login, no se reflejan hasta el próximo login
 * completo — aceptable para evitar una consulta a DB2 en cada refresh.
 */
function refresh(payloadDecodificado) {
  const { iat, exp, ...payload } = payloadDecodificado;

  const expiraEn = new Date();
  expiraEn.setDate(expiraEn.getDate() + JWT_EXPIRA_DIAS);

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_EXPIRA_DIAS}d` });

  return { token, expira_en: expiraEn.toISOString() };
}

module.exports = { login, refresh };
