class PoSupervisores {
    constructor(row) {
        this.ID = row.ID;
        this.CODPLA = row.CODPLA;
        this.APE = row.APE;
        this.NOM = row.NOM;
        this.SITUACION = row.SITUACION;
        this.EMAIL = row.EMAIL;
    }
}

module.exports = PoSupervisores;
