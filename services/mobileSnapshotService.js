const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

// PENDIENTE: nunca definimos con negocio el rango de torque válido —
// hasta que exista ese umbral real, alerta_torque queda siempre en 0.
// PENDIENTE: 20% es un valor razonable pero no confirmado con negocio para
// "remanente/vida baja" — ajustar aquí si definen otro umbral.
const ALERTA_PORCENTAJE_MINIMO = 20;

const COLOR_POR_ESTADO = {
  DISPONIBLE: '#16A34A',
  ASIGNADO: '#2563EB',
  BAJA: '#DC2626',
  RECUPERADO: '#D97706',
};
const COLOR_ESTADO_DEFAULT = '#6B7280';

/**
 * Calcula las métricas derivadas de un neumático a partir de la fila cruda
 * que devuelve la query de obtenerSnapshotNeumaticos().
 *
 * remanenteMontado: primer REMANENTE_MEDIDO en NEU_MOVIMIENTOS con
 * ID_ACCION=2 (MONTAJE) — misma fórmula que ya usa en producción el reporte
 * de desgaste (poNeumaticoController.getDesgastePorMilKms en GESNEU_B).
 * Si el neumático nunca tuvo un movimiento de montaje registrado, se usa
 * NP.REMANENTE_INICIAL como aproximación (fallback, no el caso normal).
 */
function calcularMetricas(row) {
  const kmTotalVida = Number(row.KM_TOTAL_VIDA) || 0;
  const remanenteActual = Number(row.REMANENTE_ACTUAL) || 0;
  const costoInicial = Number(row.COSTO_INICIAL) || 0;

  const remanenteMontado =
    row.REMANENTE_MONTADO != null
      ? Number(row.REMANENTE_MONTADO)
      : row.REMANENTE_INICIAL != null
        ? Number(row.REMANENTE_INICIAL)
        : null;

  const desgasteTotal = remanenteMontado != null ? remanenteMontado - remanenteActual : null;

  const desgastePor1000km =
    kmTotalVida > 0 && desgasteTotal && desgasteTotal > 0
      ? Number(((desgasteTotal / kmTotalVida) * 1000).toFixed(2))
      : 0;

  const costoPorKm =
    kmTotalVida > 0 && costoInicial > 0 ? Number((costoInicial / kmTotalVida).toFixed(5)) : 0;

  const kmRestantes =
    desgastePor1000km > 0 ? Math.round((remanenteActual / desgastePor1000km) * 1000) : null;

  const porcentajeRemanente = remanenteMontado ? (remanenteActual / remanenteMontado) * 100 : null;

  return {
    desgastePor1000km,
    costoPorKm,
    kmRestantes,
    alertaRemanente: porcentajeRemanente != null && porcentajeRemanente <= ALERTA_PORCENTAJE_MINIMO ? 1 : 0,
    alertaVida:
      row.PORCENTAJE_VIDA != null && Number(row.PORCENTAJE_VIDA) <= ALERTA_PORCENTAJE_MINIMO ? 1 : 0,
    // PENDIENTE: sin umbral de torque real definido.
    alertaTorque: 0,
  };
}

/**
 * Snapshot de neumáticos (NEU_PADRON + NEU_INFORMACION aplanados) para los
 * talleres del usuario logueado — pensado para poblar padron_cache en el
 * SQLite local de la app mobile.
 */
