const db = require("../config/db");
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

const buscarVehiculoPorPlaca = async (req, res) => {
  // Validar sesión y usuario
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: "No autenticado" });
  }
  try {
    const { placa } = req.params;
    const usuario = req.session.user?.usuario?.trim().toUpperCase();
    const placaLimpia = placa.trim().toUpperCase();
    // Reconstruir usuario_super como en la lógica de negocio
    // SELECT enriquecido con joins y validación de usuario_super

    // --CH_CODI_USUARIO AS USUARIO_SUPER, --CCHUMBIMUNI
    const query = `SELECT
        VE.NUMPLA AS PLACA,
        TRIM(PM.DESCRIPCION) AS MARCA,
        TRIM(PMO.DESMODGEN) AS MODELO,
        TRIM(PT.DESCRIPCION)  AS TIPO,
        TRIM(VE.COLOR) AS COLOR,
        VE.ANO,
        VE.KILOMETRAJE,
        POS.ID AS ID_OPERACION,
        TRIM(POS.DESCRIPCION) AS OPERACION,
        POS.IDSUP AS ID_SUPERVISOR,
        CASE VE.TP_TRABAJO
          WHEN 0 THEN 'SUPERFICIE'
          WHEN 1 THEN 'SOCAVÓN'
          WHEN 2 THEN 'CIUDAD'
          WHEN 3 THEN 'SEVERO'
          WHEN 4 THEN 'PENDIENTE'
          ELSE 'SIN TIPO DE TRABAJO*'
        END AS TIPO_TERRENO,
        CASE VE.ES_RETEN
          WHEN 0 THEN 'TITULAR'
          WHEN 1 THEN 'RETÉN'
          WHEN 2 THEN 'LOGISTICA'
          ELSE 'SIN RETEN*'
        END AS RETEN
      FROM ${BD_SCHEMA}.po_vehiculo AS VE
      INNER JOIN ${BD_SCHEMA}.MAE_OPERACION_X_USUARIO AS USU
        ON VE.SECOPE = USU.IDOPERACION
      LEFT JOIN ${BD_SCHEMA}.PO_MODELO PMO
        ON PMO."ID" = VE.IDMOD
      LEFT JOIN ${BD_SCHEMA}.PO_MARCA PM
        ON PM.ID = VE.IDMAR
      LEFT JOIN ${BD_SCHEMA}.PO_TIPO PT
        ON PT."ID" = VE.IDTIP
      LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POS
        ON POS."ID" = USU.IDOPERACION
      LEFT JOIN ${BD_SCHEMA}.PO_SUPERVISORES PSUP
        ON PSUP.CODPLA = POS.IDSUP
      WHERE TRIM(VE.NUMPLA) = ? AND TRIM(USU.CH_CODI_USUARIO) = ?`;

    const result = await db.query(query, [placaLimpia, usuario]);
    if (result && result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(202).json({ mensaje: "Vehículo no encontrado" });
    }
  } catch (error) {
    console.error("❌ Error al buscar vehículo:", error, error.stack);
    res.status(500).json({ error: "Error al buscar vehículo por placa", detalle: error.message });
  }
};

