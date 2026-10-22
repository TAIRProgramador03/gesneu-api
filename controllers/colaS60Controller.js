const colaS60Service = require('../services/colaS60Service');

/**
 * Cola obligatoria de S60 — lado web.
 *
 * La pantalla necesita saber, antes de que el tecnico empiece a trabajar, cual
 * es la placa habilitada. Si se enterara recien al guardar, habria hecho todo
 * el trabajo para nada.
 */

/**
 * GET /api/cola-s60/estado
 *
 * Responde:
 *   { hayPendientes: false, cabeza: null }               -> todo libre
 *   { hayPendientes: true,  cabeza: {...}, pendientes }  -> solo esa placa
 */
const obtenerEstado = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: 'No autenticado' });
  }

  try {
    const talleres = colaS60Service.talleresDeSesion(req.session.user);
    const cabeza = await colaS60Service.obtenerCabeza(talleres);

    if (!cabeza) {
      return res.json({ hayPendientes: false, cabeza: null, talleres });
    }

    return res.json({
      hayPendientes: true,
      cabeza,
      talleres,
    });
  } catch (error) {
    console.error('❌ [colaS60] Error al obtener el estado de la cola:', error.message);
    res.status(500).json({ mensaje: error.message });
  }
};

/**
 * GET /api/cola-s60/pendientes?limite=50
 *
 * La cola completa, en orden. Para una pantalla de seguimiento: deja ver que
 * viene despues de la cabeza y por que una placa esta bloqueada.
 */
const listarPendientes = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: 'No autenticado' });
  }

  try {
    const limiteBruto = Number(req.query.limite);
    const limite = Number.isInteger(limiteBruto) && limiteBruto > 0 && limiteBruto <= 500
      ? limiteBruto
      : 50;

    const talleres = colaS60Service.talleresDeSesion(req.session.user);
    const pendientes = await colaS60Service.obtenerPendientes(talleres, limite);

    res.json({ total: pendientes.length, pendientes });
  } catch (error) {
    console.error('❌ [colaS60] Error al listar pendientes:', error.message);
    res.status(500).json({ mensaje: error.message });
  }
};

/**
 * GET /api/cola-s60/placa/:placa
 *
 * Si esa placa concreta se puede trabajar ahora mismo. Es lo que consultan los
 * modales al abrirse.
 */
const verificarPlaca = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: 'No autenticado' });
  }

  const { placa } = req.params;
  if (!placa || placa.trim() === '') {
    return res.status(400).json({ mensaje: 'La placa es requerida' });
  }

  try {
    const talleres = colaS60Service.talleresDeSesion(req.session.user);
    const { habilitada, cabeza } = await colaS60Service.verificarPlacaHabilitada(talleres, placa);

    res.json({
      habilitada,
      cabeza,
      mensaje: habilitada ? null : colaS60Service.mensajeBloqueo(cabeza),
    });
  } catch (error) {
    console.error('❌ [colaS60] Error al verificar la placa:', error.message);
    res.status(500).json({ mensaje: error.message });
  }
};

module.exports = { obtenerEstado, listarPendientes, verificarPlaca };
