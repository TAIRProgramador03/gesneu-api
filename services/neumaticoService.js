const db = require('../config/db');
require('dotenv').config();
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT'
/**
 * Service Layer for Neumáticos Normalizados
 * Maneja la lógica de negocio y la traducción entre el Frontend (Texto) y el Backend Normalizado (IDs)
 */
const neumaticoService = {

    /**
     * Busca el ID de una marca por su nombre.
     * @param {string} nombreMarca 
     * @returns {Promise<number|null>} ID de la marca o null si no existe
     */
    obtenerIdMarca: async (nombreMarca) => {
        if (!nombreMarca) return null;
        const nombre = nombreMarca.trim().toUpperCase();
        // Updated to use NEU_MARCA table
        const sql = `SELECT ID_MARCA FROM ${BD_SCHEMA}.NEU_MARCA WHERE UPPER(TRIM(MARCA)) = ?`;
        const result = await db.query(sql, [nombre]);
        return (result && result.length > 0) ? result[0].ID_MARCA : null;
    },

    /**
     * Obtiene todos los neumáticos con formato compatible para el frontend
     */
    obtenerTodos: async (filtroSupervisor = null) => {
        let sql = `
                SELECT
                    np.ID AS ID_NEUMATICO,
                    np.CODIGO AS CODIGO,
                    nm.MARCA,
                    np.MEDIDA,
                    np.DISENO AS DISEÑO,
                    np.PR,
                    np.CARGA,
                    np.VELOCIDAD,
                    np.FECHA_FABRICACION_COD AS FECHA_FABRICACION_COD,
                    np.LEASING,
                    np.RQ,
                    np.OC,
                    TRIM(ni.PROYECTO_ACTUAL) AS PROYECTO,
                    np.COSTO_INICIAL AS COSTO,
                    TRIM(prov.PRONOM) AS PROVEEDOR,
                    np.FECHA_COMPRA,
                    np.FECHA_REGISTRO,
                    CAST(ni.ES_RECUPERADO AS SMALLINT) AS RECUPERADO,
                    ni.PORCENTAJE_VIDA AS ESTADO,
                    ni.ID_ESTADO AS ESTADO_ACTUAL,
                    ne.CODIGO_INTERNO AS TIPO_MOVIMIENTO,
                    TRIM(ni.PLACA_ACTUAL) AS PLACA,
                    ni.POSICION_ACTUAL AS POSICION_NEU,

                    ni.REMANENTE_ACTUAL AS REMANENTE,
                    ni.PRESION_ACTUAL AS PRESION_AIRE,
                    ni.TORQUE_ACTUAL,
                    ni.KM_TOTAL_VIDA AS KILOMETRO

                FROM ${BD_SCHEMA}.NEU_PADRON np
                LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION ni
                    ON ni.ID_NEUMATICO = np.ID
                LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO ne
                    ON ne.ID_ESTADO = ni.ID_ESTADO
                LEFT JOIN ${BD_SCHEMA}.NEU_MARCA nm
                    ON nm.ID_MARCA = np.ID_MARCA
                LEFT JOIN ${BD_SCHEMA}.TPROV prov
                    ON prov.PRORUC = np.ID_PROVEEDOR
                INNER JOIN ${BD_SCHEMA}.MAE_TALLER_X_USUARIO u
                    ON TRIM(u.CH_CODI_USUARIO) = (?)
                INNER JOIN ${BD_SCHEMA}.PO_TALLER t
                    ON u.ID_TALLER = t.ID
                    AND t.DESCRIPCION = ni.PROYECTO_ACTUAL`;

        const params = [];
        if (filtroSupervisor) {
            params.push(filtroSupervisor.trim());
        }
        sql += ' ORDER BY np.CODIGO ASC';
        return db.query(sql, params);
    },

    /**
     * Crea o Actualiza un neumático en la tabla normalizada
     * @param {Object} data Datos del neumático recibidos del frontend
     * @param {string} usuario Usuario que realiza la acción
     */
    guardarNeumatico: async (data, usuario) => {
        const {
            CODIGO, MARCA, MEDIDA, DISEÑO, REMANENTE,
            PR, CARGA, VELOCIDAD, DOT, FECHA_COMPRA,
            COSTO, PROVEEDOR
        } = data;

        // 1. Obtener ID de Marca
        const idMarca = await neumaticoService.obtenerIdMarca(MARCA);

        // 2. Verificar si existe
        const existeSql = `SELECT ID_NEUMATICO FROM ${BD_SCHEMA}.NEU_CABECERA WHERE CODIGO_CASCO = ?`;
        const existeResult = await db.query(existeSql, [CODIGO]);

        let idNeumatico;

        if (existeResult && existeResult.length > 0) {
            // UPDATES logic here if needed
            idNeumatico = existeResult[0].ID_NEUMATICO;
            // TODO: Implementar Update si es necesario actualizar ficha técnica
        } else {
            // INSERT
            const insertSql = `
                INSERT INTO ${BD_SCHEMA}.NEU_CABECERA (
                    CODIGO_CASCO, ID_MARCA, MEDIDA, DISEÑO, REMANENTE_INICIAL,
                    REMANENTE_ACTUAL, PROVEEDOR_NOMBRE, COSTO_INICIAL,
                    INDICE_CARGA, INDICE_VELOCIDAD, DOT_FABRICACION, FECHA_COMPRA,
                    RQ, OC, PROYECTO, SUPERVISOR_ACTUAL,
                    ID_ESTADO
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT ID_ESTADO FROM ${BD_SCHEMA}.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE'))
            `;
            // Nota: db.query con ODBC a veces no devuelve el ID generado. 
            // Si es así, hay que hacer un select posterior.
            await db.query(insertSql, [
                CODIGO, idMarca, MEDIDA, DISEÑO, REMANENTE,
                REMANENTE, PROVEEDOR, COSTO,
                CARGA || null, VELOCIDAD || null, DOT || null, FECHA_COMPRA || null,
                data.RQ || null, data.OC || null, data.PROYECTO || null, data.USUARIO_SUPER || null
            ]);

            const nuevoResult = await db.query(existeSql, [CODIGO]);
            idNeumatico = nuevoResult[0].ID_NEUMATICO;

            // Registrar movimiento inicial
            await neumaticoService.registrarMovimiento({
                idNeumatico,
                codigo: CODIGO,
                tipoAccion: 'INGRESO',
                estadoDestino: 'DISPONIBLE', // <--- Estado resultante
                observacion: 'Ingreso inicial al sistema',
                usuario
            });
        }
        return idNeumatico;
    },

    /**
     * Registra un movimiento en el detalle
     */
    registrarMovimiento: async ({
        idNeumatico, codigo, tipoAccion, idVehiculo = '', placa, proyecto,
        posicionAnterior, posicionNueva, odometro, remanente,
        presion, torque, observacion, usuario, ID_OPERACION,
        COD_SUPERVISOR,
        estadoDestino,
        kmRecorrido = 0,
        FechaAsignacion = null,
        kmVida = 0,
        fecha_inspeccion = null,
        nuevoPorcentaje = 0,
        fecha_mantenimiento = null,
        tipoBaja = null
    }) => {

        const sqlEstado = `SELECT ID_ESTADO FROM ${BD_SCHEMA}.NEU_ESTADO WHERE CODIGO_INTERNO = ?`;
        const resEstado = await db.query(sqlEstado, [estadoDestino || 'DISPONIBLE']);
        const idEstadoResolved = (resEstado && resEstado.length > 0) ? resEstado[0].ID_ESTADO : null;

        const sqlAccion = `SELECT ID_ACCION FROM ${BD_SCHEMA}.NEU_ACCION WHERE CODIGO_INTERNO = ?`;
        const resAccion = await db.query(sqlAccion, [tipoAccion]);
        const idAccionResolved = (resAccion && resAccion.length > 0) ? resAccion[0].ID_ACCION : null;

        if (!idAccionResolved) {
            console.error(`[neumaticoService] Critico: No se encontro accion '${tipoAccion}' en catalogo.`);
        }

        const sql = `
            INSERT INTO ${BD_SCHEMA}.NEU_MOVIMIENTOS (
                ID_NEUMATICO, ID_VEHICULO,
                PLACA, PROYECTO, POSICION_ANTERIOR, POSICION_NUEVA, ODOMETRO_VEHICULO,
                REMANENTE_MEDIDO, PRESION_MEDIDA, TORQUE_APLICADO, OBS, USUARIO_REGISTRADOR,
                ID_ESTADO, ID_ACCION,
                ID_OPERACION,
                COD_SUPERVISOR, 
                KM_RECORRIDOS_ETAPA,
                FECHA_ASIGNACION,
                FECHA_INSPECCION,
                PORCENTAJE_VIDA,
                FECHA_RECUPERADO,
                TIPO_BAJA
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            idNeumatico, idVehiculo || null,
            placa || null, proyecto, posicionAnterior || null, posicionNueva || null, odometro || 0,
            remanente || 0, presion || 0, torque || 0, observacion || '', usuario || 'SISTEMA',
            idEstadoResolved,
            idAccionResolved,
            ID_OPERACION,
            COD_SUPERVISOR,
            kmRecorrido,
            FechaAsignacion || null,
            fecha_inspeccion || null,
            nuevoPorcentaje || 0,
            fecha_mantenimiento,
            tipoBaja
        ];
        return await db.query(sql, params);
    },

    /**
     * Asignar un neumático a un vehículo (Montaje)
     */
    asignarNeumatico: async (data, usuario) => {
        const {
            CodigoNeumatico, Remanente, PresionAire, TorqueAplicado,
            Placa, Posicion, Odometro, ID_OPERACION, COD_SUPERVISOR, FechaAsignacion
        } = data;

        // Validar que PresionAire sea obligatorio
        if (!PresionAire) throw new Error('La presión de aire es obligatoria para asignar un neumático');

        // 1. Obtener ID y ESTADO ACTUAL
        const sqlGetId = `
                    SELECT
                        NP.ID AS ID_NEUMATICO,
                        NE.CODIGO_INTERNO as ESTADO_CODIGO,
                        NI.PROYECTO_ACTUAL,
                        NI.KM_TOTAL_VIDA,
                        (SELECT NM.REMANENTE_MEDIDO
                        FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
                        WHERE NM.ID_ACCION = 2 AND NM.ID_NEUMATICO = NP.ID
                        ORDER BY NM.ID
                        FETCH FIRST 1 ROW ONLY
                        ) AS REMANENTE_INICIAL
                    FROM ${BD_SCHEMA}.NEU_PADRON NP
                    INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                        ON NI.ID_NEUMATICO = NP."ID"
                    LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO NE
                        ON NE.ID_ESTADO = NI.ID_ESTADO
                    WHERE NP.CODIGO = ?`;

        const resultId = await db.query(sqlGetId, [CodigoNeumatico]);

        if (!resultId || resultId.length === 0) {
            throw new Error(`Neumático ${CodigoNeumatico} no encontrado en NEU_CABECERA`);
        }
        const neumatico = resultId[0];
        const idNeumatico = neumatico.ID_NEUMATICO;
        const proyectoActual = neumatico.PROYECTO_ACTUAL
        const remanenteInicial = neumatico.REMANENTE_INICIAL
        // const kmTotalVida = Number(neumatico.KM_TOTAL_VIDA)
        // const kmTotalSumVida = kmTotalVida + KmRecorridoxEtapa


        // TODO:
        // * verificar si tiene algún movimiento (cualquiera de asignación) usar ese remanente
        // * si no tiene movimientos, usar el remanente de base (se intuye que es nueva asignación)

        const porcentajeRemantene = Math.round(((Remanente * 100) / (!remanenteInicial ? Remanente : remanenteInicial)))

        // VALIDACIÓN: Si el estado es ASIGNADO no permitir asignar
        if (neumatico.ESTADO_CODIGO === 'ASIGNADO') {
            throw new Error(`El neumático ${CodigoNeumatico} ya se encuentra asignado (Estado: ${neumatico.ESTADO_CODIGO}).Por favor, realice una inspección o desasignación primero.`);
        }

        // 2. Actualizar Cabecera (Estado y Ubicacion)
        const sqlUpdate = `
            UPDATE ${BD_SCHEMA}.NEU_INFORMACION
            SET
                ID_ESTADO = 2,
                PLACA_ACTUAL = ?,
                POSICION_ACTUAL = ?,
                PRESION_ACTUAL = ?,
                REMANENTE_ACTUAL = ?,
                TORQUE_ACTUAL = ?,
                PORCENTAJE_VIDA = ?,
                ODOMETRO_AL_MONTAR = ?,
                FECHA_ULTIMA_ACTUALIZACION = CURRENT_TIMESTAMP,
                FECHA_ULTIMA_ASIGNACION = ?
            WHERE ID_NEUMATICO = ?`;

        await db.query(sqlUpdate, [
            Placa, Posicion, PresionAire, Remanente, TorqueAplicado, porcentajeRemantene, Odometro, FechaAsignacion, idNeumatico
        ]);

        // 3. Registrar Historial
        await neumaticoService.registrarMovimiento({
            idNeumatico,
            codigo: CodigoNeumatico,
            tipoAccion: 'MONTAJE',
            estadoDestino: 'ASIGNADO', // <--- Estado resultante
            placa: Placa,
            proyecto: proyectoActual,
            posicionNueva: Posicion,
            odometro: Odometro,
            remanente: Remanente,
            presion: PresionAire,
            torque: TorqueAplicado,
            usuario,
            ID_OPERACION,
            COD_SUPERVISOR,
            FechaAsignacion,
            nuevoPorcentaje: porcentajeRemantene
        });

        return { message: 'Asignación Correcta (Normalizada)' };
    },

    /**
     * Reubicar un neumático (Rotación o Movimiento)
     */
    reubicarNeumatico: async (data, usuario) => {
        const {
            CODIGO, PLACA, POSICION_FIN, POSICION_INICIAL,
            REMANENTE, PRESION_AIRE, KILOMETRO, OBSERVACION, ID_OPERACION, COD_SUPERVISOR
        } = data;

        const sqlInsp = `
            SELECT
                FECHA_INSPECCION as FECHA_SUCESO
            FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE
            WHERE PLACA = ?
            ORDER BY ID DESC
            FETCH FIRST 1 ROW ONLY`;

        const resInsp = await db.query(sqlInsp, [PLACA]);

        // Calcular diferencia de días
        let dias = 999;
        const rawFecha = resInsp && resInsp.length > 0 ? resInsp[0].FECHA_SUCESO : null;
        if (rawFecha) {
            const fechaInsp = new Date(rawFecha);
            if (!isNaN(fechaInsp)) {
                const hoy = new Date();
                fechaInsp.setHours(0, 0, 0, 0);
                hoy.setHours(0, 0, 0, 0);
                const diffTime = Math.abs(hoy - fechaInsp);
                dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        if (dias > 4) {
            const ultimaFecha = resInsp && resInsp[0] ? new Date(resInsp[0].FECHA_SUCESO).toLocaleDateString() : 'Nunca';
            throw new Error(`REGLA DE NEGOCIO: No se puede reubicar neumáticos del vehículo ${PLACA} sin una inspección reciente (Máx 4 días). Última: ${ultimaFecha}`);
        }

        // 1. Obtener ID y Datos Actuales
        const sqlGetId = `
            SELECT
                NP."ID" AS ID_NEUMATICO,
                NI.REMANENTE_ACTUAL as REMANENTE_MEDIDO,
                NI.PRESION_ACTUAL as PRESION_MEDIDA,
                (
                    SELECT KILOMETRAJE
                    FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE
                    WHERE PLACA = ?
                    ORDER BY ID DESC
                    FETCH FIRST 1 ROW ONLY
                ) AS ODOMETRO_VEHICULO,
                NI.PROYECTO_ACTUAL AS PROYECTO,
                NI.TORQUE_ACTUAL,
                NI.PORCENTAJE_VIDA
            FROM ${BD_SCHEMA}.NEU_PADRON NP
            LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NI.ID_NEUMATICO = NP.ID
                AND NI.PLACA_ACTUAL = ?
            WHERE NP.CODIGO = ?`;

        // FALTA, ODOMETRO, 

        const resultId = await db.query(sqlGetId, [PLACA, PLACA, CODIGO]);
        if (!resultId || resultId.length === 0) throw new Error(`Neumático ${CODIGO} no encontrado`);
        const ultimoRegistro = resultId[0];

        const idNeumatico = ultimoRegistro.ID_NEUMATICO;

        // Heredar valores si no se proporcionan nuevos

        const odometroFinal = ultimoRegistro.ODOMETRO_VEHICULO || KILOMETRO || 0;
        const presionFinal = ultimoRegistro.PRESION_MEDIDA || PRESION_AIRE || 0;
        const remanenteFinal = ultimoRegistro.REMANENTE_MEDIDO || REMANENTE || 0;
        const torqueFinal = ultimoRegistro.TORQUE_ACTUAL || 0
        const porcentajeVidaFinal = ultimoRegistro.PORCENTAJE_VIDA || 0
        const kmRecorridoFinal = 0;

        // NOTA: La validación de posiciones vacías se hace en el controlador ANTES del loop
        // para validar el estado final después de TODAS las reubicaciones
        // 2. Actualizar Cabecera
        // TODO: ACTUALIZAR EL NI_INFORMACION

        const sqlUpdate = `
            UPDATE ${BD_SCHEMA}.NEU_INFORMACION 
                SET
                    POSICION_ACTUAL = ?,
                    FECHA_ULTIMA_ACTUALIZACION = CURRENT_TIMESTAMP
            WHERE ID_NEUMATICO = ?`;
        await db.query(sqlUpdate, [POSICION_FIN, idNeumatico]);
        await neumaticoService.registrarMovimiento({
            idNeumatico,
            codigo: CODIGO,
            tipoAccion: 'ROTACION',
            estadoDestino: 'ASIGNADO', // <--- Sigue asignado
            placa: PLACA,
            proyecto: ultimoRegistro.PROYECTO,
            posicionAnterior: POSICION_INICIAL,
            posicionNueva: POSICION_FIN,
            odometro: odometroFinal,
            remanente: remanenteFinal,
            presion: presionFinal,
            observacion: OBSERVACION || 'Reubicación realizada',
            usuario,
            kmRecorrido: kmRecorridoFinal, // <--- Heredar KM recorridos
            ID_OPERACION,
            COD_SUPERVISOR,
            nuevoPorcentaje: porcentajeVidaFinal,
            torque: torqueFinal,
            fecha_mantenimiento: resInsp[0].FECHA_SUCESO
        });
    },

    /**
     * Desasignar Neumático (Baja o Recupero)
     */
    desasignarNeumatico: async (data, usuario) => {
        const {
            CODIGO, TIPO_MOVIMIENTO, OBSERVACION, KILOMETRO, REMANENTE, COD_SUPERVISOR, ID_OPERACION, TIPO_BAJA
        } = data;

        const nuevoEstado = (TIPO_MOVIMIENTO === 'BAJA DEFINITIVA') ? 'BAJA' : 'RECUPERADO';

        const sqlGetNeumatico = `
        SELECT
            NI.ID_NEUMATICO,
            NI.PLACA_ACTUAL,
            NI.POSICION_ACTUAL,
            NI.PROYECTO_ACTUAL,
            (SELECT VK.FECHA_INSPECCION
                FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                WHERE VK.PLACA = NI.PLACA_ACTUAL
                ORDER BY VK.ID DESC
                FETCH FIRST 1 ROW ONLY
            ) AS ULTIMA_INSPECCION,
            (SELECT VK.KILOMETRAJE
                FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                WHERE VK.PLACA = NI.PLACA_ACTUAL
                ORDER BY VK.ID DESC
                FETCH FIRST 1 ROW ONLY
            ) AS ODOMETRO_VEHICULO,
            NI.PRESION_ACTUAL AS PRESION_MEDIDA,
            NI.TORQUE_ACTUAL AS TORQUE_APLICADO,
            NI.REMANENTE_ACTUAL AS REMANENTE_MEDIDO,
            NI.KM_TOTAL_VIDA AS KM_RECORRIDOS_ETAPA,
            NI.PORCENTAJE_VIDA
            FROM ${BD_SCHEMA}.NEU_INFORMACION NI
        LEFT JOIN ${BD_SCHEMA}.NEU_PADRON NP
            ON NP."ID" = NI.ID_NEUMATICO
        WHERE NP.CODIGO = ?`;

        const resultNeumatico = await db.query(sqlGetNeumatico, [CODIGO]);
        if (!resultNeumatico || resultNeumatico.length === 0) {
            throw new Error(`Neumático ${CODIGO} no encontrado`);
        }

        const posicionActual = resultNeumatico[0].POSICION_ACTUAL;
        const idNeumatico = resultNeumatico[0].ID_NEUMATICO;
        const placaActual = resultNeumatico[0].PLACA_ACTUAL;
        const ODOMETRO_VEHICULO = resultNeumatico[0].ODOMETRO_VEHICULO;
        const REMANENTE_MEDIDO = resultNeumatico[0].REMANENTE_MEDIDO;
        const PROYECTO_ACTUAL = resultNeumatico[0].PROYECTO_ACTUAL;
        const PORCENTAJE_VIDA = resultNeumatico[0].PORCENTAJE_VIDA;
        const PRESION_MEDIDA = resultNeumatico[0].PRESION_MEDIDA;
        const TORQUE_APLICADO = resultNeumatico[0].TORQUE_APLICADO;
        const ULTIMA_INSPECCION = resultNeumatico[0].ULTIMA_INSPECCION;

        // Heredar valores si no se proporcionan nuevos
        const odometroFinal = ODOMETRO_VEHICULO || null;
        const remanenteFinal = REMANENTE_MEDIDO || null;
        const kmRecorridoFinal = 0;

        // 4. Actualizar Cabecera (Liberar vehículo)

        let sqlUpdate = '';

        if (TIPO_MOVIMIENTO === "RECUPERADO") {
            sqlUpdate = `
                UPDATE ${BD_SCHEMA}.NEU_INFORMACION SET
                    ID_ESTADO = 1,
                    PLACA_ACTUAL = NULL,
                    POSICION_ACTUAL = NULL,
                    ES_RECUPERADO = TRUE,
                    QTY_RECUPERADO = QTY_RECUPERADO + 1,
                    FECHA_ULTIMA_ACTUALIZACION = CURRENT_TIMESTAMP
                WHERE ID_NEUMATICO = ?`;
        } else {
            sqlUpdate = `
                UPDATE ${BD_SCHEMA}.NEU_INFORMACION SET
                    ID_ESTADO = (SELECT ID_ESTADO FROM ${BD_SCHEMA}.NEU_ESTADO WHERE CODIGO_INTERNO = ?),
                    PLACA_ACTUAL = NULL,
                    POSICION_ACTUAL = NULL,
                    FECHA_ULTIMA_ACTUALIZACION = CURRENT_TIMESTAMP
                WHERE ID_NEUMATICO = ?`;
        }

        if (TIPO_MOVIMIENTO === "RECUPERADO") await db.query(sqlUpdate, [idNeumatico]);
        else await db.query(sqlUpdate, [nuevoEstado, idNeumatico]);

        // 5. Registrar Historial con Código Normalizado
        let accionCodigo;
        if (TIPO_MOVIMIENTO === 'RECUPERADO' || TIPO_MOVIMIENTO === 'RECUPERO') {
            accionCodigo = 'RECUPERO';
        } else if (TIPO_MOVIMIENTO === 'BAJA DEFINITIVA' || TIPO_MOVIMIENTO === 'BAJA') {
            accionCodigo = 'BAJA';
        }

        await neumaticoService.registrarMovimiento({
            idNeumatico,
            codigo: CODIGO,
            tipoAccion: accionCodigo,
            tipoBaja: TIPO_BAJA,
            estadoDestino: nuevoEstado,
            placa: placaActual,
            posicionAnterior: posicionActual,
            posicionNueva: null,
            odometro: odometroFinal,
            presion: PRESION_MEDIDA,
            remanente: remanenteFinal,
            observacion: OBSERVACION,
            usuario,
            kmRecorrido: kmRecorridoFinal,
            COD_SUPERVISOR,
            ID_OPERACION,
            nuevoPorcentaje: PORCENTAJE_VIDA,
            proyecto: PROYECTO_ACTUAL,
            torque: TORQUE_APLICADO,
            fecha_mantenimiento: ULTIMA_INSPECCION
        });
    },

    /**
     * Registrar Inspección (Medición de Presión, Remanente, Kilometraje)
     */
    registrarInspeccion: async (data, usuario) => {
        const {
            CODIGO, REMANENTE, PRESION, KILOMETRO, OBSERVACION, PLACA, TORQUE, cod_supervisor, id_operacion, fecha_inspeccion
        } = data;

        // TODO:
        // * Traer el primer remanente de los neu_movimientos -> no importa si son de la misma placa, solo que sea de la misma

        const sqlGet = `
            SELECT
                NP.ID AS ID_NEUMATICO,
                (SELECT NM.REMANENTE_MEDIDO
                FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
                WHERE NM.ID_ACCION = 2 AND NM.ID_NEUMATICO = NP.ID
                ORDER BY NM.ID ASC
                FETCH FIRST 1 ROW ONLY
                ) AS REMANENTE_INICIAL,
                NI.REMANENTE_ACTUAL,
                NI.PLACA_ACTUAL,
                NI.POSICION_ACTUAL,
                NI.KM_TOTAL_VIDA,
                NE.CODIGO_INTERNO AS ESTADO_CODIGO,
                (SELECT VK.KILOMETRAJE
                FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                WHERE VK.PLACA = NI.PLACA_ACTUAL
                ORDER BY VK.ID DESC
                FETCH FIRST 1 ROW ONLY
                ) AS ODOMETRO_AL_MONTAR,
                NI.PROYECTO_ACTUAL
            FROM ${BD_SCHEMA}.NEU_PADRON NP
            LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO
            LEFT JOIN ${BD_SCHEMA}.NEU_ESTADO NE
                ON NI.ID_ESTADO = NE.ID_ESTADO
            WHERE NP.CODIGO = ? AND NI.PLACA_ACTUAL = ?`;

        const result = await db.query(sqlGet, [CODIGO, PLACA]);

        // console.log(`[registrarInspeccion] Resultado Búsqueda Cabecera: ${result ? result.length : 0} registros.`);

        if (!result || result.length === 0) {
            console.error(`[registrarInspeccion] Error: Neumático ${CODIGO} no encontrado en BD.`);
            throw new Error(`Neumático ${CODIGO} no encontrado.`);
        }
        const neumatico = result[0];

        // VALIDACIONES CRÍTICAS (Replicando lógica legacy)
        // A) Validar Remanente (No puede crecer. En rodando debe disminuir.)
        const remanenteLimite = neumatico.REMANENTE_ACTUAL || neumatico.REMANENTE_INICIAL;

        const posicionActual = neumatico.POSICION_ACTUAL ? neumatico.POSICION_ACTUAL.trim() : '';
        if (posicionActual === 'RES01') {
            // Repuesto: Puede mantenerse igual, pero no crecer
            if (REMANENTE > remanenteLimite) {
                console.warn(`[registrarInspeccion] Validación Fallida RES01: ${REMANENTE} > ${remanenteLimite}`);
                throw new Error(`El remanente ingresado (${REMANENTE}) no puede ser mayor al anterior (${remanenteLimite}) para repuesto.`);
            }
        } else {
            // Rodando: NO puede ser IGUAL o MAYOR (Debe disminuir supuestamente, o al menos eso pidió el usuario)
            // "EL REMANENTE NO PUEDE SER IGUAL O MAYOR PERO EN EL CASO DEL REPUESTO SI PUEDE SER IGUAL"
            if (REMANENTE >= remanenteLimite) {
                console.warn(`[registrarInspeccion] Validación Fallida POSICION: ${REMANENTE} >= ${remanenteLimite}`);
                throw new Error(`El remanente ingresado (${REMANENTE}) no puede ser igual o mayor al anterior (${remanenteLimite}) para neumáticos en uso.`);
            }
        }

        // B) Validar Kilometraje (No puede ser menor al de montaje actual ni al anterior registrado)
        let ultimoOdometro = neumatico.ODOMETRO_AL_MONTAR || 0;

        // // Obtener el último kilometraje registrado en historial si es mayor al de montaje
        // const historial = await neumaticoService.obtenerUltimosMovimientos(CODIGO);
        // console.log(`[registrarInspeccion] Historial encontrado: ${historial ? historial.length : 0} registros.`);

        // if (historial && historial.length > 0) {
        //     const kHmist = historial[0].KILOMETRO;
        //     if (kmHist > ultimoOdometro) ultimoOdometro = kmHist;
        // }

        // console.log(`[registrarInspeccion] Validación KM: Input ${KILOMETRO} vs Último ${ultimoOdometro}`);

        // Si es RES01 (Repuesto), el kilometraje no aumenta (delta = 0)
        let kmRecorrido = 0;
        if (posicionActual !== 'RES01' && (neumatico.ESTADO_CODIGO === 'ASIGNADO' || neumatico.ESTADO_CODIGO === '002')) {
            if (KILOMETRO <= ultimoOdometro) {
                console.warn(`[registrarInspeccion] Error KM: ${KILOMETRO} <= ${ultimoOdometro}`);
                throw new Error(`El kilometro ingresado (${KILOMETRO}) no puede ser menor o igual al último registrado (${ultimoOdometro}).`);
            }
            kmRecorrido = KILOMETRO - ultimoOdometro;
        }
        // else {
        // Para repuesto o no asignados, no calculamos recorrido del vehículo actual|
        // Pero validamos que no metan basura si no es lógico
        // }







        // 2. Actualizar Cabecera (Mediciones Actuales + Acumular Vida + Porcentaje)
        // KM_TOTAL_VIDA se incrementa con el recorrido

        // total km recorridos del neumatico
        const nuevoTotalVida = (neumatico.KM_TOTAL_VIDA || 0) + kmRecorrido;

        // Calcular Porcentaje: (Actual / Inicial) * 100. Si inicial es 0, null.

        let nuevoPorcentaje = null;
        if (neumatico.REMANENTE_INICIAL && neumatico.REMANENTE_INICIAL > 0) {
            nuevoPorcentaje = Math.round((REMANENTE * 100) / neumatico.REMANENTE_INICIAL);
        }

        const sqlUpdate = `
            UPDATE ${BD_SCHEMA}.NEU_INFORMACION SET
                REMANENTE_ACTUAL = ?,
                PRESION_ACTUAL = ?,
                FECHA_ULTIMA_ACTUALIZACION = CURRENT_TIMESTAMP,
                KM_TOTAL_VIDA = ?,
                PORCENTAJE_VIDA = ?,
                TORQUE_ACTUAL = ?,
                ODOMETRO_AL_MONTAR = ?
            WHERE ID_NEUMATICO = ?`;

        const resUpdate = await db.query(sqlUpdate, [REMANENTE, PRESION, nuevoTotalVida, nuevoPorcentaje, TORQUE, KILOMETRO, neumatico.ID_NEUMATICO]);
        console.log(`[registrarInspeccion] Neu_información Actualizada ID ${neumatico.ID_NEUMATICO}: Porcentaje: ${nuevoPorcentaje}%`);

        // 3. Registrar en Historial (NEU_DETALLE) con KM_RECORRIDO y KM_TOTAL_VIDA

        const newObjt = {
            idNeumatico: neumatico.ID_NEUMATICO,
            codigo: CODIGO,
            tipoAccion: 'INSPECCION',
            estadoDestino: neumatico.ESTADO_CODIGO,
            placa: PLACA || neumatico.PLACA_ACTUAL,
            posicionAnterior: neumatico.POSICION_ACTUAL,
            posicionNueva: neumatico.POSICION_ACTUAL,
            odometro: KILOMETRO,
            remanente: REMANENTE,
            presion: PRESION,
            observacion: OBSERVACION,
            usuario,
            kmRecorrido: kmRecorrido,
            kmVida: nuevoTotalVida,
            torque: TORQUE,
            ID_OPERACION: id_operacion,
            COD_SUPERVISOR: cod_supervisor,
            proyecto: neumatico.PROYECTO_ACTUAL,
            fecha_inspeccion,
            nuevoPorcentaje
        }

        console.log({ newObjt })

        await neumaticoService.registrarMovimiento(newObjt);

        return { message: 'Inspección registrada correctamente' };
    },

    /**
     * Obtiene los últimos movimientos de un neumático (o posiciones) para el historial o pre-llenado.
     * Reemplaza consultas directas en controladores.
     */
    obtenerUltimosMovimientos: async (codigo, usuario_super = null) => {
        const codigoTrim = codigo.trim();
        const params = [codigoTrim];

        let query = `
            SELECT
                NP.CODIGO AS CODIGO,
                NP.FECHA_REGISTRO AS FECHA_REGISTRO,
                NP.DISENO AS DISEÑO,
                NP.MEDIDA,
                NM.MARCA,
                NI.PLACA_ACTUAL AS PLACA,
                NI.POSICION_ACTUAL AS POSICION_NEU,
                NI.FECHA_ULTIMA_ACTUALIZACION AS FECHA_MOVIMIENTO,
                (SELECT VK.KILOMETRAJE
                    FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE VK
                    WHERE VK.PLACA = NI.PLACA_ACTUAL
                    ORDER BY VK.ID DESC
                    FETCH FIRST 1 ROW ONLY
                ) AS KILOMETRO,
                NI.REMANENTE_ACTUAL AS REMANENTE,
                NI.PRESION_ACTUAL AS PRESION_AIRE,
                V.KILOMETRAJE AS ODOMETRO_VEHICULO_ACTUAL
            FROM ${BD_SCHEMA}.NEU_PADRON NP
            INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
                ON NI.ID_NEUMATICO = NP.ID
            LEFT JOIN ${BD_SCHEMA}.NEU_MARCA NM
                ON NM.ID_MARCA = NP.ID_MARCA
            LEFT JOIN ${BD_SCHEMA}.PO_VEHICULO V
                ON TRIM(NI.PLACA_ACTUAL) = TRIM(V.NUMPLA)
            WHERE NP.CODIGO = ?`;

        // Filtro opcional por supervisor (legacy requirement)
        if (usuario_super) {
            // TODO
            // query += ` AND UPPER(TRIM(d.SUPERVISOR)) = UPPER(?)`;
            params.push(usuario_super.trim());
        }

        query += ` ORDER BY NP.FECHA_REGISTRO`;

        const result = await db.query(query, params);
        return result;
    }
};

module.exports = neumaticoService;
