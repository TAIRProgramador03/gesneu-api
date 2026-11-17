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
    const usuario = colaS60Service.usuarioDeSesion(req.session.user);
    const cabeza = await colaS60Service.obtenerCabeza(usuario);
    // `exento` viaja en la respuesta para que la pantalla sepa si debe mostrar
    // el aviso como candado o como simple informacion.
    const exento = colaS60Service.esUsuarioExento(usuario);

    if (!cabeza) {
      return res.json({ hayPendientes: false, cabeza: null, exento });
    }

    return res.json({
      hayPendientes: true,
      cabeza,
      exento,
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
    const limite = 700;

    const usuario = colaS60Service.usuarioDeSesion(req.session.user);
    const pendientes = await colaS60Service.obtenerPendientes(usuario, limite);

    res.json({
      total: pendientes.length,
      pendientes,
      exento: colaS60Service.esUsuarioExento(usuario),
    });
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
    const usuario = colaS60Service.usuarioDeSesion(req.session.user);
    const { habilitada, cabeza, exento } = await colaS60Service.verificarPlacaHabilitada(
      usuario,
      placa
    );

    res.json({
      habilitada,
      cabeza,
      exento,
      mensaje: habilitada ? null : colaS60Service.mensajeBloqueo(cabeza),
    });
  } catch (error) {
    console.error('❌ [colaS60] Error al verificar la placa:', error.message);
    res.status(500).json({ mensaje: error.message });
  }
};

/**
 * GET /api/cola-s60/reportes/:placa
 *
 * Las S60 ya regularizadas de una placa, agrupadas por comprobante, con los
 * datos de los neumaticos que salieron y entraron. Es el insumo del reporte
 * de cambio de neumaticos; el PDF se arma en el navegador.
 *
 * No aplica la cola a proposito: la cola decide sobre que placa se puede
 * TRABAJAR, y esto no cambia nada, solo lee lo ya hecho. Bloquearlo dejaria
 * sin poder reimprimir un cambio viejo a quien tenga otra S60 pendiente.
 */
const listarReportesCambio = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: 'No autenticado' });
  }

  const { placa } = req.params;
  if (!placa || placa.trim() === '') {
    return res.status(400).json({ mensaje: 'La placa es requerida' });
  }

  try {
    const reportes = await colaS60Service.listarReportesCambioPorPlaca(placa);
    res.json({ total: reportes.length, reportes });
  } catch (error) {
    console.error('❌ [colaS60] Error al listar los reportes de cambio:', error.message);
    res.status(500).json({ mensaje: error.message });
  }
};

module.exports = { obtenerEstado, listarPendientes, verificarPlaca, listarReportesCambio };
