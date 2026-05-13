const db = require("../config/db");
const neumaticoService = require("../services/neumaticoService");
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

// ============================================================================
// ADAPTADOR LEGACY: Mapeo de NEU_DETALLE (Nuevo) -> Esquema Antiguo (Frontend)
// ============================================================================

// Obtener el último movimiento de cada neumático instalado en una placa
const listarUltimosMovimientosPorPlaca = async (req, res) => {
    try {
        const { placa } = req.params;
        const { usuario_super } = req.query;
        if (!placa || placa.trim() === "") {
            return res.status(400).json({ error: "La placa es requerida" });
        }
        const placaTrim = placa.trim();

        let query = `
        SELECT
            NM."ID",
            NM.ID_NEUMATICO,
            NM.POSICION_NUEVA AS POSICION_NEU,
            NA.DESCRIPCION AS TIPO_MOVIMIENTO,
            NM.FECHA_MOVIMIENTO,
            NM.PLACA,
            NM.COD_SUPERVISOR AS USUARIO_SUPER,
            NM.OBS AS OBSERVACIO,
            (SELECT VK.KILOMETRAJE
                FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                WHERE VK.PLACA = NM.PLACA
                ORDER BY VK.ID DESC
                FETCH FIRST 1 ROW ONLY
            ) AS KILOMETRO
        FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
        INNER JOIN ${BD_SCHEMA}.NEU_ACCION NA
            ON NA.ID_ACCION = NM.ID_ACCION
        WHERE NM.PLACA = ?
        `;

        const params = [placaTrim];

        // TODO:
        // if (usuario_super) {
        //     query += ` AND UPPER(TRIM(d.SUPERVISOR)) = UPPER(?)`;
        //     params.push(usuario_super.trim());
        // }

        query += ` ORDER BY NM.POSICION_NUEVA`;

        const result = await db.query(query, params);
        res.json(result);
    } catch (error) {
        console.error("Error al obtener últimos movimientos de neumáticos (Refactored):", error);
        res.status(500).json({ error: "Error al obtener últimos movimientos de neumáticos" });
    }
};

// Obtener el último movimiento de cada posición de un neumático por su código
const obtenerUltimosMovimientosPorCodigo = async (req, res) => {
    try {
        const { codigo } = req.params;
        const { usuario_super } = req.query; // Filtro legacy opcional

        if (!codigo || codigo.trim() === "") {
            return res.status(400).json({ error: "El código es requerido" });
        }

        // Delegar al servicio normalizado
        const result = await neumaticoService.obtenerUltimosMovimientos(codigo, usuario_super);

        res.json(result);
    } catch (error) {
        console.error("Error al obtener últimos movimientos de neumáticos (Service):", error);
        res.status(500).json({ error: "Error al obtener últimos movimientos de neumáticos" });
    }
};


// Obtener el historial completo de movimientos de un neumático por su código
const obtenerHistorialMovimientosPorCodigo = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    try {
        const { codigo } = req.query;
        // const { usuario_super } = req.query;
        if (!codigo || codigo.trim() === "") {
            return res.status(400).json({ error: "El código es requerido" });
        }
        const codigoTrim = codigo.trim();

        let query = `
            SELECT
                nm."ID"                    AS ID_MOVIMIENTO,
                np.CODIGO                  AS CODIGO_NEUMATICO,
                nm.PLACA                   AS PLACA_VEHICULO,
                nm.PROYECTO                AS TALLER_ASIGNADO,
                na.ID_ACCION               AS ID_ACCION_REALIZADA,
                na.DESCRIPCION             AS ACCION_REALIZADA,
                nm.POSICION_ANTERIOR       AS POSICION_ANTERIOR_EN_VEHICULO,
                nm.POSICION_NUEVA          AS POSICION_NUEVA_EN_VEHICULO,
                nm.REMANENTE_MEDIDO        AS REMANENTE_MEDIDO_MM,
                nm.PRESION_MEDIDA          AS PRESION_AIRE_PSI,
                nm.TORQUE_APLICADO         AS TORQUE_APLICADO_NM,
                nm.KM_RECORRIDOS_ETAPA     AS KM_RECORRIDOS_EN_ETAPA,
                nm.PORCENTAJE_VIDA         AS PORCENTAJE_VIDA_UTIL,
                nm.OBS                     AS OBSERVACION,
                nm.USUARIO_REGISTRADOR     AS USUARIO_REGISTRADOR,
                CASE
                    WHEN na.ID_ACCION = 2 THEN nm.FECHA_ASIGNACION -- MONTAJE
                    WHEN na.ID_ACCION = 4 THEN nm.FECHA_RECUPERADO -- ROTACION
                    WHEN na.ID_ACCION = 5 THEN nm.FECHA_RECUPERADO -- BAJA
                    WHEN na.ID_ACCION = 6 THEN nm.FECHA_RECUPERADO -- RECUPERADO
                    WHEN na.ID_ACCION = 7 THEN nm.FECHA_INSPECCION -- INSPECCION
                    ELSE NULL
                END                        AS FECHA_MOVIMIENTO,
                nm.FECHA_MOVIMIENTO        AS FECHA_REGISTRO_MOVIMIENTO
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS nm
            INNER JOIN ${BD_SCHEMA}.NEU_PADRON np
                ON np."ID" = nm.ID_NEUMATICO
            INNER JOIN ${BD_SCHEMA}.NEU_ACCION na
                ON na.ID_ACCION = nm.ID_ACCION
            WHERE np.CODIGO = ?
            ORDER BY nm."ID" ASC
        `;

        // extraer el id de la accion -> ID_ACCION
        // dependiendo del id de la accion sacar la fecha -> 




        // const params = [codigoTrim];

        // if (usuario_super) {
        //     query += ` AND UPPER(TRIM(d.SUPERVISOR)) = UPPER(?)`;
        //     params.push(usuario_super.trim());
        // }

        // query += ` ORDER BY d.ID_MOVIMIENTO ASC, d.FECHA_SUCESO ASC`;
        // ID_MOVIMIENTO es Identity y cronológico, mejor para ordenar que solo fecha si ocurren en el mismo segundo.

        const result = await db.query(query, [codigoTrim]);
        res.json(result);
    } catch (error) {
        console.error("Error al obtener historial de movimientos (Refactored):", error);
        res.status(500).json({ error: "Error al obtener historial de movimientos" });
    }
};


