const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

/**
 * Salidas de almacen (S60) emparejadas, para que el movil pueda validar una
 * desasignacion SIN señal.
 *
 * Por que esto existe: `desasignarConReemplazo` exige que el ERP ya tenga
 * registrada una salida S60 cuyo campo MDDRE7 sea exactamente
 * `"{codigoEntrante}-{codigoSaliente}"` para esa placa. Si no esta, rechaza. El
 * movil no puede consultar TMOVD/TMOVH offline, asi que sin esto el tecnico
 * recien se enteraria del rechazo al sincronizar — horas despues, con la llanta
 * ya montada.
 *
 * Confirmado con el usuario (13-oct-2026): "primero debe existir la S60 para
 * poder hacer la salida", y "usualmente crean su S60 y hacen el cambio ese
 * mismo dia". Por eso alcanza con traer una ventana corta.
 *
 * VENTANA DE 4 DIAS (hoy y los 3 anteriores) — la misma que usan la regla de
 * reubicacion, la ventana de fecha de inspeccion y la compuerta de inspeccion
 * de la desasignacion. El usuario la eligio explicitamente "para mayor
 * alcance".
 *
 * VOLUMEN REAL MEDIDO (produccion, 13-oct-2026): 125 salidas en la ventana para
 * toda la empresa, de las cuales solo 66 traen par valido. Repartidas por
 * taller, un tecnico baja entre 1 y 20 filas. Contra los ~1.092 neumaticos que
 * ya baja en cada sync, es ruido.
 */

const DIAS_VENTANA = 3; // hoy + 3 anteriores = 4 dias

/** `MDFECH` es un entero YYYYMMDD, no una fecha. */
function fechaNumericaHaceDias(dias) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return Number(`${d.getFullYear()}${mes}${dia}`);
}

async function obtenerSnapshotSalidas(talleres) {
  if (!Array.isArray(talleres) || talleres.length === 0) return [];

  const placeholders = talleres.map(() => '?').join(',');
  const desde = fechaNumericaHaceDias(DIAS_VENTANA);

  // Mismo criterio exacto que la validacion de desasignarConReemplazo: si acá
  // se filtrara distinto, el movil permitiria algo que el servidor rechaza (o
  // al reves). Cualquier cambio alla tiene que replicarse aca.
  //
  // El join a PO_VEHICULO/PO_OPERACIONES/PO_TALLER es el mismo que ya usa
  // mobileVehiculosService para resolver el taller de una placa.
  const sql = `
    SELECT
      TRIM(SINVSEH.MHREF3) AS PLACA,
      TRIM(SINVSE.MDDRE7)  AS PAR,
      SINVSE.MDFECH        AS FECHA
    FROM ${BD_SCHEMA}.TMOVD AS SINVSE
    INNER JOIN ${BD_SCHEMA}.TMOVH AS SINVSEH
      ON SINVSEH.MHCMOV = SINVSE.MDCMOV
     AND SINVSEH.MHTMOV = SINVSE.MDTMOV
     AND SINVSEH.MHALMA = SINVSE.MDALMA
     AND SINVSEH.MHCOMP = SINVSE.MDCOMP
     AND (TRIM(SINVSEH.MHREF6) LIKE '%NEU'
       OR TRIM(SINVSEH.MHREF6) LIKE '%SIN'
       OR TRIM(SINVSEH.MHREF6) LIKE '%COB')
    LEFT JOIN ${BD_SCHEMA}.PO_VEHICULO VE
      ON TRIM(VE.NUMPLA) = TRIM(SINVSEH.MHREF3)
    LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POS
      ON POS.ID = VE.SECOPE
    LEFT JOIN ${BD_SCHEMA}.PO_TALLER PTALL
      ON PTALL.ID = POS.IDTLR
    WHERE SINVSE.MDCMOV = 'S'
      AND SINVSE.MDTMOV = '60'
      AND (SINVSE.MDCOAR LIKE '140%' OR SINVSE.MDCOAR LIKE '240%')
      AND SINVSE.MDFECH >= ?
      AND TRIM(SINVSE.MDDRE7) <> ''
      AND TRIM(PTALL.DESCRIPCION) IN (${placeholders})
    ORDER BY SINVSE.MDFECH DESC
  `;

  const filas = await db.query(sql, [desde, ...talleres]);

  // El par llega como texto libre del ERP y hay basura cargada a mano ("SC",
  // "nuevo", "S/N-S/N"): se descarta lo que no parta en exactamente dos
  // codigos no vacios, en vez de mandarle al telefono algo que nunca va a
  // poder emparejar.
  const salidas = [];
  for (const fila of filas) {
    const par = String(fila.PAR ?? '').trim();
    const partes = par.split('-');
    if (partes.length !== 2) continue;
    const entrante = partes[0].trim();
    const saliente = partes[1].trim();
    if (!entrante || !saliente) continue;

    salidas.push({
      placa: String(fila.PLACA ?? '').trim(),
      par,
      codigo_entrante: entrante,
      codigo_saliente: saliente,
      fecha: formatearFecha(fila.FECHA),
    });
  }
  return salidas;
}

/** `20261013` -> `2026-10-13`, el formato en el que viajan todas las fechas al movil. */
function formatearFecha(valor) {
  const texto = String(valor ?? '');
  if (!/^\d{8}$/.test(texto)) return null;
  return `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
}

module.exports = { obtenerSnapshotSalidas };
