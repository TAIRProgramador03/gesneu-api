const db = require("../config/db");

// Función utilitaria para formatear fechas (YYYY-MM-DD)
function formatDate(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr === 'string' && dateStr.length >= 10) {
        return dateStr.slice(0, 10);
    }
    return null;
}
// Función utilitaria para formatear timestamps (YYYY-MM-DD HH:MM:SS)
function formatTimestamp(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateStr)) {
        return dateStr.replace('T', ' ').substring(0, 19);
    }
    return dateStr;
}

const registrarReubicacionNeumatico = async (req, res) => {
    try {
        const neumaticoService = require("../services/neumaticoService");
        const db = require("../config/db");
        const datosArray = Array.isArray(req.body) ? req.body : [req.body];

        // Log de usuario si está disponible en sesión (para pasar al servicio)
        const usuario = req.session.user?.usuario || 'SISTEMA';

        // VALIDACIÓN GLOBAL: Verificar que después de TODAS las reubicaciones, 
        // ninguna posición quede vacía
        if (datosArray.length > 0) {
            // NOTA: La validación de posiciones vacías se hace en el controlador ANTES del loop
            // para validar el estado final después de TODAS las reubicaciones
            const placa = datosArray[0].PLACA; // Todas las reubicaciones son del mismo vehículo

            // 1. Obtener posiciones actuales del vehículo
            const sqlPosicionesActuales = `
                SELECT POSICION_ACTUAL, COUNT(*) as TOTAL
                FROM SPEED400AT.NEU_CABECERA
                WHERE PLACA_ACTUAL = ?
                  AND POSICION_ACTUAL IS NOT NULL
                  AND POSICION_ACTUAL != ''
                  AND ID_ESTADO IN (
                      SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO 
                      WHERE CODIGO_INTERNO = 'ASIGNADO'
                  )
                GROUP BY POSICION_ACTUAL
            `;
            const resPosiciones = await db.query(sqlPosicionesActuales, [placa]);

            // Crear mapa de posiciones con sus contadores
            const contadoresPosiciones = new Map();
            resPosiciones.forEach(row => {
                contadoresPosiciones.set(row.POSICION_ACTUAL, row.TOTAL);
            });

            // 2. Simular las reubicaciones para ver el estado final
            datosArray.forEach(datos => {
                const posInicial = datos.POSICION_INICIAL;
                const posFinal = datos.POSICION_FIN;

                if (posInicial && posFinal && posInicial !== posFinal) {
                    // Decrementar contador de posición inicial
                    const countInicial = contadoresPosiciones.get(posInicial) || 0;
                    contadoresPosiciones.set(posInicial, countInicial - 1);

                    // Incrementar contador de posición final
                    const countFinal = contadoresPosiciones.get(posFinal) || 0;
                    contadoresPosiciones.set(posFinal, countFinal + 1);
                }
            });

            // 3. Verificar que ninguna posición quede con 0 neumáticos
            const posicionesRequeridas = ['POS01', 'POS02', 'POS03', 'POS04', 'RES01'];
            const posicionesVacias = [];

            posicionesRequeridas.forEach(pos => {
                const count = contadoresPosiciones.get(pos) || 0;
                if (count <= 0) {
                    posicionesVacias.push(pos);
                }
            });

            if (posicionesVacias.length > 0) {
                throw new Error(
                    `No se puede guardar: las posiciones ${posicionesVacias.join(', ')} quedarían vacías. ` +
                    `Asigna neumáticos a estas posiciones antes de guardar.`
                );
            }
        }

        // Si pasa la validación, procesar las reubicaciones
        for (const datos of datosArray) {
            try {
                await neumaticoService.reubicarNeumatico({
                    CODIGO: datos.CODIGO,
                    PLACA: datos.PLACA,
                    POSICION_FIN: datos.POSICION_FIN,
                    POSICION_INICIAL: datos.POSICION_INICIAL || null,
                    REMANENTE: datos.REMANENTE,
                    PRESION_AIRE: datos.PRESION_AIRE,
                    KILOMETRO: datos.KILOMETRO,
                    OBSERVACION: datos.OBSERVACION
                }, usuario);
            } catch (e) {
                console.error('Error reubicando neumático:', e);
                throw e; // Interrumpe el loop y va al catch general
            }
        }
        res.status(201).json({ mensaje: `Reubicación de ${datosArray.length} neumático(s) registrada correctamente (Normalizado)` });
    } catch (error) {
        console.error('❌ Error general en reubicación:', error);
        res.status(500).json({ error: "Error al registrar la reubicación", detalle: error.message });
    }
};

