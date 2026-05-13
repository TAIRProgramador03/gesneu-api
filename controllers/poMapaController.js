const db = require('../config/db');
const neumaticoService = require('../services/neumaticoService');
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

const contarNeumaticos = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        let query = `
            SELECT
                T.ID,
                T.DESCRIPCION AS TALLER,
                T.CH_SERI_TALLER,
                SUM(CASE WHEN ni.ID_ESTADO = 1 THEN 1 ELSE 0 END) AS NEUMATICOS_DISPONIBLES,
                SUM(CASE WHEN ni.ID_ESTADO = 2 THEN 1 ELSE 0 END) AS NEUMATICOS_ASIGNADOS,
                SUM(CASE WHEN ni.ID_ESTADO = 3 THEN 1 ELSE 0 END) AS NEUMATICOS_BAJAS,
                COUNT(np.ID) AS CANTIDAD_NEUMATICOS
            FROM ${BD_SCHEMA}.NEU_PADRON np
            LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION ni
                ON ni.ID_NEUMATICO = np.ID
            LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO ne
                ON ne.ID_ESTADO = ni.ID_ESTADO
            INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                ON TRIM(u.CH_CODI_USUARIO) = ?
            INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                ON u.ID_TALLER = t.ID
                AND t.DESCRIPCION = ni.PROYECTO_ACTUAL
            GROUP BY T.ID, T.DESCRIPCION, T.CH_SERI_TALLER
            ORDER BY CANTIDAD_NEUMATICOS`

        const result = await db.query(query, [usuario]);
        res.json(result);
    } catch (error) {
        console.error('Error al contar neumáticos:', error);
        res.status(500).json({ error: 'Error al contar neumáticos' });
    }
};


// Exportar todo
module.exports = {
    contarNeumaticos,
};