const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

const PORCENTAJE_ALERTA = 39;

async function obtenerSnapshotVehiculos(talleres) {
  if (!Array.isArray(talleres) || talleres.length === 0) return [];

  const placeholders = talleres.map(() => '?').join(',');

  const sql = `
    SELECT
      TRIM(VE.NUMPLA)         AS PLACA,
      TRIM(PM.DESCRIPCION)    AS MARCA,
      TRIM(PMO.DESMODGEN)     AS MODELO,
      VE.KILOMETRAJE          AS KILOMETRAJE_VEHICULO,
      kmUlt.KILOMETRAJE_GESNEU AS KILOMETRAJE_GESNEU,
      klm.FECHA_INSPECCION    AS FECHA_KM,
      TRIM(PTALL.DESCRIPCION) AS TALLER,
      POS.ID    AS ID_OPERACION,
      POS.IDSUP AS COD_SUPERVISOR,
      CASE VE.TP_TRABAJO
        WHEN 0 THEN 'SUPERFICIE'
        WHEN 1 THEN 'SOCAVÓN'
        WHEN 2 THEN 'CIUDAD'
        WHEN 3 THEN 'SEVERO'
        WHEN 4 THEN 'PENDIENTE'
        ELSE 'SIN TIPO DE TRABAJO'
      END AS TIPO_TERRENO,
      CASE VE.ES_RETEN
        WHEN 0 THEN 'TITULAR'
        WHEN 1 THEN 'RETÉN'
        WHEN 2 THEN 'LOGISTICA'
        ELSE 'SIN RETEN'
      END AS RETEN,
      (
        SELECT COUNT(*) FROM ${BD_SCHEMA}.NEU_INFORMACION NI
        WHERE TRIM(NI.PLACA_ACTUAL) = TRIM(VE.NUMPLA)
      ) AS TOTAL_NEUMATICOS,
      (
        SELECT COUNT(*) FROM ${BD_SCHEMA}.NEU_INFORMACION NI
        WHERE TRIM(NI.PLACA_ACTUAL) = TRIM(VE.NUMPLA) AND NI.PORCENTAJE_VIDA < ?
      ) AS NEUMATICOS_ALERTA,
      (
        -- Misma fila/orden que usa poMantenimientoController.getUltimaFechaInspeccionPorPlaca
        -- (la que valida fechas en la web real): última fila de NEU_VKILOMETRAJE por ID,
        -- SIN filtrar por FECHA_INSPECCION IS NOT NULL (a diferencia del join klm de
        -- abajo, que si filtra, ese es para el kilometraje mostrado, esto es para
        -- replicar la regla de fecha minima de inspeccion tal cual).
        SELECT VK.FECHA_ASIGNACION
        FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
        WHERE VK.PLACA = VE.NUMPLA
        ORDER BY VK.ID DESC
        FETCH FIRST 1 ROW ONLY
      ) AS FECHA_ASIGNACION_ULTIMA,
      (
        SELECT VK.FECHA_INSPECCION
        FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
        WHERE VK.PLACA = VE.NUMPLA
        ORDER BY VK.ID DESC
        FETCH FIRST 1 ROW ONLY
      ) AS FECHA_ULTIMA_INSPECCION_REGISTRO
    FROM ${BD_SCHEMA}.PO_VEHICULO VE
    LEFT JOIN ${BD_SCHEMA}.PO_MARCA PM
      ON PM.ID = VE.IDMAR
    LEFT JOIN ${BD_SCHEMA}.PO_MODELO PMO
      ON PMO.ID = VE.IDMOD
    LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POS
      ON POS.ID = VE.SECOPE
    LEFT JOIN ${BD_SCHEMA}.PO_TALLER PTALL
      ON PTALL.ID = POS.IDTLR
    LEFT JOIN (
      SELECT PLACA, KILOMETRAJE AS KILOMETRAJE_GESNEU,
        ROW_NUMBER() OVER (PARTITION BY PLACA ORDER BY ID DESC) AS RN
      FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE
    ) kmUlt ON kmUlt.PLACA = VE.NUMPLA AND kmUlt.RN = 1
    LEFT JOIN (
      SELECT PLACA, FECHA_INSPECCION,
        ROW_NUMBER() OVER (PARTITION BY PLACA ORDER BY ID DESC) AS RN
      FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE
      WHERE FECHA_INSPECCION IS NOT NULL
    ) klm ON klm.PLACA = VE.NUMPLA AND klm.RN = 1
    WHERE TRIM(PTALL.DESCRIPCION) IN (${placeholders})
  `;

  const rows = await db.query(sql, [PORCENTAJE_ALERTA, ...talleres]);

  return rows.map((row) => ({
    placa: row.PLACA,
    proyecto: row.TALLER,
    marca: row.MARCA,
    modelo: row.MODELO,
    // Preferimos el kilometraje que registra el propio módulo de
    // neumáticos (más reciente/confiable, cuenta tanto inspección como
    // asignación — ver join `kmUlt` arriba) y caemos al de PO_VEHICULO si
    // todavía no hay ningún evento de NEU_VKILOMETRAJE registrado.
    kilometraje: row.KILOMETRAJE_GESNEU ?? row.KILOMETRAJE_VEHICULO ?? null,
    // Se usan al registrar cualquier movimiento (inspección/asignación/
    // reubicación/desasignación) — igual que arma cada modal real en
    // GESNEU_F (`vehiculo?.cod_supervisor`/`vehiculo?.ID_SUPERVISOR`, desde
    // PO_OPERACIONES vía PO_VEHICULO.SECOPE). Se cachean acá para no tener
    // que resolverlos en el momento en /sync/batch.
    id_operacion: row.ID_OPERACION,
    cod_supervisor: row.COD_SUPERVISOR,
    tipo_terreno: row.TIPO_TERRENO,
    reten: row.RETEN,
    fecha_km: row.FECHA_KM,
    // Para replicar en mobile la misma regla de fecha mínima de inspección
    // que usa modal-inspeccion-neu.tsx en GESNEU_F (fechaMinEfectiva).
    fecha_asignacion: row.FECHA_ASIGNACION_ULTIMA,
    fecha_ultima_inspeccion: row.FECHA_ULTIMA_INSPECCION_REGISTRO,
    // FECHA_KM viene del join `klm`, que ya filtra por FECHA_INSPECCION IS NOT
    // NULL — o sea, no-nulo significa "existe al menos una inspección previa
    // para esta placa". Mismo criterio exacto que usa esPrimeraInspeccion en
    // modal-inspeccion-neu.tsx (GESNEU_F) vía getFechasInspeccionVehicularPorPlaca.
    // Determina si el repuesto (RES01) se puede editar en la inspección móvil:
    // solo en la primera inspección de la placa, nunca después (no ha rodado).
    tiene_inspeccion_previa: row.FECHA_KM != null ? 1 : 0,
    total_neumaticos: row.TOTAL_NEUMATICOS ?? 0,
    tiene_alertas: (row.NEUMATICOS_ALERTA ?? 0) > 0 ? 1 : 0,
  }));
}

module.exports = { obtenerSnapshotVehiculos };
