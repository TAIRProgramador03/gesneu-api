const db = require("../config/db");

// Funciones para formatear fechas y timestamps
function formatDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return new Date(dateStr).toISOString().slice(0, 10);
}
function formatTimestamp(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) return dateStr;
    // Si es un string tipo ISO, convertir a hora local
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    // Obtener componentes de la hora local
    const pad = n => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    const seconds = pad(d.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const neumaticoService = require("../services/neumaticoService");

const crearInspeccion = async (req, res) => {
    const datosArray = Array.isArray(req.body) ? req.body : [req.body];
    const resultados = [];
    const errores = [];

    // Obtenemos el usuario de la sesión o del body si viene
    const usuario = (req.session && req.session.user && req.session.user.usuario) ? req.session.user.usuario : (req.body.USUARIO_SUPER || 'SISTEMA');

    try {

        let placa = ''
        let kilometraje = 0
        let fecha_inspeccion = '2004/05/30'

        for (const datos of datosArray) {
            try {
                // Mapeo de campos del Frontend -> Servicio
                const dataServicio = {
                    CODIGO: datos.CODIGO,
                    REMANENTE: datos.REMANENTE !== undefined && datos.REMANENTE !== null ? parseFloat(datos.REMANENTE) : 0,
                    PRESION: datos.PRESION_AIRE, // Mapeo PRESION_AIRE -> PRESION
                    KILOMETRO: datos.KILOMETRO,
                    OBSERVACION: datos.OBSERVACION,
                    PLACA: datos.PLACA,
                    TORQUE: datos.TORQUE_APLICADO,
                    cod_supervisor: datos.COD_SUPERVISOR,
                    id_operacion: datos.ID_OPERACION,
                    fecha_inspeccion: datos.FECHA_INSPECCION
                };

                placa = datos.PLACA
                kilometraje = datos.KILOMETRO
                fecha_inspeccion = datos.FECHA_INSPECCION

                await neumaticoService.registrarInspeccion(dataServicio, usuario);
                resultados.push({ codigo: datos.CODIGO, status: 'OK' });
            } catch (innerError) {
                console.error(`Error en inspección de ${datos.CODIGO}:`, innerError.message);
                errores.push({ codigo: datos.CODIGO, error: innerError.message });
            }
        }

        if (errores.length > 0 && resultados.length === 0) {
            return res.status(400).json({ error: "Fallaron todas las inspecciones", detalles: errores });
        } else if (errores.length > 0) {
            return res.status(207).json({ mensaje: "Algunas inspecciones fallaron", resultados, errores });
        }

        // falta la fecha se asignación


        const sqlGetVehiLast = `    
            SELECT 
                FECHA_ASIGNACION
            FROM SPEED400PI.NEU_VKILOMETRAJE
            WHERE PLACA = ?
            ORDER BY ID DESC
            FETCH FIRST 1 ROW ONLY
            `;
        const resultVehiLast = await db.query(sqlGetVehiLast, [placa]);
        const lastVehiculo = resultVehiLast[0]

        sqlInsertVehi = `
            INSERT INTO SPEED400PI.NEU_VKILOMETRAJE
                (PLACA, KILOMETRAJE, FECHA_ASIGNACION, FECHA_INSPECCION)
            VALUES (?, ?, ?, ?)`;
        await db.query(sqlInsertVehi, [placa, kilometraje, lastVehiculo.FECHA_ASIGNACION ?? '2004-05-30', fecha_inspeccion]);

        res.status(201).json({ mensaje: "Inspecciones registradas correctamente (Normalizado)", resultados });

    } catch (error) {
        console.error("Error general al insertar inspección:", error);
        res.status(500).json({ error: "Error interno al registrar inspección" });
    }
};

// Consulta si existe una inspección para un neumático y placa en una fecha específica
// REFACTORIZADO: Ahora busca en NEU_DETALLE en lugar de NEU_INSPECCION
const existeInspeccionHoy = async (req, res) => {
    try {
        const { placa, fecha } = req.query;
        if (!placa || !fecha) {
            return res.status(400).json({ error: "Faltan parámetros: placa y fecha son requeridos" });
        }

        const query = `
            SELECT
                FECHA_INSPECCION AS FECHA_REGISTRO,
                FECHA_ASIGNACION
            FROM SPEED400PI.NEU_VKILOMETRAJE
            WHERE PLACA = ?
            AND DATE(FECHA_INSPECCION) = ?
            ORDER BY ID DESC
            FETCH FIRST 1 ROW ONLY`;

        const result = await db.query(query, [placa, fecha]);

        if (result.length > 0) {
            return res.json({ existe: true, fechas: result[0] });
        }
        else {
            const lastQuery = `
                SELECT
                    FECHA_INSPECCION AS FECHA_REGISTRO,
                    FECHA_ASIGNACION
                FROM SPEED400PI.NEU_VKILOMETRAJE
                WHERE PLACA = ?
                ORDER BY ID DESC
                FETCH FIRST 1 ROW ONLY`;

            const lastResult = await db.query(lastQuery, [placa]);
            return res.json({ existe: false, ultima: lastResult[0]?.FECHA_REGISTRO || null });
        }
    } catch (error) {
        console.error("Error al consultar inspección hoy:", error);
        res.status(500).json({ error: "Error al consultar inspección", detalle: error.message });
    }
};

module.exports = {
    crearInspeccion,
    existeInspeccionHoy,
};
