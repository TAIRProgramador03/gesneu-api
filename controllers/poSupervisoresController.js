const db = require('../config/db');
const PoSupervisores = require('../models/PoSupervisor');

exports.getSupervisores = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM SPEED400AT.PO_SUPERVISORES");
        const supervisores = result.map(row => new PoSupervisores(row));
        res.json(supervisores);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al consultar PO_SUPERVISORES' });
    }
};
