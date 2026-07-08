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
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
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
            AND NM.KM_RECORRIDOS_ETAPA > 10
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getMovimientosDeNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}


exports.getTalleresNeumaticosEnBaja = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NM.PROYECTO AS "value",
                NM.PROYECTO AS "label"
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
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
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NM.PROYECTO
            ORDER BY NM.PROYECTO ASC
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getTalleresNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getCondicionesNeumaticosEnBaja = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NVK.RETEN AS "value",
                UPPER(LEFT(NVK.RETEN, 1)) || LOWER(SUBSTR(NVK.RETEN, 2)) AS "label"
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
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
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NVK.RETEN
            ORDER BY NVK.RETEN ASC
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getCondicionesNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getDisenosNeumaticosEnBaja = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NP.DISENO AS "value",
                NP.DISENO AS "label"
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
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
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NP.DISENO
            ORDER BY NP.DISENO ASC
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDisenosNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getMarcasNeumaticosEnBaja = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NMAR.ID_MARCA AS "value",
                UPPER(LEFT(NMAR.MARCA, 1)) || LOWER(SUBSTR(NMAR.MARCA, 2)) AS "label"
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
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
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NMAR.MARCA, NMAR.ID_MARCA
            ORDER BY NMAR.MARCA ASC
        `;
        const result = await db.query(sql, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getMarcasNeumaticosEnBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getDistribucionPorTerreno = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    const { talleresSeleccionados = [], diseno = '', marcaF = '', fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');

    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NVK.TIPO_TERRENO,
                COUNT(DISTINCT NM.ID_NEUMATICO) AS QTY_NEUMATICOS_BAJA,
                SUM(NM.KM_RECORRIDOS_ETAPA) AS KM_TOTAL,
                SUM(NM.KM_RECORRIDOS_ETAPA) / COUNT(DISTINCT NM.ID_NEUMATICO) AS KM_PROMEDIO
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
                ${diseno !== '' ? ' AND NP.DISENO = ?' : ''}
                ${marcaF !== '' ? ' AND NP.ID_MARCA = ?' : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO AND NI.ID_ESTADO = 3
                ${talleresSeleccionados.length >= 1 ? ` AND NI.PROYECTO_ACTUAL IN (${placeholders})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_VKILOMETRAJE NVK
                ON NVK.FECHA_INSPECCION = NM.FECHA_INSPECCION AND NVK.PLACA = NM.PLACA
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NVK.TIPO_TERRENO
            ORDER BY KM_PROMEDIO DESC
        `;

        const parameters = []
        if (diseno !== '') parameters.push(diseno)
        if (marcaF !== '') parameters.push(marcaF)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        parameters.push(usuario)

        if (fechaInicio !== '') parameters.push(fechaInicio)
        if (fechaFin !== '') parameters.push(fechaFin)

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDistribucionPorTerreno:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getDistribucionPorMotivoDeBaja = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    const { talleresSeleccionados = [], diseno = '', marcaF = '', fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const usuario = req.session.user.usuario;

    try {
        const sql = `
            SELECT
                NMBAJA.TIPO_BAJA AS TIPO_BAJA,
                COUNT(DISTINCT NM.ID_NEUMATICO) AS QTY_NEUMATICOS_BAJA,
                SUM(NM.KM_RECORRIDOS_ETAPA) AS KM_TOTAL,
                SUM(NM.KM_RECORRIDOS_ETAPA) / COUNT(DISTINCT NM.ID_NEUMATICO) AS KM_PROMEDIO
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
                ${diseno !== '' ? ' AND NP.DISENO = ?' : ''}
                ${marcaF !== '' ? ' AND NP.ID_MARCA = ?' : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO AND NI.ID_ESTADO = 3
                ${talleresSeleccionados.length >= 1 ? ` AND NI.PROYECTO_ACTUAL IN (${placeholders})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_VKILOMETRAJE NVK
                ON NVK.FECHA_INSPECCION = NM.FECHA_INSPECCION AND NVK.PLACA = NM.PLACA
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NMBAJA.TIPO_BAJA
            ORDER BY KM_PROMEDIO DESC
        `;

        const parameters = []
        if (diseno !== '') parameters.push(diseno)
        if (marcaF !== '') parameters.push(marcaF)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        parameters.push(usuario)
        if (fechaInicio !== '') parameters.push(fechaInicio)
        if (fechaFin !== '') parameters.push(fechaFin)

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDistribucionPorMotivoDeBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}

exports.getDistribucionVehicularPorTerreno = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    const { talleresSeleccionados = [], diseno = '', marcaF = '', fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const usuario = req.session.user.usuario;

    try {
        const sql = `
            SELECT
                NVK.TIPO_TERRENO AS "name",
                COUNT(DISTINCT NMBAJA.PLACA) AS "value"
            FROM SPEED400AT.NEU_MOVIMIENTOS NM
            LEFT JOIN SPEED400AT.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID AND NP.COSTO_INICIAL >= 1
                    ${diseno !== '' ? ' AND NP.DISENO = ?' : ''}
                    ${marcaF !== '' ? ' AND NP.ID_MARCA = ?' : ''}
            LEFT JOIN SPEED400AT.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN SPEED400AT.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO AND NI.ID_ESTADO = 3
                ${talleresSeleccionados.length >= 1 ? ` AND NI.PROYECTO_ACTUAL IN (${placeholders})` : ''}
            LEFT JOIN SPEED400AT.NEU_VKILOMETRAJE NVK
                ON NVK.FECHA_INSPECCION = NM.FECHA_INSPECCION AND NVK.PLACA = NM.PLACA
            INNER JOIN SPEED400AT.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN SPEED400AT.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA, PLACA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM SPEED400AT.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NVK.TIPO_TERRENO
            ORDER BY NVK.TIPO_TERRENO ASC
        `;

        const parameters = []
        if (diseno !== '') parameters.push(diseno)
        if (marcaF !== '') parameters.push(marcaF)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        parameters.push(usuario)
        if (fechaInicio !== '') parameters.push(fechaInicio)
        if (fechaFin !== '') parameters.push(fechaFin)

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDistribucionVehicularPorTerreno:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }

}