// Buscar vehículo por placa en toda la empresa (sin filtro de usuario, pero oculta placas del usuario autenticado)
const buscarVehiculoPorPlacaEmpresa = async (req, res) => {
  try {
    const { placa } = req.params;
    const placaLimpia = placa.trim().toUpperCase();
    const usuario = req.session.user?.usuario?.trim().toUpperCase();

    const query = `
        SELECT
          PV.NUMPLA AS PLACA,
          PM.DESCRIPCION AS MARCA,
          PMD.DESMODGEN AS MODELO,
          PT.DESCRIPCION AS TIPO,
          PV.COLOR,
          PV.ANO,
          PV.KILOMETRAJE,
          POPE."ID" AS ID_OPERACION,
          POPE.DESCRIPCION AS OPERACION,
          MOUS.CH_CODI_USUARIO
        FROM ${BD_SCHEMA}.PO_VEHICULO PV
        LEFT JOIN ${BD_SCHEMA}.PO_MARCA PM
          ON PV.IDMAR = PM.ID
        LEFT JOIN ${BD_SCHEMA}.PO_MODELO PMD
          ON PMD.ID = PV.IDMOD
        LEFT JOIN ${BD_SCHEMA}.PO_TIPO PT
          ON PT."ID" = PV.IDTIP
        LEFT JOIN ${BD_SCHEMA}.MAE_OPERACION_X_USUARIO MOUS
          ON MOUS.IDOPERACION = PV.SECOPE
        LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POPE
          ON MOUS.IDOPERACION = POPE."ID"
        WHERE PV.SECOPE NOT IN (
            SELECT IDOPERACION
            FROM ${BD_SCHEMA}.MAE_OPERACION_X_USUARIO
            WHERE CH_CODI_USUARIO = ?
        ) AND PV.NUMPLA = ?`;

    const result = await db.query(query, [usuario, placaLimpia]);
    if (result && result.length > 0) {
      // Si el usuario está autenticado y la placa es suya, mostrar mensaje especial
      // if (req.session.user && req.session.user.usuario) {
      //   const usuario = req.session.user.usuario.trim().toUpperCase();
      //   if (result[0].USUARIO_SUPER === usuario) {
      //     return res.status(200).json({ mensaje: "Esa placa la tienes asignada en tu operación" });
      //   }
      // }
      res.json(result[0]);
    } else {
      res.status(200).json({ mensaje: "Vehículo no encontrado" });
    }
  } catch (error) {
    console.error("❌ Error al buscar vehículo (empresa):", error, error.stack);
    res.status(500).json({ error: "Error al buscar vehículo por placa (empresa)", detalle: error.message });
  }
};

// Obtener la cantidad de placas/vehículos asignados al usuario autenticado usando la lógica de usuario_super
const obtenerCantidadPlacas = async (req, res) => {
  if (!req.session.user || !req.session.user.usuario) {
    return res.status(401).json({ mensaje: "No autenticado" });
  }
  try {
    const usuario = req.session.user?.usuario?.trim().toUpperCase();

    const query = `
            SELECT
              COUNT(*) AS cantidad_placas
            FROM ${BD_SCHEMA}.po_vehiculo AS VE
            INNER JOIN ${BD_SCHEMA}.MAE_OPERACION_X_USUARIO AS USU
              ON VE.SECOPE = USU.IDOPERACION
            WHERE TRIM(USU.CH_CODI_USUARIO) = ?`

    const result = await db.query(query, [usuario]);
    res.json({ cantidad: result[0]?.CANTIDAD_PLACAS ?? 0 });
  } catch (error) {
    console.error("❌ Error al obtener cantidad de placas:", error, error.stack);
    res.status(500).json({ error: "Error al obtener cantidad de placas", detalle: error.message });
  }
};

// Obtener la cantidad de placas por supervisor (usuario_super)
const obtenerCantidadPlacasPorSupervisor = async (req, res) => {
  try {
    const query = `
      SELECT
        USUARIO_SUPER,
        COUNT(*) AS cantidad_placas
      FROM (
        SELECT
          SUBSTR(TRIM(sup.NOM),1,1)
          || SUBSTR(
               TRIM(sup.APE),
               1,
               LOCATE(' ', TRIM(sup.APE)||' ')-1
             ) AS USUARIO_SUPER,
          veh.NUMPLA
        FROM ${BD_SCHEMA}.PO_SUPERVISORES sup
        JOIN ${BD_SCHEMA}.PO_OPERACIONES op ON sup.CODPLA = op.IDSUP
        JOIN ${BD_SCHEMA}.PO_VEHICULO veh ON veh.SECOPE = op.ID
      ) t
      GROUP BY USUARIO_SUPER
      ORDER BY USUARIO_SUPER
    `;
    const result = await db.query(query);
    res.json(result.map(row => ({ usuario_super: row.USUARIO_SUPER, cantidad: row.CANTIDAD_PLACAS })));
  } catch (error) {
    console.error("❌ Error al obtener cantidad de placas por supervisor:", error, error.stack);
    res.status(500).json({ error: "Error al obtener cantidad de placas por supervisor", detalle: error.message });
  }
};

// Listar todas las placas asignadas al usuario autenticado usando la lógica de usuario_super

module.exports = {
  buscarVehiculoPorPlaca,
  buscarVehiculoPorPlacaEmpresa,
  obtenerCantidadPlacas,
  obtenerCantidadPlacasPorSupervisor
};
