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
    try {
        const { codigo } = req.params;
        const { usuario_super } = req.query;
        if (!codigo || codigo.trim() === "") {
            return res.status(400).json({ error: "El código es requerido" });
        }
        const codigoTrim = codigo.trim();

        let query = `
            SELECT 
                d.ID_MOVIMIENTO, 
                d.CODIGO_CASCO AS CODIGO, 
                d.POSICION_NUEVA AS POSICION_NEU, 
                -- TIPO_MOVIMIENTO debe mostrar la ACCIÓN (MONTAJE, INGRESO), no el estado
                A.DESCRIPCION AS TIPO_MOVIMIENTO,
                d.FECHA_SUCESO AS FECHA_MOVIMIENTO, 
                d.ODOMETRO_VEHICULO AS KILOMETRO, 
                d.PLACA, 
                d.SUPERVISOR AS USUARIO_SUPER,
                d.OBSERVACION
            FROM ${BD_SCHEMA}.NEU_DETALLE d
            LEFT JOIN ${BD_SCHEMA}.NEU_ACCION A ON d.ID_ACCION = A.ID_ACCION
            WHERE d.CODIGO_CASCO = ?`;

        const params = [codigoTrim];

        if (usuario_super) {
            query += ` AND UPPER(TRIM(d.SUPERVISOR)) = UPPER(?)`;
            params.push(usuario_super.trim());
        }

        query += ` ORDER BY d.ID_MOVIMIENTO ASC, d.FECHA_SUCESO ASC`;
        // ID_MOVIMIENTO es Identity y cronológico, mejor para ordenar que solo fecha si ocurren en el mismo segundo.

        const result = await db.query(query, params);
        res.json(result);
    } catch (error) {
        console.error("Error al obtener historial de movimientos (Refactored):", error);
        res.status(500).json({ error: "Error al obtener historial de movimientos" });
    }
};

module.exports = {
    listarUltimosMovimientosPorPlaca,
    obtenerUltimosMovimientosPorCodigo,
    obtenerHistorialMovimientosPorCodigo,
};
