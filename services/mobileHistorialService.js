const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

/**
 * Mismas dos queries reales que usa la web (poMantenimientoController.js:
 * getInspeccionesPorPlaca / getNeumaticosPorInspeccion), reexpuestas acá
 * porque esas rutas están protegidas por sesión web (cookie), no por JWT —
 * mobile no puede pegarles directo. "Historial" en la web es en realidad
 * "historial de INSPECCIONES", no de cualquier movimiento — mismo alcance
 * acá, a propósito.
 */

async function obtenerInspeccionesPorPlaca(placa) {
  const rows = await db.query(
    // FECHA_TIEMPO es cuando se REGISTRO la inspeccion en el sistema, que no
    // siempre es el dia que se inspecciono (FECHA_INSPECCION) — la web la
    // muestra como "Reg. <fecha>" en cada fila del historial. Mismo DATE()
    // que usa poMantenimientoController.getInspeccionesPorPlaca.
    `SELECT NV.ID, NV.PLACA, NV.KILOMETRAJE, NV.FECHA_INSPECCION,
            DATE(NV.FECHA_TIEMPO) AS FECHA_TIEMPO, NV.TIPO_TERRENO, NV.RETEN
       FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE NV
      WHERE NV.PLACA = ? AND NV.FECHA_INSPECCION IS NOT NULL
      ORDER BY NV.ID DESC`,
    [placa]
  );

  return rows.map((r) => ({
    id: r.ID,
    placa: r.PLACA,
    kilometraje: r.KILOMETRAJE,
    fechaInspeccion: r.FECHA_INSPECCION,
    fechaRegistro: r.FECHA_TIEMPO,
    tipoTerreno: r.TIPO_TERRENO,
    reten: r.RETEN,
  }));
}

async function obtenerNeumaticosPorInspeccion(placa, fechaInspeccion) {
  const rows = await db.query(
    `SELECT NM.ID, NM.ID_NEUMATICO, TRIM(NP.CODIGO) AS CODIGO, NM.POSICION_NUEVA AS POSICION,
            NM.REMANENTE_MEDIDO AS REMANENTE, NM.PRESION_MEDIDA AS PRESION, NM.TORQUE_APLICADO AS TORQUE,
            NM.KM_RECORRIDOS_ETAPA AS KM_RECORRIDO, NM.OBS, NM.PORCENTAJE_VIDA
       FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
       LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP ON NP.ID = NM.ID_NEUMATICO
      WHERE NM.PLACA = ? AND NM.FECHA_INSPECCION = ? AND NM.ID_ACCION = 7
      ORDER BY NM.POSICION_NUEVA`,
    [placa, fechaInspeccion]
  );

  return rows.map((r) => ({
    idNeumatico: r.ID_NEUMATICO,
    codigo: r.CODIGO,
    posicion: r.POSICION,
    remanente: r.REMANENTE,
    presion: r.PRESION,
    torque: r.TORQUE,
    kmRecorrido: r.KM_RECORRIDO,
    observacion: r.OBS,
    porcentajeVida: r.PORCENTAJE_VIDA,
  }));
}

module.exports = { obtenerInspeccionesPorPlaca, obtenerNeumaticosPorInspeccion };
