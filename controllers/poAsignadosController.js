const db = require("../config/db");
require('dotenv').config();

const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

const listarNeumaticosAsignados = async (req, res) => {
    try {
        const { placa } = req.params;

        if (!placa || placa.trim() === "") {
            return res.status(400).json({ error: "La placa es requerida" });
        }

        const placaTrim = placa.trim();

        let query = `
            SELECT
                np."ID" AS ID,
                np.FECHA_ENVIO AS FECHA_REGISTRO,
                ni.PLACA_ACTUAL AS PLACA,
                ni.POSICION_ACTUAL AS POSICION_NEU,
                np.CODIGO AS CODIGO_NEU,
                nm.MARCA AS MARCA,
                np.MEDIDA,
                ni.REMANENTE_ACTUAL AS REMANENTE,
                np.REMANENTE_INICIAL AS REMANENTE_ORIGINAL,
                ni.PORCENTAJE_VIDA AS ESTADO,
                ne.DESCRIPCION AS TIPO_MOVIMIENTO,
                CAST(ni.ES_RECUPERADO AS SMALLINT) AS RECUPERADO,
                (SELECT NM.FECHA_ASIGNACION
                    FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
                    WHERE NI.PLACA_ACTUAL = NM.PLACA AND NM.ID_ACCION = 2 AND np.ID = NM.ID_NEUMATICO
                    ORDER BY NM.ID ASC
                    FETCH FIRST 1 ROW ONLY  
                ) AS FECHA_ASIGNACION,
                DATE(np.FECHA_REGISTRO) AS FECHA_ULTIMO_SUCESO,
                (SELECT COALESCE(SUM(nmo.KM_RECORRIDOS_ETAPA), 0)
                    FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS nmo
                    WHERE nmo.ID_NEUMATICO = np."ID"
                    AND nmo.PLACA = ni.PLACA_ACTUAL
                ) AS KM_TOTAL_VIDA,
                (SELECT VK.KILOMETRAJE
                    FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                    WHERE VK.PLACA = ni.PLACA_ACTUAL
                    ORDER BY VK.ID DESC
                    FETCH FIRST 1 ROW ONLY
                ) AS ODOMETRO,
                ni.PRESION_ACTUAL AS PRESION_AIRE,
                ni.TORQUE_ACTUAL AS TORQUE_APLICADO
            FROM ${BD_SCHEMA}.NEU_PADRON np
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA nm
                ON nm.ID_MARCA = np.ID_MARCA
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION ni
                ON ni.ID_NEUMATICO = np."ID"
            INNER JOIN ${BD_SCHEMA}.NEU_ESTADO ne
                ON ne.ID_ESTADO = ni.ID_ESTADO
            WHERE ni.PLACA_ACTUAL = ? AND ni.ID_ESTADO = 2 ORDER BY ni.POSICION_ACTUAL`;

        const result = await db.query(query, [placaTrim]);

        // Normalización de respuesta (Array)
        let data = result;
        if (result && typeof result === 'object') {
            if (Array.isArray(result)) {
                data = result;
            } else if (Array.isArray(result.rows)) {
                data = result.rows;
            } else if (Array.isArray(result.recordset)) {
                data = result.recordset;
            } else {
                data = [result];
            }
        }

        res.json(data);
    } catch (error) {
        console.error("❌ Error al consultar asignados (NEU_CABECERA):", error);
        res.status(500).json({ error: error.message || "Error al obtener neumáticos asignados" });
    }
};

const listarNeumaticosAsignadosPorCodigo = async (req, res) => {
    try {
        const { codigo } = req.params;

        if (!codigo || codigo.trim() === "") {
            return res.status(400).json({ error: "El código del neumático es requerido" });
        }

        const codigoTrim = codigo.trim();

        // CONSULTA NORMALIZADA POR CÓDIGO
        const query = `
            SELECT 
                C.ID_NEUMATICO AS ID,
                C.PLACA_ACTUAL AS PLACA,
                C.POSICION_ACTUAL AS POSICION,
                C.CODIGO_CASCO AS CODIGO,
                M.DESCRIPCION AS MARCA,
                C.MEDIDA,
                C.REMANENTE_ACTUAL AS REMANENTE,
                E.DESCRIPCION AS ESTADO, -- Aquí sí devolvemos texto si es por código especifico? No, mantengamos consistencia.
                C.FECHA_ULTIMO_SUCESO AS FECHA_ASIGNADO,
                C.SUPERVISOR_ACTUAL AS USUARIO_ASIGNA
            FROM ${BD_SCHEMA}.NEU_CABECERA C
            LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO
            LEFT JOIN ${BD_SCHEMA}.PO_MARCA M ON C.ID_MARCA = M.ID
            WHERE C.CODIGO_CASCO = ?
        `;

        const result = await db.query(query, [codigoTrim]);

        let data = result;
        if (result && typeof result === 'object') {
            if (Array.isArray(result)) data = result;
            else if (Array.isArray(result.rows)) data = result.rows;
            else if (Array.isArray(result.recordset)) data = result.recordset;
            else data = [result];
        }
        res.json(data);
    } catch (error) {
        console.error("❌ Error al consultar por código (NEU_CABECERA):", error);
        res.status(500).json({ error: error.message || "Error al obtener neumáticos asignados por código" });
    }
};

