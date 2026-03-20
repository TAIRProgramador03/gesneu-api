const db = require("../config/db");

const listarNeumaticosDisponibles = async (req, res) => {
  try {

    if (!req.session.user || !req.session.user.usuario) {
      return res.status(401).json({ mensaje: 'No autenticado' });
    }

    const usuario = req.session.user?.usuario;

    let query = `SELECT
                    np.ID AS ID_NEUMATICO,
                    np.CODIGO AS CODIGO,
                    nm.MARCA,
                    np.DISENO AS DISEÑO,
                    ni.REMANENTE_ACTUAL AS REMANENTE,
                    ne.CODIGO_INTERNO AS TIPO_MOVIMIENTO,
                    np.MEDIDA,
                    np.FECHA_FABRICACION_COD,
                    np.FECHA_ENVIO AS FECHA_REGISTRO,
                    ni.PORCENTAJE_VIDA AS ESTADO,
                    CAST(ni.ES_RECUPERADO AS SMALLINT) AS RECUPERADO,
                    (
                      SELECT NM.FECHA_RECUPERADO
                        FROM SPEED400PI.NEU_MOVIMIENTOS NM
                        WHERE NM.ID_NEUMATICO = NP.ID
                        ORDER BY NM.ID DESC
                      FETCH FIRST 1 ROW ONLY
                    ) AS FECHA_RECUPERADO 
                FROM SPEED400PI.NEU_PADRON np
                LEFT JOIN SPEED400PI.NEU_INFORMACION ni
                    ON ni.ID_NEUMATICO = np.ID AND ni.ID_ESTADO = 1
                LEFT JOIN SPEED400AT.NEU_ESTADO ne
                    ON ne.ID_ESTADO = ni.ID_ESTADO
                LEFT JOIN SPEED400AT.NEU_MARCA nm
                    ON nm.ID_MARCA = np.ID_MARCA
                LEFT JOIN SPEED400AT.TPROV prov
                    ON prov.PRORUC = np.ID_PROVEEDOR
                INNER JOIN SPEED400AT.MAE_TALLER_X_USUARIO u
                    ON TRIM(u.CH_CODI_USUARIO) = (?)
                INNER JOIN SPEED400AT.PO_TALLER t
                    ON u.ID_TALLER = t.ID
                    AND t.DESCRIPCION = ni.PROYECTO_ACTUAL`;

    query += ' ORDER BY np.ID DESC';

    const result = await db.query(query, [usuario]);

    if (!Array.isArray(result)) {
      console.error('❌ Error Crítico: El servicio не devolvió un array.', typeof result, result);
      return res.json([]);
    }

    res.json(result);
  } catch (error) {
    console.error("❌ Error al consultar disponibles (NEU_CABECERA):", error);
    res.status(500).json({ error: error.message || "Error al obtener neumáticos disponibles" });
  }
};


module.exports = {
  listarNeumaticosDisponibles,
};