async function obtenerSnapshotNeumaticos(talleres) {
  if (!Array.isArray(talleres) || talleres.length === 0) return [];

  const placeholders = talleres.map(() => '?').join(',');

  const sql = `
    SELECT
      NP.ID                       AS ID_NEUMATICO,
      TRIM(NP.CODIGO)              AS CODIGO,
      NP.ID_MARCA                  AS ID_MARCA,
      TRIM(NM.MARCA)                AS MARCA,
      NP.MEDIDA                    AS MEDIDA,
      NP.DISENO                    AS DISENO,
      NP.REMANENTE_INICIAL         AS REMANENTE_INICIAL,
      NP.COSTO_INICIAL             AS COSTO_INICIAL,
      NP.FECHA_COMPRA              AS FECHA_COMPRA,
      NP.FECHA_FABRICACION_COD     AS FECHA_FABRICACION,
      NP.PR                        AS PR,
      NP.LEASING                   AS LEASING,
      NP.FECHA_ENVIO               AS FECHA_ENVIO,

      NI.ID_ESTADO                    AS ID_ESTADO,
      TRIM(NE.DESCRIPCION)             AS ESTADO_DESCRIPCION,
      TRIM(NE.CODIGO_INTERNO)          AS ESTADO_CODIGO_INTERNO,
      TRIM(NI.PLACA_ACTUAL)            AS PLACA_ACTUAL,
      NI.POSICION_ACTUAL               AS POSICION_ACTUAL,
      TRIM(NI.PROYECTO_ACTUAL)         AS PROYECTO_ACTUAL,
      NI.REMANENTE_ACTUAL              AS REMANENTE_ACTUAL,
      NI.PRESION_ACTUAL                AS PRESION_ACTUAL,
      NI.TORQUE_ACTUAL                 AS TORQUE_ACTUAL,
      NI.PORCENTAJE_VIDA               AS PORCENTAJE_VIDA,
      NI.ODOMETRO_AL_MONTAR            AS ODOMETRO_AL_MONTAR,
      NI.KM_TOTAL_VIDA                 AS KM_TOTAL_VIDA,
      CAST(NI.ES_RECUPERADO AS SMALLINT) AS ES_RECUPERADO,
      NI.QTY_RECUPERADO                AS QTY_RECUPERADO,
      NI.FECHA_ULTIMA_ASIGNACION       AS FECHA_ULTIMA_ASIGNACION,
      NI.FECHA_ULTIMA_ACTUALIZACION    AS FECHA_ULTIMA_ACTUALIZACION,

      ri.REMANENTE_MONTADO AS REMANENTE_MONTADO,
      rec.FECHA_RECUPERADO AS FECHA_RECUPERADO
    FROM ${BD_SCHEMA}.NEU_PADRON NP
    INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
      ON NI.ID_NEUMATICO = NP.ID
    LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NM
      ON NM.ID_MARCA = NP.ID_MARCA
    LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO NE
      ON NE.ID_ESTADO = NI.ID_ESTADO
    LEFT JOIN (
      SELECT ID_NEUMATICO, REMANENTE_MEDIDO AS REMANENTE_MONTADO,
        ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID ASC) AS RN
      FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS
      WHERE ID_ACCION = 2
    ) ri ON ri.ID_NEUMATICO = NP.ID AND ri.RN = 1
    -- Fecha del último "BAJA" (ID_ACCION=5 en NEU_ACCION — cubre tanto
    -- RECUPERADO como BAJA DEFINITIVA, mismo catálogo) — la usa
    -- ModalInputsNeu.tsx (GESNEU_F) como fecha mínima al reasignar un
    -- neumático recuperado, en vez de FECHA_ENVIO (no puede "reasignarse"
    -- con fecha anterior a cuando se recuperó).
    LEFT JOIN (
      SELECT ID_NEUMATICO, FECHA_RECUPERADO,
        ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN
      FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS
      WHERE ID_ACCION = 5
    ) rec ON rec.ID_NEUMATICO = NP.ID AND rec.RN = 1
    -- Neumático montado (tiene PLACA_ACTUAL): para ver "los neumáticos de mis
    -- placas" no importa el PROYECTO_ACTUAL propio del neumático — puede
    -- estar desactualizado/desfasado del taller real del vehículo (pasó en
    -- producción: neumático con PROYECTO_ACTUAL viejo, montado en un
    -- vehículo de un taller distinto). Se filtra por el taller del VEHÍCULO
    -- en el que está montado, vía PO_VEHICULO/PO_OPERACIONES/PO_TALLER —
    -- mismo join que ya usa mobileVehiculosService.js.
    LEFT JOIN ${BD_SCHEMA}.PO_VEHICULO VE
      ON TRIM(VE.NUMPLA) = TRIM(NI.PLACA_ACTUAL)
    LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POS
      ON POS.ID = VE.SECOPE
    LEFT JOIN ${BD_SCHEMA}.PO_TALLER PTALL
      ON PTALL.ID = POS.IDTLR
    WHERE
      (NI.PLACA_ACTUAL IS NOT NULL AND TRIM(PTALL.DESCRIPCION) IN (${placeholders}))
      OR
      -- Neumático SIN montar (disponible — "mi padrón" propio, a diferencia
      -- de lo de arriba): ahí sí filtra por su propio PROYECTO_ACTUAL, no
      -- hay vehículo del cual heredar taller.
      (NI.PLACA_ACTUAL IS NULL AND TRIM(NI.PROYECTO_ACTUAL) IN (${placeholders}))
  `;

  const rows = await db.query(sql, [...talleres, ...talleres]);

  return rows.map((row) => {
    const metricas = calcularMetricas(row);

    return {
      id_neumatico: row.ID_NEUMATICO,
      codigo: row.CODIGO,

      id_marca: row.ID_MARCA,
      marca: row.MARCA,
      medida: row.MEDIDA,
      diseno: row.DISENO,
      remanente_inicial: row.REMANENTE_INICIAL,
      costo_inicial: row.COSTO_INICIAL,
      fecha_compra: row.FECHA_COMPRA,
      fecha_fabricacion: row.FECHA_FABRICACION,
      pr: row.PR,
      nro_pliegues: null, // PENDIENTE: no encontramos esta columna en NEU_PADRON
      leasing: row.LEASING,

      id_estado: row.ID_ESTADO,
      estado_descripcion: row.ESTADO_DESCRIPCION,
      estado_color: COLOR_POR_ESTADO[row.ESTADO_CODIGO_INTERNO] ?? COLOR_ESTADO_DEFAULT,
      placa_actual: row.PLACA_ACTUAL,
      posicion_actual: row.POSICION_ACTUAL,
      proyecto_actual: row.PROYECTO_ACTUAL,
      remanente_actual: row.REMANENTE_ACTUAL,
      presion_actual: row.PRESION_ACTUAL,
      torque_actual: row.TORQUE_ACTUAL,
      porcentaje_vida: row.PORCENTAJE_VIDA,
      odometro_al_montar: row.ODOMETRO_AL_MONTAR,
      km_total_vida: row.KM_TOTAL_VIDA,
      es_recuperado: row.ES_RECUPERADO ?? 0,
      qty_recuperado: row.QTY_RECUPERADO ?? 0,
      fecha_ultima_asignacion: row.FECHA_ULTIMA_ASIGNACION,
      fecha_ultima_actualizacion: row.FECHA_ULTIMA_ACTUALIZACION,

      // Se agrega para que ASIGNACION pueda recalcular PORCENTAJE_VIDA de
      // forma optimista en el móvil (guardarAsignacion) igual que hace
      // asignarNeumatico en el backend — importa sobre todo para un
      // neumático RECUPERADO reasignado, cuyo remanente_montado real puede
      // ser muy distinto al remanente que el técnico ingresa ahora (no es
      // su primer montaje). Antes solo se usaba internamente para calcular
      // desgaste_por_1000km/costo_por_km, nunca se exponía tal cual.
      remanente_montado: row.REMANENTE_MONTADO,
      fecha_registro: row.FECHA_ENVIO,
      fecha_recuperado: row.FECHA_RECUPERADO,

      desgaste_por_1000km: metricas.desgastePor1000km,
      costo_por_km: metricas.costoPorKm,
      km_restantes: metricas.kmRestantes,
      alerta_remanente: metricas.alertaRemanente,
      alerta_torque: metricas.alertaTorque,
      alerta_vida: metricas.alertaVida,
    };
  });
}

module.exports = { obtenerSnapshotNeumaticos, calcularMetricas };