const eliminarAsignacion = async (req, res) => {
    // Lógica de "Desasignación / Desmontaje / Corrección"
    // Libera el neumático (a DISPONIBLE) y registra historial (DESMONTAJE)
    const { id } = req.params; // ID_NEUMATICO

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: 'ID inválido' });
    }

    try {
        const neumaticoService = require("../services/neumaticoService"); // Importar servicio

        // 1. Obtener datos actuales antes de limpiar (para el historial)
        const sqlGet = `SELECT CODIGO_CASCO, PLACA_ACTUAL, POSICION_ACTUAL, REMANENTE_ACTUAL, SUPERVISOR_ACTUAL FROM ${BD_SCHEMA}.NEU_CABECERA WHERE ID_NEUMATICO = ?`;
        const resultGet = await db.query(sqlGet, [id]);

        if (!resultGet || resultGet.length === 0) {
            return res.status(404).json({ error: 'Neumático no encontrado' });
        }
        const neu = resultGet[0];
        const usuario = req.session?.user?.usuario || neu.SUPERVISOR_ACTUAL || 'SISTEMA';

        // 2. Registrar Movimiento de "DESMONTAJE" (Traceability)
        // Usamos 'DESMONTAJE' como acción, resultando en estado 'DISPONIBLE'
        await neumaticoService.registrarMovimiento({
            idNeumatico: id,
            codigo: neu.CODIGO_CASCO,
            tipoAccion: 'DESMONTAJE', // Si no existe en catálogo, usará fallback o error. Asegurarse que existe 'DESMONTAJE' en 009.sql
            estadoDestino: 'DISPONIBLE',
            placa: neu.PLACA_ACTUAL,
            posicionAnterior: neu.POSICION_ACTUAL,
            remanente: neu.REMANENTE_ACTUAL,
            observacion: 'Desasignación manual (Corrección/Desmontaje)',
            usuario
        });

        // 3. Actualizar Cabecera a DISPONIBLE
        const queryUpdate = `
            UPDATE ${BD_SCHEMA}.NEU_CABECERA
            SET ID_ESTADO = (SELECT ID_ESTADO FROM ${BD_SCHEMA}.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE'),
                PLACA_ACTUAL = NULL, POSICION_ACTUAL = NULL, ID_VEHICULO_ACTUAL = NULL,
                FECHA_ULTIMO_SUCESO = CURRENT_TIMESTAMP
            WHERE ID_NEUMATICO = ?
        `;
        await db.query(queryUpdate, [id]);

        res.json({ mensaje: 'Asignación eliminada (Neumático desmontado y puesto en Disponibles)' });
    } catch (error) {
        console.error('Error al eliminar asignación:', error);
        res.status(500).json({ error: 'Error al eliminar asignación: ' + error.message });
    }
};

const listaUltimoMovPlaca = async (req, res) => {
    try {
        const { placa } = req.params;
        if (!placa || placa.trim() === "") {
            return res.status(400).json({ error: "La placa es requerida" });
        }
        const placaTrim = placa.trim();

        const query = `
            WITH ULTIMO_MOV AS (
            SELECT
                NM.ID_NEUMATICO,
                NM.PLACA,
                NM.ODOMETRO_VEHICULO,
                NA.DESCRIPCION,
                ROW_NUMBER() OVER (
                    PARTITION BY NM.ID_NEUMATICO, NM.PLACA
                    ORDER BY NM."ID"  DESC
                ) AS RN
            FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
            LEFT JOIN ${BD_SCHEMA}.NEU_ACCION NA
                ON NA.ID_ACCION = NM.ID_ACCION
            )
            SELECT
                NI.ID_NEUMATICO,
                NI.POSICION_ACTUAL AS POSICION_NEU,
                NI.FECHA_ULTIMA_ACTUALIZACION AS FECHA_MOVIMIENTO,
                NI.REMANENTE_ACTUAL AS REMANENTE,
                NI.PRESION_ACTUAL AS PRESION,
                NI.PLACA_ACTUAL,
                UM.ODOMETRO_VEHICULO,
                UM.DESCRIPCION
            FROM ${BD_SCHEMA}.NEU_INFORMACION NI
            INNER JOIN ${BD_SCHEMA}.NEU_PADRON NP
                ON NI.ID_NEUMATICO = NP."ID"
            INNER JOIN ULTIMO_MOV UM
                ON UM.ID_NEUMATICO = NI.ID_NEUMATICO
                AND UM.PLACA = NI.PLACA_ACTUAL
                AND UM.RN = 1
            WHERE NI.PLACA_ACTUAL = ?
            AND NI.ID_ESTADO = 2
            ORDER BY NI.POSICION_ACTUAL`

        const params = [placaTrim];
        const result = await db.query(query, params);

        // Normalización respuesta
        let data = result;
        if (result && typeof result === 'object') {
            if (Array.isArray(result)) data = result;
            else if (Array.isArray(result.rows)) data = result.rows;
            else if (Array.isArray(result.recordset)) data = result.recordset;
            else data = [result];
        }
        res.json(data);
    } catch (error) {
        console.error("Error al obtener últimos movimientos por placa (NEU_DETALLE):", error);
        res.status(500).json({ error: "Error al obtener últimos movimientos por placa" });
    }
};

module.exports = {
    listarNeumaticosAsignados,
    listarNeumaticosAsignadosPorCodigo,
    eliminarAsignacion,
    listaUltimoMovPlaca,
};
