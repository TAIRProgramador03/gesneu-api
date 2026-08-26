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

    const { talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')

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
                ON NM.ID_NEUMATICO = NP.ID
                ${disenos.length >= 1 ? ` AND NP.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NP.ID_MARCA IN (${placeholdersMarcas})` : ''}
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
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
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

    const { talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')
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
                ON NM.ID_NEUMATICO = NP.ID
                ${disenos.length >= 1 ? ` AND NP.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NP.ID_MARCA IN (${placeholdersMarcas})` : ''}
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
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
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

    const { talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')
    const usuario = req.session.user.usuario;

    try {
        const sql = `
            SELECT
                NVK.TIPO_TERRENO AS "name",
                COUNT(DISTINCT NMBAJA.PLACA) AS "value"
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID
                ${disenos.length >= 1 ? ` AND NP.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NP.ID_MARCA IN (${placeholdersMarcas})` : ''}
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
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA, PLACA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY NVK.TIPO_TERRENO
            ORDER BY NVK.TIPO_TERRENO ASC
        `;

        const parameters = []
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
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

exports.getRelacionNeumaticosPorTerreno = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    if (!req.body.terreno) return res.status(400).json({ error: 'Debe proporcionar el tipo de terreno' });

    const { terreno, talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body

    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')

    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NM.ID_NEUMATICO AS ID_NEUMATICO,
                NP.CODIGO AS CODIGO_NEUMATICO,
                NMAR.MARCA AS MARCA_NEUMATICO,
                NP.MEDIDA AS MEDIDA_NEUMATICO,
                NP.DISENO AS DISENO_NEUMATICO,
                NI.PROYECTO_ACTUAL AS PROYECTO_NEUMATICO,
                NP.COSTO_INICIAL AS COSTO_NEUMATICO,
                CAST(NI.ES_RECUPERADO AS SMALLINT) AS ES_RECUPERADO,
                NMBAJA.PLACA AS PLACA_BAJA,
                SUM(NM.KM_RECORRIDOS_ETAPA) AS KM_TOTAL_VIDA,
                NVK.TIPO_TERRENO,
                NMBAJA.TIPO_BAJA,
                NMBAJA.FECHA_BAJA,
                NI.REMANENTE_ACTUAL,
                NI.PORCENTAJE_VIDA
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID
                ${disenos.length >= 1 ? ` AND NP.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NP.ID_MARCA IN (${placeholdersMarcas})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO AND NI.ID_ESTADO = 3
                ${talleresSeleccionados.length >= 1 ? ` AND NI.PROYECTO_ACTUAL IN (${placeholders})` : ''}
            INNER JOIN ${BD_SCHEMA}.NEU_VKILOMETRAJE NVK
                ON NVK.FECHA_INSPECCION = NM.FECHA_INSPECCION 
                AND NVK.PLACA = NM.PLACA
                AND NVK.TIPO_TERRENO = ?   
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA, PLACA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY
                NM.ID_NEUMATICO,
                NP.CODIGO,
                NMAR.MARCA,
                NP.MEDIDA,
                NP.DISENO,
                NI.PROYECTO_ACTUAL,
                NP.COSTO_INICIAL,
                NI.ES_RECUPERADO,
                NVK.TIPO_TERRENO,
                NMBAJA.TIPO_BAJA,
                NMBAJA.PLACA,
                NMBAJA.FECHA_BAJA,
                NI.REMANENTE_ACTUAL,
                NI.PORCENTAJE_VIDA
            ORDER BY NMBAJA.FECHA_BAJA DESC
        `;

        const parameters = []
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        parameters.push(terreno)
        parameters.push(usuario)

        if (fechaInicio !== '') parameters.push(fechaInicio)
        if (fechaFin !== '') parameters.push(fechaFin)

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getRelacionNeumaticosPorTerreno:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }

}

exports.getRelacionNeumaticosPorBaja = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    if (!req.body.baja) return res.status(400).json({ error: 'Debe proporcionar el tipo de baja' });

    const { baja, talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body

    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')

    const usuario = req.session.user.usuario;
    try {
        const sql = `
            SELECT
                NM.ID_NEUMATICO AS ID_NEUMATICO,
                NP.CODIGO AS CODIGO_NEUMATICO,
                NMAR.MARCA AS MARCA_NEUMATICO,
                NP.MEDIDA AS MEDIDA_NEUMATICO,
                NP.DISENO AS DISENO_NEUMATICO,
                NI.PROYECTO_ACTUAL AS PROYECTO_NEUMATICO,
                NP.COSTO_INICIAL AS COSTO_NEUMATICO,
                CAST(NI.ES_RECUPERADO AS SMALLINT) AS ES_RECUPERADO,
                NMBAJA.PLACA AS PLACA_BAJA,
                SUM(NM.KM_RECORRIDOS_ETAPA) AS KM_TOTAL_VIDA,
                NMBAJA.TIPO_BAJA,
                NMBAJA.FECHA_BAJA,
                NI.REMANENTE_ACTUAL,
                NI.PORCENTAJE_VIDA
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NM.ID_NEUMATICO = NP.ID
                ${disenos.length >= 1 ? ` AND NP.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NP.ID_MARCA IN (${placeholdersMarcas})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMAR
                ON NP.ID_MARCA = NMAR.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO AND NI.ID_ESTADO = 3
                ${talleresSeleccionados.length >= 1 ? ` AND NI.PROYECTO_ACTUAL IN (${placeholders})` : ''}
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            INNER JOIN (
                SELECT ID_NEUMATICO, FECHA_RECUPERADO AS FECHA_BAJA, TIPO_BAJA, PLACA,
                ROW_NUMBER() OVER (PARTITION BY ID_NEUMATICO ORDER BY ID DESC) AS RN1
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_ACCION = 5
                ${fechaInicio !== '' ? ` AND FECHA_RECUPERADO >= ?` : ''}
                ${fechaFin !== '' ? ` AND FECHA_RECUPERADO <= ?` : ''}
                ${` AND TIPO_BAJA = ?`}
            ) NMBAJA ON NMBAJA.ID_NEUMATICO = NM.ID_NEUMATICO AND NMBAJA.RN1 = 1
            WHERE NM.ID_ACCION = 7
            AND NM.KM_RECORRIDOS_ETAPA > 10
            GROUP BY
                NM.ID_NEUMATICO,
                NP.CODIGO,
                NMAR.MARCA,
                NP.MEDIDA,
                NP.DISENO,
                NI.PROYECTO_ACTUAL,
                NP.COSTO_INICIAL,
                NI.ES_RECUPERADO,
                NMBAJA.TIPO_BAJA,
                NMBAJA.PLACA,
                NMBAJA.FECHA_BAJA,
                NI.REMANENTE_ACTUAL,
                NI.PORCENTAJE_VIDA
            ORDER BY NMBAJA.FECHA_BAJA DESC
        `;

        const parameters = []
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        parameters.push(usuario)

        if (fechaInicio !== '') parameters.push(fechaInicio)
        if (fechaFin !== '') parameters.push(fechaFin)
        parameters.push(baja)

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getRelacionNeumaticosPorBaja:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }

}

exports.getDespachosNeumaticosPorTaller = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    const { talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')
    const usuario = req.session.user.usuario;

    try {
        const sql = `
            SELECT
                t.DESCRIPCION AS TALLER,
                COUNT(*) AS QTY_NEUMATICOS_DESPACHADOS
            FROM ${BD_SCHEMA}.TMOVD AS SINVSE
            INNER JOIN ${BD_SCHEMA}.TMOVH AS SINVSEH
                ON SINVSEH.MHCMOV = SINVSE.MDCMOV
                AND SINVSEH.MHTMOV = SINVSE.MDTMOV
                AND SINVSEH.MHALMA = SINVSE.MDALMA
                AND SINVSEH.MHCOMP = SINVSE.MDCOMP
                AND (TRIM(SINVSEH.MHREF6) LIKE '%NEU' OR TRIM(SINVSEH.MHREF6) LIKE '%SIN' OR TRIM(SINVSEH.MHREF6) LIKE '%COB')
            INNER JOIN ${BD_SCHEMA}.NEU_PADRON NPADRON
                ON TRIM(NPADRON.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, 1, LOCATE('-', SINVSE.MDDRE7) - 1))
                ${disenos.length >= 1 ? ` AND NPADRON.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NPADRON.ID_MARCA IN (${placeholdersMarcas})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION NINFO
                ON NINFO.ID_NEUMATICO = NPADRON.ID
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMARCA
                ON NMARCA.ID_MARCA = NPADRON.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND TRIM(t.CH_SERI_TALLER) = TRIM(SUBSTR(SINVSEH.MHREF6, 1, 4))
                ${talleresSeleccionados.length >= 1 ? ` AND t.DESCRIPCION IN (${placeholders})` : ''}
            WHERE SINVSE.MDCMOV = 'S'
            AND SINVSE.MDTMOV = '60'
            AND TRIM(SINVSE.MDDRE7) <> ''
            AND SINVSE.MDCOAR LIKE '%140%'
            AND LOCATE('-', SINVSE.MDDRE7) > 0
            ${fechaInicio !== '' ? `AND SINVSE.MDFECH >= ?` : ''}
            ${fechaFin !== '' ? `AND SINVSE.MDFECH <= ?` : ''}
            AND (
                EXISTS (
                    SELECT 1 FROM ${BD_SCHEMA}.NEU_PADRON NP
                    WHERE TRIM(NP.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, 1, LOCATE('-', SINVSE.MDDRE7) - 1))
                )
                AND
                EXISTS (
                    SELECT 1 FROM ${BD_SCHEMA}.NEU_PADRON NP
                    WHERE TRIM(NP.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, LOCATE('-', SINVSE.MDDRE7) + 1))
                )
            )
            GROUP BY t.DESCRIPCION
            ORDER BY QTY_NEUMATICOS_DESPACHADOS DESC
        `;

        const parameters = []
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
        parameters.push(usuario)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        if (fechaInicio !== '') parameters.push(fechaInicio.replace(/-/g, ''))
        if (fechaFin !== '') parameters.push(fechaFin.replace(/-/g, ''))

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDespachosNeumaticosPorTaller:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}


exports.getDespachosNeumaticosPorTallerUnico = async (req, res) => {

    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });

    const { talleresSeleccionados = [], disenos = [], marcas = [], fechaInicio = '', fechaFin = '' } = req.body
    const placeholders = talleresSeleccionados.map(() => '?').join(',');
    const placeholdersMarcas = marcas.map(() => '?').join(',')
    const placeholdersDisenos = disenos.map(() => '?').join(',')
    const usuario = req.session.user.usuario;

    try {
        const sql = `
            SELECT
                SINVSEH.MHCOMP AS VALE_SALIDA,
                SINVSE.MDCORR AS CORRELATIVO_SALIDA,
                TRIM(SINVSE.MDCOAR) AS CODIGO_ARTICULO_SALIDA,
                DATE(SUBSTR(CHAR(SINVSE.MDFECH), 1, 4) || '-' ||
                SUBSTR(CHAR(SINVSE.MDFECH), 5, 2) || '-' ||
                SUBSTR(CHAR(SINVSE.MDFECH), 7, 2)) AS FECHA_SALIDA,
                TRIM(SINVSEH.MHREF3) AS PLACA_SALIDA,
                TRIM(SINVSEH.MHREF6) AS OT_SALIDA,
                TRIM(SINVSE.MDDRE7) AS NUEVO_USADO_SALIDA,
                T.DESCRIPCION AS TALLER_SALIDA,
                PSUBTIM.DETALLE AS TIPO_MANT_SALIDA,
                NPADRON.CODIGO AS CODIGO,
                NPADRON.DISENO AS DISENO_NEUMATICO,
                NPADRON.MEDIDA AS MEDIDA_NEUMATICO,
                NINFO.PROYECTO_ACTUAL AS TALLER_NEUMATICO,
                NPADRON.COSTO_INICIAL AS COSTO_NEUMATICO,
                CAST(NINFO.ES_RECUPERADO AS SMALLINT) AS RECUPERADO_NEUMATICO,
                NINFO.KM_TOTAL_VIDA AS KM_NEUMATICO,
                NINFO.PLACA_ACTUAL AS PLACA_NEUMATICO,
                NEST.CODIGO_INTERNO AS SITUACION_NEUMATICO,
                NINFO.REMANENTE_ACTUAL AS REMANENTE_NEUMATICO,
                NINFO.PORCENTAJE_VIDA AS VIDA_NEUMATICO,
                NMARCA.MARCA AS MARCA_NEUMATICO
            FROM ${BD_SCHEMA}.TMOVD AS SINVSE
            INNER JOIN ${BD_SCHEMA}.TMOVH AS SINVSEH
                ON SINVSEH.MHCMOV = SINVSE.MDCMOV
                AND SINVSEH.MHTMOV = SINVSE.MDTMOV
                AND SINVSEH.MHALMA = SINVSE.MDALMA
                AND SINVSEH.MHCOMP = SINVSE.MDCOMP
                AND (TRIM(SINVSEH.MHREF6) LIKE '%NEU' OR TRIM(SINVSEH.MHREF6) LIKE '%SIN' OR TRIM(SINVSEH.MHREF6) LIKE '%COB')
            INNER JOIN ${BD_SCHEMA}.NEU_PADRON NPADRON
                ON TRIM(NPADRON.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, 1, LOCATE('-', SINVSE.MDDRE7) - 1))
                ${disenos.length >= 1 ? ` AND NPADRON.DISENO IN (${placeholdersDisenos})` : ''}
                ${marcas.length >= 1 ? ` AND NPADRON.ID_MARCA IN (${placeholdersMarcas})` : ''}
            LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION NINFO
                ON NINFO.ID_NEUMATICO = NPADRON.ID
            LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO NEST
                ON NEST.ID_ESTADO = NINFO.ID_ESTADO
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NMARCA
                ON NMARCA.ID_MARCA = NPADRON.ID_MARCA
            LEFT JOIN ${BD_SCHEMA}.PO_SUBTIPOMANT PSUBTIM
	            ON VARCHAR(PSUBTIM.IDSM) = SINVSEH.MHREF5
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND TRIM(t.CH_SERI_TALLER) = TRIM(SUBSTR(SINVSEH.MHREF6, 1, 4))
                ${talleresSeleccionados.length >= 1 ? ` AND t.DESCRIPCION IN (${placeholders})` : ''}
            WHERE SINVSE.MDCMOV = 'S'
            AND SINVSE.MDTMOV = '60'
            AND TRIM(SINVSE.MDDRE7) <> ''
            AND SINVSE.MDCOAR LIKE '%140%'
            AND LOCATE('-', SINVSE.MDDRE7) > 0
            ${fechaInicio !== '' ? `AND SINVSE.MDFECH >= ?` : ''}
            ${fechaFin !== '' ? `AND SINVSE.MDFECH <= ?` : ''}
            AND (
                EXISTS (
                    SELECT 1 FROM ${BD_SCHEMA}.NEU_PADRON NP
                    WHERE TRIM(NP.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, 1, LOCATE('-', SINVSE.MDDRE7) - 1))
                )
                AND
                EXISTS (
                    SELECT 1 FROM ${BD_SCHEMA}.NEU_PADRON NP
                    WHERE TRIM(NP.CODIGO) = TRIM(SUBSTR(SINVSE.MDDRE7, LOCATE('-', SINVSE.MDDRE7) + 1))
                )
            )
            ORDER BY FECHA_SALIDA `;

        const parameters = []
        if (disenos.length >= 1) parameters.push(...disenos)
        if (marcas.length >= 1) parameters.push(...marcas)
        parameters.push(usuario)
        if (talleresSeleccionados.length >= 1) parameters.push(...talleresSeleccionados)
        if (fechaInicio !== '') parameters.push(fechaInicio.replace(/-/g, ''))
        if (fechaFin !== '') parameters.push(fechaFin.replace(/-/g, ''))

        const result = await db.query(sql, parameters);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener getDespachosNeumaticosPorTallerUnico:', error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
}