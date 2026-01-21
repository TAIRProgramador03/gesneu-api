const db = require('../config/db'); 

const PoNeumatico = {
    getAll: async () => {
        const sql = 'SELECT * FROM S210092W.PO_NEUMATICO';
        return db.query(sql);
    }
};

module.exports = PoNeumatico;
