const db = require("../config/db");
const neumaticoService = require("../services/neumaticoService");

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
                d.ID_MOVIMIENTO,
                d.CODIGO_CASCO AS CODIGO,
                d.POSICION_NUEVA AS POSICION_NEU,
                A.DESCRIPCION AS TIPO_MOVIMIENTO, -- Action Description (Montaje, Ingreso)
                d.FECHA_SUCESO AS FECHA_MOVIMIENTO,
                d.ODOMETRO_VEHICULO AS KILOMETRO,
                d.PLACA,
                d.SUPERVISOR AS USUARIO_SUPER,
                d.OBSERVACION
                -- NOTA: NO devolvemos 'ESTADO' para evitar sobrescribir la data maestra (NEU_CABECERA)
            FROM SPEED400AT.NEU_DETALLE d
            LEFT JOIN SPEED400AT.NEU_ACCION A ON d.ID_ACCION = A.ID_ACCION
            INNER JOIN (
                SELECT CODIGO_CASCO, MAX(FECHA_SUCESO) AS FECHA_MAX
                FROM SPEED400AT.NEU_DETALLE
                WHERE UPPER(TRIM(PLACA)) = UPPER(?)
                GROUP BY CODIGO_CASCO
            ) ult ON d.CODIGO_CASCO = ult.CODIGO_CASCO AND d.FECHA_SUCESO = ult.FECHA_MAX
            WHERE UPPER(TRIM(d.PLACA)) = UPPER(?)
        `;

        const params = [placaTrim, placaTrim];

        if (usuario_super) {
            query += ` AND UPPER(TRIM(d.SUPERVISOR)) = UPPER(?)`;
            params.push(usuario_super.trim());
        }

        query += ` ORDER BY d.POSICION_NUEVA`;

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
            FROM SPEED400AT.NEU_DETALLE d
            LEFT JOIN SPEED400AT.NEU_ACCION A ON d.ID_ACCION = A.ID_ACCION
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
