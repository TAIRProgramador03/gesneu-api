const db = require('../config/db');// Ajusta según tu conexión a la base de datos
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

// Obtener cantidad de neumáticos disponibles por mes para un usuario
exports.getDisponiblesPorMes = async (req, res) => {
    try {
        const usuario = String(req.query.usuario).trim(); // El usuario se pasa como query param y se limpia
        // Llamada al stored procedure
        const result = await db.query(`CALL ${BD_SCHEMA}.SP_DISPONIBLES_POR_MES(?)`, [usuario]);
        const data = Array.isArray(result)
            ? result.filter(r => r && r.FECHA && r.CANTIDAD !== undefined)
            : [];
        res.json(data);
    } catch (error) {
        console.error('Error al obtener neumáticos disponibles por mes:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
};

// Obtener cantidad de neumáticos asignados por mes para un usuario
exports.getAsignadosPorMes = async (req, res) => {
    try {
        const usuario = String(req.query.usuario).trim();
        const result = await db.query(`CALL ${BD_SCHEMA}.SP_ASIGNADOS_POR_MES(?)`, [usuario]);
        const data = Array.isArray(result)
            ? result.filter(r => r && r.FECHA && r.CANTIDAD !== undefined)
            : [];
        res.json(data);
    } catch (error) {
        console.error('Error al obtener neumáticos asignados por mes:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
};

// Obtener inspecciones de neumáticos por rango de fechas y usuario
exports.getNeuInspeccionPorFechas = async (req, res) => {
    try {
        const usuario = String(req.query.usuario).trim();
        const { fechaInicio, fechaFin } = req.query;
        if (!fechaInicio || !fechaFin || !usuario) {
            return res.status(400).json({ error: 'Debe proporcionar usuario, fechaInicio y fechaFin' });
        }

        // EGAMBOA
        // GESNEU

        let params = [fechaInicio, fechaFin]
        let queryBase = `
                SELECT
                    NP.CODIGO,
                    NM.POSICION_NUEVA AS POSICION_NEU,
                    NM.REMANENTE_MEDIDO AS REMANENTE ,
                    NM.KM_RECORRIDOS_ETAPA AS KILOMETRO ,
                    NM.FECHA_INSPECCION AS FECHA_REGISTRO, -- FECHA_REGISTRO
                    PLACA,
                    NM.PORCENTAJE_VIDA AS ESTADO ,
                    USUARIO_REGISTRADOR AS USUARIO_SUPER
                FROM
                    ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
                LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                    ON NP."ID" = NM.ID_NEUMATICO
                WHERE
                    NM.ID_ACCION = 7 AND
                    NM.FECHA_INSPECCION BETWEEN ? AND ?`

        if (usuario.trim() !== 'EGAMBOA' && usuario.trim() !== 'GESNEU') {
            queryBase += ' AND USUARIO_REGISTRADOR = ?'
            params.push(usuario)
        }

        queryBase += ' ORDER BY NM.FECHA_INSPECCION'

        const result = await db.query(queryBase, params);

        const data = Array.isArray(result) ? result.filter(r => r && r.CODIGO) : [];

        res.json(data);
    } catch (error) {
        console.error('Error al obtener inspecciones de neumáticos:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
};


exports.getMovimientosDeNeumaticosEnBaja = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NM.ID AS ID_MOVIMIENTO,
                NP.ID AS ID_NEUMATICO,
                NP.CODIGO AS CODIGO_NEUMATICO,
                NMAR.MARCA AS MARCA_NEUMATICO,
                NP.MEDIDA AS MEDIDA_NEUMATICO,
                NP.DISENO AS DISENO_NEUMATICO,
                NP.COSTO_INICIAL AS COSTO_NEUMATICO,
                NM.PLACA AS PLACA_MOVIMIENTO,
                NM.PROYECTO AS PROYECTO_MOVIMIENTO,
                NM.KM_RECORRIDOS_ETAPA AS KM_RECORRIDOS_MOVIMIENTO,
                NVK.TIPO_TERRENO AS TERRENO,
                NVK.RETEN AS CONDICION,
                NMBAJA.TIPO_BAJA,
                NMBAJA.FECHA_BAJA
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO
                AND NI.ID_ESTADO = 3
            LEFT JOIN ${BD_SCHEMA}.NEU_VKILOMETRAJE NVK
                ON NVK.FECHA_INSPECCION = NM.FECHA_INSPECCION
                AND NVK.PLACA = NM.PLACA
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getMovimientosDeNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}