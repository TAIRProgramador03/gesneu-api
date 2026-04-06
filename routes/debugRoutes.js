const express = require('express');
const router = express.Router();
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'
const db = require('../config/db');

router.get('/debug/mis-neumaticos', async (req, res) => {
    try {
        const usuario = req.session?.user?.usuario || 'CCHUMBIMUNI'; // Fallback for testing if session lost
        console.log('DEBUG REQUEST USER:', usuario);

        const sql = `
            SELECT 
                C.CODIGO_CASCO, 
                C.SUPERVISOR_ACTUAL,
                TRIM(C.SUPERVISOR_ACTUAL) as SUP_TRIM,
                C.ID_ESTADO,
                E.CODIGO_INTERNO
            FROM ${BD_SCHEMA}.NEU_CABECERA C
            LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO
            WHERE UPPER(C.SUPERVISOR_ACTUAL) LIKE UPPER(?)
        `;
        const result = await db.query(sql, [usuario.trim() + '%']);

        res.json({
            usuario_buscado: usuario,
            total_encontrados: result.length,
            ejemplos: result.slice(0, 10)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
