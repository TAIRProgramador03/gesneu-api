const db = require("../config/db");
const xlsx = require("xlsx");

const cargarPadronDesdeExcel = async (req, res) => {
    try {

        const bufferExcel = req.file?.buffer;
        if (!bufferExcel) {
            return res.status(400).json({ error: 'No se recibió ningún archivo.' });
        }

        const workbook = xlsx.read(bufferExcel, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        if (data.length === 0) {
            return res.status(400).json({ error: "El archivo Excel está vacío." });
        }

        const encabezados = Object.keys(data[0]);

        function limpiarEncabezado(str) {
            return str.toUpperCase().replace(/\s+/g, ' ').replace(/\n/g, ' ').trim();
        }

        // Mapeo dinámico de columnas tolerante a espacios y saltos de línea
        const columnas = {
            CODIGO: encabezados.find(col => limpiarEncabezado(col).includes("CODIGO")),
            MARCA: encabezados.find(col => limpiarEncabezado(col).includes("MARCA")),
            MEDIDA: encabezados.find(col => limpiarEncabezado(col).includes("MEDIDA")),
            DISENO: encabezados.find(col => limpiarEncabezado(col).includes("DISEÑO") || limpiarEncabezado(col).includes("DISENO")),
            REMANENTE: encabezados.find(col => limpiarEncabezado(col).includes("REMANENTE")),
            PR: encabezados.find(col => limpiarEncabezado(col).includes("PR")),
            CARGA: encabezados.find(col => limpiarEncabezado(col).includes("CARGA")),
            VELOCIDAD: encabezados.find(col => limpiarEncabezado(col).includes("VELOCIDAD")),
            FECHA_FABRICACION_COD: encabezados.find(col => limpiarEncabezado(col).includes("FECHA FABRICACION") || limpiarEncabezado(col).includes("FECHA FABRICACIÓN")),
            RQ: encabezados.find(col => limpiarEncabezado(col).includes("RQ")),
            OC: encabezados.find(col => limpiarEncabezado(col).includes("N° OC")),
            PROYECTO: encabezados.find(col => limpiarEncabezado(col).includes("PROYECTO")),
            COSTO: encabezados.find(col => limpiarEncabezado(col).includes("COSTO")),
            PROVEEDOR: encabezados.find(col => limpiarEncabezado(col).includes("PROVEEDOR")),
            FECHA_COMPRA: encabezados.find(col => limpiarEncabezado(col).includes("FECHA COMPRA")),
        };

        if (Object.values(columnas).every(col => !col)) return res.status(400).json({ error: "El archivo Excel no contiene ninguna columna reconocida." });

        let insertados = 0;
        let errores = [];

        for (const fila of data) {

            let erroresFila = [];

            let codigo = columnas.CODIGO ? (fila[columnas.CODIGO] || '').toString().trim() : null;
            if (codigo) {
                const existe = await db.query('SELECT 1 FROM SPEED400PI.NEU_PADRON WHERE CODIGO = ?', [codigo]);
                if (existe && existe.length > 0) {
                    erroresFila.push('Código duplicado: ya existe en la base de datos.');
                }
            } else erroresFila.push('Código no especificado.');

            let marca = columnas.MARCA ? (fila[columnas.MARCA] || '').trim() : null;
            if (marca) {
                const existeMarca = await db.query('SELECT 1 FROM SPEED400AT.NEU_MARCA WHERE UPPER(MARCA) = ?', [marca.toUpperCase()]);
                if (!existeMarca || existeMarca.length === 0) {
                    erroresFila.push(`Marca inválida o mal escrita: '${marca}'.`);
                }
            } else erroresFila.push('Marca no especificada.');

            let medida = columnas.MEDIDA ? (fila[columnas.MEDIDA] || '').trim().substring(0, 20) : null;
            if (medida) {
                const existeMedida = await db.query('SELECT 1 FROM SPEED400AT.NEU_MEDIDA WHERE MEDIDA = ?', [medida]);
                if (!existeMedida || existeMedida.length === 0) {
                    erroresFila.push(`Medida inválida o mal escrita: '${medida}'.`);
                }
            } else erroresFila.push('Medida no especificada.');

            let diseno = columnas.DISENO ? (fila[columnas.DISENO] || '').trim() : null;
            if (diseno) {
                const existeDiseno = await db.query('SELECT 1 FROM SPEED400AT.NEU_DISENO WHERE DISENO = ?', [diseno]);
                if (!existeDiseno || existeDiseno.length === 0) {
                    erroresFila.push(`Diseño inválido o mal escrito: '${diseno}'.`);
                }
            } else erroresFila.push('Diseño no especificado.');

            let rucProveedor = null;
            let proveedorCodigo = columnas.PROVEEDOR ? (fila[columnas.PROVEEDOR] || '').trim() : null;
            if (proveedorCodigo) {
                const resProveedor = await db.query('SELECT PRONOM, PRORUC FROM SPEED400AT.TPROV WHERE PROCVE = ?', [proveedorCodigo]);
                if (resProveedor && resProveedor.length > 0) {
                    rucProveedor = resProveedor[0].PRORUC;
                } else {
                    erroresFila.push(`Proveedor no encontrado para código: '${proveedorCodigo}'.`);
                }
            } else erroresFila.push('Proveedor no especificado.');

            if (erroresFila.length > 0) {
                errores.push({ fila: codigo || '', mensaje: erroresFila.join(' ') });
                continue;
            }

            try {

                let idMarca = null;
                if (marca) {
                    const resMarca = await db.query('SELECT ID_MARCA FROM SPEED400AT.NEU_MARCA WHERE UPPER(MARCA) = ?', [marca.toUpperCase()]);
                    if (resMarca && resMarca.length > 0) idMarca = resMarca[0].ID_MARCA;
                }
                let idMedida = null;
                if (medida) {
                    const resMedida = await db.query('SELECT ID_MEDIDA FROM SPEED400AT.NEU_MEDIDA WHERE MEDIDA = ?', [medida]);
                    if (resMedida && resMedida.length > 0) idMedida = resMedida[0].ID_MEDIDA;
                }
                let idDiseno = null;
                if (diseno) {
                    const resDiseno = await db.query('SELECT ID_DISENO FROM SPEED400AT.NEU_DISENO WHERE DISENO = ?', [diseno]);
                    if (resDiseno && resDiseno.length > 0) idDiseno = resDiseno[0].ID_DISENO;
                }

                const filaLimpia = {
                    CODIGO: columnas.CODIGO ? (fila[columnas.CODIGO] || '').toString().trim() : null,
                    MARCA: columnas.MARCA ? (fila[columnas.MARCA] || '').trim() : null,
                    MEDIDA: columnas.MEDIDA ? (fila[columnas.MEDIDA] || '').trim().substring(0, 20) : null,
                    DISENO: columnas.DISENO ? (fila[columnas.DISENO] || '').trim() : null,
                    REMANENTE_INICIAL: columnas.REMANENTE ? (parseFloat(fila[columnas.REMANENTE]) || 0) : null,
                    PR: columnas.PR ? parseInt((fila[columnas.PR] || 0).toString().trim()) : null,
                    CARGA: columnas.CARGA ? parseInt((fila[columnas.CARGA] || 0).toString().trim()) : null,
                    VELOCIDAD: columnas.VELOCIDAD ? (fila[columnas.VELOCIDAD] || '-').trim() : null,
                    FECHA_FABRICACION_COD: columnas.FECHA_FABRICACION_COD ? (fila[columnas.FECHA_FABRICACION_COD] || '').toString().trim().substring(0, 4) : null,
                    RQ: columnas.RQ ? (fila[columnas.RQ] || '').toString().trim().substring(0, 10) : null,
                    OC: columnas.OC ? (fila[columnas.OC] || '').toString().trim().substring(0, 10) : null,
                    PROYECTO: columnas.PROYECTO ? (fila[columnas.PROYECTO] || '').trim().substring(0, 100) : null,
                    COSTO_INICIAL: columnas.COSTO ? (parseFloat(fila[columnas.COSTO]) || 0) : null,
                    ID_PROVEEDOR: rucProveedor,
                    FECHA_COMPRA: columnas.FECHA_COMPRA && fila[columnas.FECHA_COMPRA]
                        ? (() => {
                            const valor = fila[columnas.FECHA_COMPRA];
                            if (typeof valor === 'number') {
                                const fecha = new Date(Date.UTC(1899, 11, 30) + valor * 86400000);
                                return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
                            }
                            if (typeof valor === 'string') {
                                const v = valor.trim();
                                if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
                                    const [dia, mes, anio] = v.split('/');
                                    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
                                }
                                const d = new Date(v);
                                return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                            }
                            return null;
                        })()
                        : null,
                    ID_MARCA: idMarca,
                };

                // INSERT - NEUMATICO

                const query = `INSERT INTO SPEED400PI.NEU_PADRON (CODIGO, ID_MARCA, MEDIDA, DISENO, PR, CARGA, VELOCIDAD, FECHA_FABRICACION_COD, REMANENTE_INICIAL, FECHA_COMPRA, COSTO_INICIAL, ID_PROVEEDOR, RQ, OC, PROYECTO) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                const params = [
                    filaLimpia.CODIGO, filaLimpia.ID_MARCA, filaLimpia.MEDIDA, filaLimpia.DISENO,
                    filaLimpia.PR, filaLimpia.CARGA, filaLimpia.VELOCIDAD, filaLimpia.FECHA_FABRICACION_COD, filaLimpia.REMANENTE_INICIAL,
                    filaLimpia.FECHA_COMPRA, filaLimpia.COSTO_INICIAL, filaLimpia.ID_PROVEEDOR,
                    filaLimpia.RQ, filaLimpia.OC, filaLimpia.PROYECTO
                ];

                await db.query(query, params);

                const resultId = await db.query(
                    'SELECT ID FROM SPEED400PI.NEU_PADRON WHERE CODIGO = ?',
                    [filaLimpia.CODIGO]
                );

                const idNeumatico = resultId && resultId.length > 0 ? resultId[0].ID : null;
                if (!idNeumatico) throw new Error('No se pudo obtener el ID del neumático insertado');

                // INSERT - INFORMACIÓN DEL NEUMATICO

                const queryInformation = `INSERT INTO SPEED400PI.NEU_INFORMACION (ID_NEUMATICO, ID_ESTADO, PLACA_ACTUAL, POSICION_ACTUAL, PROYECTO_ACTUAL, REMANENTE_ACTUAL, PRESION_ACTUAL, TORQUE_ACTUAL, PORCENTAJE_VIDA, ODOMETRO_AL_MONTAR, KM_TOTAL_VIDA) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                const paramsInformation = [
                    idNeumatico,
                    1,
                    null,
                    null,
                    filaLimpia.PROYECTO,
                    filaLimpia.REMANENTE_INICIAL,
                    0,
                    0,
                    100,
                    0,
                    0
                ]

                await db.query(queryInformation, paramsInformation);

                insertados++;
            } catch (error) {
                errores.push({ fila: codigo || '', mensaje: error.message || "Error desconocido" });
            }
        }

        let mensajeFinal = insertados === data.length
            ? "Padrón actualizado correctamente. Todos los registros fueron insertados."
            : insertados === 0
                ? "Carga no realizada. Todos los registros tienen errores."
                : `Carga parcial: ${insertados} insertados de ${data.length} registros.`;

        return res.status(200).json({ mensaje: mensajeFinal, total: data.length, insertados, errores });
    } catch (err) {
        console.error("Error general:", err);
        res.status(500).json({ error: "Error al procesar el padrón", detalle: err.message });
    }
};

module.exports = { cargarPadronDesdeExcel };