const obtenerHistorialMovimientosPorPlaca = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const { placa } = req.query;
        if (!placa || placa.trim() === "") return res.status(400).json({ error: "La placa es requerida" });
        const placaTrim = placa.trim();

        let query = `
            SELECT
                nm."ID"                    AS ID_MOVIMIENTO,
                np.CODIGO                  AS CODIGO_NEUMATICO,
                nm.PLACA                   AS PLACA_VEHICULO,
                nm.PROYECTO                AS TALLER_ASIGNADO,
                na.ID_ACCION               AS ID_ACCION_REALIZADA,
                na.DESCRIPCION             AS ACCION_REALIZADA,
                nm.POSICION_ANTERIOR       AS POSICION_ANTERIOR_EN_VEHICULO,
                nm.POSICION_NUEVA          AS POSICION_NUEVA_EN_VEHICULO,
                nm.REMANENTE_MEDIDO        AS REMANENTE_MEDIDO_MM,
                nm.PRESION_MEDIDA          AS PRESION_AIRE_PSI,
                nm.TORQUE_APLICADO         AS TORQUE_APLICADO_NM,
                nm.KM_RECORRIDOS_ETAPA     AS KM_RECORRIDOS_EN_ETAPA,
                nm.PORCENTAJE_VIDA         AS PORCENTAJE_VIDA_UTIL,
                nm.OBS                     AS OBSERVACION,
                nm.USUARIO_REGISTRADOR     AS USUARIO_REGISTRADOR,
                CASE
                    WHEN na.ID_ACCION = 2 THEN nm.FECHA_ASIGNACION -- MONTAJE
                    WHEN na.ID_ACCION = 4 THEN nm.FECHA_RECUPERADO -- ROTACION
                    WHEN na.ID_ACCION = 5 THEN nm.FECHA_RECUPERADO -- BAJA
                    WHEN na.ID_ACCION = 6 THEN nm.FECHA_RECUPERADO -- RECUPERADO
                    WHEN na.ID_ACCION = 7 THEN nm.FECHA_INSPECCION -- INSPECCION
                    ELSE NULL
                END                        AS FECHA_MOVIMIENTO,
                nm.FECHA_MOVIMIENTO        AS FECHA_REGISTRO_MOVIMIENTO,
                nv.KILOMETRAJE AS CAMBIO_KILOMETRAJE,
                nv.TIPO_TERRENO AS TIPO_TERRENO,
                nv.RETEN AS CONDICION
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS nm
            INNER JOIN ${BD_SCHEMA}.NEU_PADRON np
                ON np."ID" = nm.ID_NEUMATICO
            INNER JOIN ${BD_SCHEMA}.NEU_ACCION na
                ON na.ID_ACCION = nm.ID_ACCION
            LEFT JOIN ${BD_SCHEMA}.NEU_VKILOMETRAJE nv 
                ON nv.PLACA = nm.PLACA AND
                nv.FECHA_INSPECCION = nm.FECHA_INSPECCION
            WHERE nm.PLACA = ?
            ORDER BY nm."ID" DESC`;

        const result = await db.query(query, [placaTrim]);
        res.json(result);
    } catch (error) {
        console.error("Error al obtener historial de movimientos de la placa (Refactored):", error);
        res.status(500).json({ error: "Error al obtener historial de movimientos de la placa" });
    }
}

module.exports = {
    listarUltimosMovimientosPorPlaca,
    obtenerUltimosMovimientosPorCodigo,
    obtenerHistorialMovimientosPorCodigo,
    obtenerHistorialMovimientosPorPlaca
};
