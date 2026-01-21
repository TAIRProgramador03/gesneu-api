const db = require("../config/db");

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
    const query = `
      SELECT
        V.NUMPLA       AS PLACA,
        M.DESCRIPCION  AS MARCA,
        MO.DESMODGEN   AS MODELO,
        T.DESCRIPCION  AS TIPO,
        V.COLOR,
        V.ANO,
        V.KILOMETRAJE,
        TRIM(TA.DESCRIPCION) AS PROYECTO,
        OP.ID          AS ID_OPERACION,
        OP.DESCRIPCION AS OPERACION,
        SUBSTR(TRIM(SUP.NOM), 1, 1)
        || SUBSTR(
             TRIM(SUP.APE),
             1,
             LOCATE(' ', TRIM(SUP.APE) || ' ') - 1
           ) AS USUARIO_SUPER
      FROM SPEED400AT.PO_VEHICULO      V
      JOIN SPEED400AT.PO_OPERACIONES   OP  ON V.SECOPE = OP.ID
      JOIN SPEED400AT.PO_SUPERVISORES  SUP ON OP.IDSUP = SUP.CODPLA
      LEFT JOIN SPEED400AT.PO_MODELO   MO  ON V.IDMOD = MO.ID
      LEFT JOIN SPEED400AT.PO_MARCA    M   ON V.IDMAR = M.ID
      LEFT JOIN SPEED400AT.PO_TIPO     T   ON V.IDTIP = T.ID
      LEFT JOIN SPEED400AT.PO_TALLER   TA  ON TA.CH_CODI_RESPONSABLE =
        SUBSTR(TRIM(SUP.NOM), 1, 1)
        || SUBSTR(
             TRIM(SUP.APE),
             1,
             LOCATE(' ', TRIM(SUP.APE) || ' ') - 1
           )
      WHERE
        TRIM(V.NUMPLA) = ?
        
        AND (
          SUBSTR(TRIM(SUP.NOM), 1, 1)
          || SUBSTR(
               TRIM(SUP.APE),
               1,
               LOCATE(' ', TRIM(SUP.APE) || ' ') - 1
             )
        ) = ?
      ORDER BY V.NUMPLA
    `;
    const result = await db.query(query, [placaLimpia, usuario]);
    if (result && result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).json({ mensaje: "Vehículo no encontrado" });
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
    const query = `
      SELECT
        V.NUMPLA       AS PLACA,
        M.DESCRIPCION  AS MARCA,
        MO.DESMODGEN   AS MODELO,
        T.DESCRIPCION  AS TIPO,
        V.COLOR,
        V.ANO,
        V.KILOMETRAJE,
        TRIM(TA.DESCRIPCION) AS PROYECTO,
        OP.ID          AS ID_OPERACION,
        OP.DESCRIPCION AS OPERACION,
        SUBSTR(TRIM(SUP.NOM), 1, 1)
        || SUBSTR(
             TRIM(SUP.APE),
             1,
             LOCATE(' ', TRIM(SUP.APE) || ' ') - 1
           ) AS USUARIO_SUPER
      FROM SPEED400AT.PO_VEHICULO      V
      JOIN SPEED400AT.PO_OPERACIONES   OP  ON V.SECOPE = OP.ID
      JOIN SPEED400AT.PO_SUPERVISORES  SUP ON OP.IDSUP = SUP.CODPLA
      LEFT JOIN SPEED400AT.PO_MODELO   MO  ON V.IDMOD = MO.ID
      LEFT JOIN SPEED400AT.PO_MARCA    M   ON V.IDMAR = M.ID
      LEFT JOIN SPEED400AT.PO_TIPO     T   ON V.IDTIP = T.ID
      LEFT JOIN SPEED400AT.PO_TALLER   TA  ON TA.CH_CODI_RESPONSABLE =
        SUBSTR(TRIM(SUP.NOM), 1, 1)
        || SUBSTR(
             TRIM(SUP.APE),
             1,
             LOCATE(' ', TRIM(SUP.APE) || ' ') - 1
           )
      WHERE TRIM(V.NUMPLA) = ?
      ORDER BY V.NUMPLA
    `;
    const result = await db.query(query, [placaLimpia]);
    if (result && result.length > 0) {
      // Si el usuario está autenticado y la placa es suya, mostrar mensaje especial
      if (req.session.user && req.session.user.usuario) {
        const usuario = req.session.user.usuario.trim().toUpperCase();
        if (result[0].USUARIO_SUPER === usuario) {
          return res.status(200).json({ mensaje: "Esa placa la tienes asignada en tu operación" });
        }
      }
      res.json(result[0]);
    } else {
      res.status(404).json({ mensaje: "Vehículo no encontrado" });
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
      SELECT COUNT(*) AS cantidad_placas
      FROM SPEED400AT.PO_SUPERVISORES sup
      JOIN SPEED400AT.PO_OPERACIONES op ON sup.CODPLA = op.IDSUP
      JOIN SPEED400AT.PO_VEHICULO veh ON veh.SECOPE = op.ID
      WHERE
        SUBSTR(TRIM(sup.NOM), 1, 1)
        || SUBSTR(
             TRIM(sup.APE),
             1,
             LOCATE(' ', TRIM(sup.APE) || ' ') - 1
           ) = ?
    `;
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
        FROM SPEED400AT.PO_SUPERVISORES sup
        JOIN SPEED400AT.PO_OPERACIONES op ON sup.CODPLA = op.IDSUP
        JOIN SPEED400AT.PO_VEHICULO veh ON veh.SECOPE = op.ID
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