const registrarDesasignacionNeumatico = async (req, res) => {
    try {
        const neumaticoService = require("../services/neumaticoService");
        const db = require("../config/db");
        const datosArray = Array.isArray(req.body) ? req.body : [req.body];
        const usuario = req.session.user?.usuario || 'SISTEMA';

        // VALIDACIÓN GLOBAL: Verificar que después de TODAS las desasignaciones,
        // ninguna posición quede vacía
        if (datosArray.length > 0) {
            // Obtener la placa del primer neumático (asumimos que todos son del mismo vehículo)
            const sqlGetPlaca = `
                SELECT PLACA_ACTUAL 
                FROM SPEED400AT.NEU_CABECERA 
                WHERE CODIGO_CASCO = ?
            `;
            const resPlaca = await db.query(sqlGetPlaca, [datosArray[0].CODIGO]);
            const placa = resPlaca[0]?.PLACA_ACTUAL;

            if (placa) {
                // 1. Obtener posiciones actuales del vehículo
                const sqlPosicionesActuales = `
                    SELECT POSICION_ACTUAL, COUNT(*) as TOTAL
                    FROM SPEED400AT.NEU_CABECERA
                    WHERE PLACA_ACTUAL = ?
                      AND POSICION_ACTUAL IS NOT NULL
                      AND POSICION_ACTUAL != ''
                      AND ID_ESTADO IN (
                          SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO 
                          WHERE CODIGO_INTERNO = 'ASIGNADO'
                      )
                    GROUP BY POSICION_ACTUAL
                `;
                const resPosiciones = await db.query(sqlPosicionesActuales, [placa]);

                // Crear mapa de posiciones con sus contadores
                const contadoresPosiciones = new Map();
                resPosiciones.forEach(row => {
                    contadoresPosiciones.set(row.POSICION_ACTUAL, row.TOTAL);
                });

                // 2. Simular las desasignaciones (decrementar contadores)
                for (const datos of datosArray) {
                    // Obtener posición del neumático a desasignar
                    const sqlGetPosicion = `
                        SELECT POSICION_ACTUAL 
                        FROM SPEED400AT.NEU_CABECERA 
                        WHERE CODIGO_CASCO = ?
                    `;
                    const resPosicion = await db.query(sqlGetPosicion, [datos.CODIGO]);
                    const posicion = resPosicion[0]?.POSICION_ACTUAL;

                    if (posicion) {
                        const count = contadoresPosiciones.get(posicion) || 0;
                        contadoresPosiciones.set(posicion, count - 1);
                    }
                }

                // 3. Verificar que ninguna posición quede con 0 neumáticos
                const posicionesRequeridas = ['POS01', 'POS02', 'POS03', 'POS04', 'RES01'];
                const posicionesVacias = [];

                posicionesRequeridas.forEach(pos => {
                    const count = contadoresPosiciones.get(pos) || 0;
                    if (count <= 0) {
                        posicionesVacias.push(pos);
                    }
                });

                if (posicionesVacias.length > 0) {
                    throw new Error(
                        `No se puede guardar: las posiciones ${posicionesVacias.join(', ')} quedarían vacías. ` +
                        `Asigna neumáticos a estas posiciones antes de guardar.`
                    );
                }
            }
        }

        // Si pasa la validación, procesar las desasignaciones
        for (const datos of datosArray) {
            try {
                if (!['BAJA DEFINITIVA', 'RECUPERADO'].includes(datos.TIPO_MOVIMIENTO)) {
                    return res.status(400).json({ error: 'TIPO_MOVIMIENTO inválido. Debe ser BAJA DEFINITIVA o RECUPERADO.' });
                }

                await neumaticoService.desasignarNeumatico({
                    CODIGO: datos.CODIGO,
                    TIPO_MOVIMIENTO: datos.TIPO_MOVIMIENTO,
                    OBSERVACION: datos.OBSERVACION,
                    KILOMETRO: datos.KILOMETRO,
                    REMANENTE: datos.REMANENTE
                }, usuario);
            } catch (e) {
                console.error('Error desasignando neumático:', e);
                throw e;
            }
        }
        res.status(201).json({ mensaje: `Desasignación de ${datosArray.length} neumático(s) registrada correctamente (Normalizado)` });
    } catch (error) {
        console.error('❌ Error general en desasignación:', error);
        res.status(500).json({ error: 'Error al registrar la desasignación', detalle: error.message });
    }
};

