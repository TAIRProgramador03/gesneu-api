const colaS60Service = require('../services/colaS60Service');

/**
 * Snapshot móvil de la cola de S60 pendientes del usuario — mismo servicio
 * que ya usa la web (`/api/cola-s60/*`, con sesión), pero bajo JWT para que
 * el teléfono pueda bajarlo en cada sync.
 *
 * Es diminuto (~5 S60 al día en toda la empresa) comparado con los ~1.092
 * neumáticos que el móvil ya baja — no hace falta paginar, con el límite por
 * defecto de `obtenerPendientes` (50 líneas) alcanza de sobra para un solo
 * usuario.
 *
 * OJO: esto se usa como LISTA DE PRIORIDAD en el móvil, nunca como bloqueo
 * (ver CLAUDE.md del repo móvil) — el teléfono opera offline contra una foto
 * que puede tener horas, y la cola es un hecho sobre el trabajo de OTRA
 * gente, no sobre el neumático que el técnico tiene enfrente. Bloquear con
 * datos viejos falla siempre en la dirección mala (una S60 que ya se cerró
 * sigue apareciendo pendiente, nunca al revés), dejando al técnico sin poder
 * trabajar en campo sin forma de destrabarse.
 */
async function snapshotColaS60Controller(req, res) {
  try {
    const usuario = req.usuarioMobile?.id;

    if (!usuario) {
      return res.status(200).json({ cola: [], generado_en: new Date().toISOString() });
    }

    const pendientes = await colaS60Service.obtenerPendientes(usuario);

    // colaS60Service devuelve codigoEntrante/codigoSaliente en camelCase
    // (convención de la web, que lo consume directo); el resto de la API
    // móvil usa snake_case (ver mobileSalidasService) — se normaliza acá en
    // vez de mezclar las dos convenciones en el contrato del teléfono.
    const cola = pendientes.map((linea) => ({
      almacen: linea.almacen,
      comprobante: linea.comprobante,
      correlativo: linea.correlativo,
      fecha: linea.fecha,
      hora: linea.hora,
      placa: linea.placa,
      operacion: linea.operacion,
      taller: linea.taller,
      par: linea.par,
      codigo_entrante: linea.codigoEntrante,
      codigo_saliente: linea.codigoSaliente,
    }));

    return res.status(200).json({ cola, generado_en: new Date().toISOString() });
  } catch (err) {
    console.error('[mobileColaS60Controller.snapshotColaS60Controller]', err);
    return res.status(500).json({ message: 'Error obteniendo la cola de S60' });
  }
}

module.exports = { snapshotColaS60Controller };
