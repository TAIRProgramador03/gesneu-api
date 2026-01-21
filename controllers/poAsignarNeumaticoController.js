const db = require("../config/db");

const asignarNeumatico = async (req, res) => {
    // Validar sesión y usuario autenticado
    if (!req.session.user || !req.session.user.usuario) {
        return res.status(401).json({ mensaje: "No autenticado" });
    }
    // Permitir objeto o array
    const data = Array.isArray(req.body) ? req.body : [req.body];
    const UsuarioCrea = req.session.user.usuario.trim().toUpperCase();
    const resultados = [];
    for (const [i, item] of data.entries()) {
        const {
            CodigoNeumatico,
            Remanente,
            PresionAire,
            TorqueAplicado,
            Placa,
            Posicion,
            Odometro,
            FechaRegistro
        } = item;
        // Validación básica
        if (!CodigoNeumatico || !Remanente || !PresionAire || !TorqueAplicado || !Placa || !Posicion || !Odometro || !FechaRegistro) {
            resultados.push({
                index: i,
                error: "Faltan campos obligatorios (incluya FechaRegistro en formato YYYY-MM-DD)."
            });
            continue;
        }
        if (!/^[\d]{4}-[\d]{2}-[\d]{2}$/.test(FechaRegistro)) {
            resultados.push({
                index: i,
                error: "El campo FechaRegistro debe tener formato YYYY-MM-DD."
            });
            continue;
        }
        try {
            // Validar que la fecha de asignación no sea anterior a la fecha de registro del neumático
            const sqlFechaRegistro = `
                SELECT FECHA_REGISTRO
                FROM SPEED400AT.NEU_CABECERA 
                WHERE CODIGO_CASCO = ?
            `;
            const resultFecha = await db.query(sqlFechaRegistro, [CodigoNeumatico]);

            if (resultFecha && resultFecha.length > 0) {
                const fechaRegistroNeumatico = resultFecha[0].FECHA_REGISTRO;

                if (fechaRegistroNeumatico && FechaRegistro < fechaRegistroNeumatico) {
                    resultados.push({
                        index: i,
                        error: `La fecha de asignación (${FechaRegistro}) no puede ser anterior a la fecha de registro del neumático (${fechaRegistroNeumatico}).`
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
    // Si solo era un objeto, mantener respuesta simple
    if (!Array.isArray(req.body)) {
        const r = resultados[0];
        if (r.error) {
            return res.status(400).json(r);
        }
        return res.status(200).json(r);
    }
    // Si era array, devolver todos los resultados
    res.status(207).json({ resultados });
};

module.exports = { asignarNeumatico };