// Obtener la última fecha de inspección para un neumático y placa
const getUltimaFechaInspeccion = async (req, res) => {
    try {
        const { codigo, placa } = req.query;
        if (!codigo || !placa) {
            return res.status(400).json({ error: "Faltan parámetros: codigo y placa son requeridos" });
        }
        // REFACTORIZADO: Busca en NEU_DETALLE
        const query = `
            SELECT FECHA_SUCESO AS FECHA_REGISTRO
            FROM SPEED400AT.NEU_DETALLE
            WHERE CODIGO_CASCO = ? AND PLACA = ?
              AND UPPER(TIPO_ACCION) = 'INSPECCION'
            ORDER BY FECHA_SUCESO DESC
            FETCH FIRST 1 ROW ONLY
        `;
        const result = await db.query(query, [codigo, placa]);
        res.json({ ultima: result[0]?.FECHA_REGISTRO || null });
    } catch (error) {
        console.error("Error al consultar ultima inspeccion:", error);
        res.status(500).json({ error: "Error al consultar la última fecha de inspección", detalle: error.message });
    }
};

// Obtener la última fecha de inspección solo por placa
const getUltimaFechaInspeccionPorPlaca = async (req, res) => {
    try {
        const { placa } = req.query;
        if (!placa) {
            return res.status(400).json({ error: "Falta el parámetro: placa es requerido" });
        }
        // REFACTORIZADO: Busca en NEU_DETALLE (Consulta simplificada para DB2)
        const query = `
            SELECT FECHA_SUCESO AS FECHA_REGISTRO
            FROM SPEED400AT.NEU_DETALLE
            WHERE PLACA = ?
              AND TIPO_ACCION LIKE '%INSPECCION%'
            ORDER BY FECHA_SUCESO DESC
            FETCH FIRST 1 ROW ONLY
        `;
        const result = await db.query(query, [placa]);
        res.json({ ultima: result[0]?.FECHA_REGISTRO || null });
    } catch (error) {
        console.error("Error al consultar ultima inspeccion por placa:", error);
        res.status(500).json({ error: "Error al consultar la última fecha de inspección por placa", detalle: error.message });
    }
};

/**
 * Desasignar neumáticos CON asignación de reemplazos (Transacción)
 * Recibe: { desasignaciones: [...], asignaciones: [...] }
 * Ejecuta asignaciones PRIMERO, luego desasignaciones
 */
