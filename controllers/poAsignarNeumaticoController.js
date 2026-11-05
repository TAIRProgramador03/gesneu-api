const db = require("../config/db");
const colaS60Service = require("../services/colaS60Service");
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'

const asignarNeumatico = async (req, res) => {
    // Validar sesión y usuario autenticado
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: "No autenticado" });

    // Permitir objeto o array
    const data = Array.isArray(req.body) ? req.body : [req.body];
    const UsuarioCrea = req.session.user.usuario.trim().toUpperCase();
    const resultados = [];

    // Cola obligatoria de S60: si hay pendientes, solo se puede trabajar la
    // placa de la cabeza. Sin pendientes no bloquea nada.
    const placaAsignacion = data[0]?.Placa ?? null;
    if (placaAsignacion) {
        const bloqueo = await colaS60Service.bloquearSiPlacaNoHabilitada(req.session.user, placaAsignacion);
        if (bloqueo) return res.status(bloqueo.status).json(bloqueo.body);
    }

    let odometroKV = 0
    let placaKV = ''
    let fechaDeAsignacionKV = ''

    for (const [i, item] of data.entries()) {
        const {
            CodigoNeumatico,
            Remanente,
            PresionAire,
            TorqueAplicado,
            Placa,
            Posicion,
            Odometro,
            FechaAsignacion,
            ID_OPERACION,
            COD_SUPERVISOR,
            EnTransito,
            Taller
        } = item;

        odometroKV = Odometro;
        placaKV = Placa;
        fechaDeAsignacionKV = FechaAsignacion;

        // Validación básica.
        //
        // El mensaje nombra los campos que faltan. Antes decía sólo "faltan campos
        // obligatorios (incluya FechaRegistro...)" — un campo que ni siquiera existe en
        // el payload — y no había forma de saber cuál era sin leer este código. Dos de
        // ellos (ID_OPERACION y COD_SUPERVISOR) no los escribe el usuario: salen de la
        // operación del vehículo, así que si vienen vacíos no hay nada que corregir en
        // el formulario y el técnico se queda trabado sin entender por qué.
        const faltantes = [];
        if (!CodigoNeumatico) faltantes.push('CodigoNeumatico');
        if (!Remanente) faltantes.push('Remanente');
        if (!PresionAire) faltantes.push('PresionAire');
        if (!Placa) faltantes.push('Placa');
        if (!Posicion) faltantes.push('Posicion');
        // El repuesto va con torque 0: sólo se rechaza si no vino ningún valor.
        if (TorqueAplicado === null || TorqueAplicado === undefined) faltantes.push('TorqueAplicado');
        if (!Odometro) faltantes.push('Odometro');
        if (!FechaAsignacion) faltantes.push('FechaAsignacion');
        if (!ID_OPERACION) faltantes.push('ID_OPERACION (operación del vehículo)');
        if (!COD_SUPERVISOR) faltantes.push('COD_SUPERVISOR (supervisor de la operación)');
        if (!Taller) faltantes.push('Taller');

        if (faltantes.length > 0) {
            resultados.push({
                index: i,
                error: `Faltan campos obligatorios en la posición ${Posicion || '(sin posición)'}: ${faltantes.join(', ')}.`
            });
            continue;
        }
        if (!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(FechaAsignacion)) {
            resultados.push({
                index: i,
                error: "El campo FechaAsignacion debe tener formato YYYY-MM-DD."
            });
            continue;
        }
        try {
            // Validar que la fecha de asignación no sea anterior a la fecha de registro del neumático
            const sqlFechaRegistro =
                `SELECT FECHA_ENVIO AS FECHA_REGISTRO
                    FROM ${BD_SCHEMA}.NEU_PADRON
                WHERE CODIGO = ?`;
            const resultFecha = await db.query(sqlFechaRegistro, [CodigoNeumatico]);

            if (resultFecha && resultFecha.length > 0) {
                const fechaRegistroNeumatico = resultFecha[0].FECHA_REGISTRO; // Fecha cuando se inserto al sistema

                if (fechaRegistroNeumatico && FechaAsignacion < fechaRegistroNeumatico) {
                    resultados.push({
                        index: i,
                        error: `La fecha de asignación (${FechaAsignacion}) no puede ser anterior a la fecha de registro del neumático (${fechaRegistroNeumatico}).`
                    });
                    continue;
                }
            }

            const neumaticoService = require("../services/neumaticoService");
            await neumaticoService.asignarNeumatico(item, UsuarioCrea);

            resultados.push({ index: i, mensaje: "Neumático asignado correctamente (Normalizado)." });

        } catch (error) {
            const errorMsg = error.message;
            if (errorMsg.includes("ya se encuentra asignado")) {
                resultados.push({
                    index: i,
                    error: "El neumático ya está asignado a otro vehículo o posición.",
                    detalle: errorMsg
                });
            } else {
                resultados.push({
                    index: i,
                    error: "Error al asignar neumático.",
                    detalle: errorMsg
                });
            }
        }
    }

    const fallidos = resultados.filter((r) => r.error);
    const exitosos = resultados.length - fallidos.length;

    // El kilometraje sólo se registra si de verdad se montó algo.
    //
    // Antes se insertaba siempre, incluso cuando las N asignaciones habían fallado:
    // quedaba una lectura de odómetro en NEU_VKILOMETRAJE sin ningún movimiento ni
    // neumático actualizado detrás. Caso real reportado el 2026-11-02.
    if (exitosos > 0) {
        const sqlVKilometraje = `
                INSERT INTO ${BD_SCHEMA}.NEU_VKILOMETRAJE
                (PLACA, KILOMETRAJE, FECHA_ASIGNACION)
                    VALUES
                (?, ?, ?)`;

        await db.query(sqlVKilometraje, [
            placaKV, odometroKV, fechaDeAsignacionKV
        ]);
    }

    // Si solo era un objeto, mantener respuesta simple
    if (!Array.isArray(req.body)) {
        const r = resultados[0];
        if (r.error) {
            return res.status(400).json(r);
        }
        return res.status(200).json(r);
    }

    // Si NINGUNA asignación salió, es un fallo, no un éxito parcial: devolver 400 para
    // que el front lo trate como error. Con 207 el navegador lo daba por bueno y el
    // usuario veía "asignado correctamente" sin que se hubiera grabado nada.
    if (exitosos === 0) {
        return res.status(400).json({
            error: 'No se pudo asignar ningún neumático.',
            detalle: fallidos.map((r) => r.detalle || r.error).join(' | '),
            resultados,
        });
    }

    // Éxito parcial: algunas sí, otras no.
    res.status(207).json({ resultados });
};

module.exports = { asignarNeumatico };
