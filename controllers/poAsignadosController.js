const db = require("../config/db");

const listarNeumaticosAsignados = async (req, res) => {
    try {
        const { placa } = req.params;

        if (!placa || placa.trim() === "") {
            return res.status(400).json({ error: "La placa es requerida" });
        }

        const placaTrim = placa.trim();

        // CONSULTA NORMALIZADA A NEU_CABECERA
        // Filtramos por PLACA y por estado (usando el catálogo)
        const query = `
            SELECT 
                C.ID_NEUMATICO AS ID,
                TRIM(C.PLACA_ACTUAL) AS PLACA,
                TRIM(C.POSICION_ACTUAL) AS POSICION,
                TRIM(C.POSICION_ACTUAL) AS POSICION_NEU, -- Alias para compatibilidad frontend
                TRIM(C.CODIGO_CASCO) AS CODIGO,
                TRIM(C.CODIGO_CASCO) AS CODIGO_NEU,      -- Alias para compatibilidad frontend
                M.DESCRIPCION AS MARCA,
                C.MEDIDA,
                C.REMANENTE_ACTUAL AS REMANENTE,
                C.REMANENTE_INICIAL AS REMANENTE_ORIGINAL,
                C.PORCENTAJE_VIDA AS ESTADO,       -- Frontend espera numérico para barra de progreso
                E.DESCRIPCION AS TIPO_MOVIMIENTO,  -- Frontend espera texto para etiquetas
                C.FECHA_ULTIMO_SUCESO AS FECHA_ASIGNADO,
                C.FECHA_ULTIMO_SUCESO, -- Agregado para frontend
                C.KM_TOTAL_VIDA,       -- Agregado para frontend
                C.SUPERVISOR_ACTUAL AS USUARIO_ASIGNA,
                C.SUPERVISOR_ACTUAL AS USUARIO_SUPER
            FROM SPEED400AT.NEU_CABECERA C
            LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO
            LEFT JOIN SPEED400AT.PO_MARCA M ON C.ID_MARCA = M.ID
            WHERE C.PLACA_ACTUAL = ? 
              AND (E.CODIGO_INTERNO = 'ASIGNADO' OR (C.POSICION_ACTUAL IS NOT NULL AND C.POSICION_ACTUAL <> ''))
              AND E.CODIGO_INTERNO NOT IN ('BAJA', 'RECUPERADO') -- Doble seguridad
        `;

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
            FROM SPEED400AT.NEU_CABECERA C
            LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO
            LEFT JOIN SPEED400AT.PO_MARCA M ON C.ID_MARCA = M.ID
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
        const sqlGet = `SELECT CODIGO_CASCO, PLACA_ACTUAL, POSICION_ACTUAL, REMANENTE_ACTUAL, SUPERVISOR_ACTUAL FROM SPEED400AT.NEU_CABECERA WHERE ID_NEUMATICO = ?`;
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
            UPDATE SPEED400AT.NEU_CABECERA
            SET ID_ESTADO = (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE'),
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

        // REFACTORIZADO A NEU_DETALLE
        // Buscamos el último movimiento por posición para esta placa
        // Excluyendo Acciones de BAJA (ID diferente según catálogo, pero usaremos CODIGO_INTERNO)
        const query = `
            SELECT 
                D.ID_MOVIMIENTO,
                D.POSICION_NUEVA AS POSICION_NEU, -- Alias frontend
                D.FECHA_SUCESO AS FECHA_MOVIMIENTO,
                A.DESCRIPCION AS TIPO_MOVIMIENTO,  -- "MONTAJE", "ROTACION", etc.
                D.ODOMETRO_VEHICULO AS ODOMETRO,
                D.REMANENTE_MEDIDO AS REMANENTE,
                D.PRESION_MEDIDA AS PRESION,
                D.PLACA,
                D.OBSERVACION
            FROM SPEED400AT.NEU_DETALLE D
            INNER JOIN (
                SELECT POSICION_NUEVA, MAX(FECHA_SUCESO) AS FECHA_MAX
                FROM SPEED400AT.NEU_DETALLE
                WHERE TRIM(PLACA) = ? AND POSICION_NUEVA IS NOT NULL AND POSICION_NUEVA <> ''
                GROUP BY POSICION_NUEVA
            ) ULT ON D.POSICION_NUEVA = ULT.POSICION_NUEVA AND D.FECHA_SUCESO = ULT.FECHA_MAX
            LEFT JOIN SPEED400AT.NEU_ACCION A ON D.ID_ACCION = A.ID_ACCION
            WHERE TRIM(D.PLACA) = ?
              AND (A.CODIGO_INTERNO <> 'BAJA' AND A.CODIGO_INTERNO <> 'RECUPERO')
            ORDER BY D.POSICION_NUEVA
        `;

        const params = [placaTrim, placaTrim];
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