const desasignarConReemplazo = async (req, res) => {
    try {
        const neumaticoService = require("../services/neumaticoService");
        const db = require("../config/db");
        const { desasignaciones, asignaciones } = req.body;
        const usuario = req.session.user?.usuario || 'SISTEMA';

        // Validar que se reciban ambos arrays
        if (!Array.isArray(desasignaciones) || !Array.isArray(asignaciones)) {
            return res.status(400).json({
                error: 'Se requieren arrays de desasignaciones y asignaciones'
            });
        }

        // VALIDACIÓN GLOBAL: Verificar que después de TODO, ninguna posición quede vacía
        if (desasignaciones.length > 0) {
            const sqlGetPlaca = `
                SELECT PLACA_ACTUAL 
                FROM SPEED400AT.NEU_CABECERA 
                WHERE CODIGO_CASCO = ?
            `;
            const resPlaca = await db.query(sqlGetPlaca, [desasignaciones[0].CODIGO]);
            const placa = resPlaca[0]?.PLACA_ACTUAL;

            if (placa) {
                // Obtener posiciones actuales
                const sqlPosicionesActuales = `
                    SELECT POSICION_ACTUAL, COUNT(*) as TOTAL
                    FROM SPEED400AT.NEU_CABECERA
                    WHERE PLACA_ACTUAL = ?
                      AND POSICION_ACTUAL IS NOT NULL
                      AND POSICION_ACTUAL != ''
                      AND ID_ESTADO IN (
                          SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO 
                          WHERE CODIGO_INTERNO = 'ASIGNADO'
                      )
                    GROUP BY POSICION_ACTUAL
                `;
                const resPosiciones = await db.query(sqlPosicionesActuales, [placa]);

                const contadoresPosiciones = new Map();
                resPosiciones.forEach(row => {
                    contadoresPosiciones.set(row.POSICION_ACTUAL, row.TOTAL);
                });

                // Simular asignaciones (incrementar)
                asignaciones.forEach(asig => {
                    const count = contadoresPosiciones.get(asig.Posicion) || 0;
                    contadoresPosiciones.set(asig.Posicion, count + 1);
                });

                // Simular desasignaciones (decrementar)
                for (const datos of desasignaciones) {
                    const sqlGetPosicion = `
                        SELECT POSICION_ACTUAL 
                        FROM SPEED400AT.NEU_CABECERA 
                        WHERE CODIGO_CASCO = ?
                    `;
                    const resPosicion = await db.query(sqlGetPosicion, [datos.CODIGO]);
                    const posicion = resPosicion[0]?.POSICION_ACTUAL;

                    if (posicion) {
                        const count = contadoresPosiciones.get(posicion) || 0;
                        contadoresPosiciones.set(posicion, count - 1);
                    }
                }

                // Verificar que ninguna posición quede vacía
                const posicionesRequeridas = ['POS01', 'POS02', 'POS03', 'POS04', 'RES01'];
                const posicionesVacias = [];

                posicionesRequeridas.forEach(pos => {
                    const count = contadoresPosiciones.get(pos) || 0;
                    if (count <= 0) {
                        posicionesVacias.push(pos);
                    }
                });

                if (posicionesVacias.length > 0) {
                    throw new Error(
                        `No se puede guardar: las posiciones ${posicionesVacias.join(', ')} quedarían vacías. ` +
                        `Asigna neumáticos a estas posiciones antes de guardar.`
                    );
                }
            }
        }

        // PASO 1: Ejecutar ASIGNACIONES primero
        for (const asignacion of asignaciones) {
            await neumaticoService.asignarNeumatico(asignacion, usuario);
        }

        // PASO 2: Ejecutar DESASIGNACIONES después
        for (const desasignacion of desasignaciones) {
            if (!['BAJA DEFINITIVA', 'RECUPERADO'].includes(desasignacion.TIPO_MOVIMIENTO)) {
                throw new Error('TIPO_MOVIMIENTO inválido. Debe ser BAJA DEFINITIVA o RECUPERADO.');
            }

            await neumaticoService.desasignarNeumatico({
                CODIGO: desasignacion.CODIGO,
                TIPO_MOVIMIENTO: desasignacion.TIPO_MOVIMIENTO,
                OBSERVACION: desasignacion.OBSERVACION,
                KILOMETRO: desasignacion.KILOMETRO,
                REMANENTE: desasignacion.REMANENTE
            }, usuario);
        }

        res.status(201).json({
            mensaje: `Operación completada: ${asignaciones.length} asignación(es) y ${desasignaciones.length} desasignación(es) registradas correctamente`
        });
    } catch (error) {
        console.error('❌ Error en desasignación con reemplazo:', error);
        res.status(500).json({
            error: 'Error al registrar la operación',
            detalle: error.message
        });
    }
};

module.exports = {
    registrarReubicacionNeumatico,
    registrarDesasignacionNeumatico,
    desasignarConReemplazo,
    getUltimaFechaInspeccion,
    getUltimaFechaInspeccionPorPlaca
};
