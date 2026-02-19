const db = require('../config/db');

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
        const sql = `SELECT ID_MARCA FROM SPEED400AT.NEU_MARCA WHERE UPPER(TRIM(MARCA)) = ?`;
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

                    np.RQ,
                    np.OC,
                    TRIM(np.PROYECTO) AS PROYECTO,
                    np.COSTO_INICIAL AS COSTO,
                    TRIM(prov.PRONOM) AS PROVEEDOR,
                    np.FECHA_COMPRA,
                    np.FECHA_REGISTRO,

                    ni.PORCENTAJE_VIDA AS ESTADO,
                    ni.ID_ESTADO AS ESTADO_ACTUAL,
                    ne.CODIGO_INTERNO AS TIPO_MOVIMIENTO,
                    TRIM(ni.PLACA_ACTUAL) AS PLACA,
                    ni.POSICION_ACTUAL AS POSICION_NEU,

                    ni.REMANENTE_ACTUAL AS REMANENTE,
                    ni.PRESION_ACTUAL AS PRESION_AIRE,
                    ni.TORQUE_ACTUAL,
                    ni.KM_TOTAL_VIDA AS KILOMETRO

                FROM SPEED400PI.NEU_PADRON np
                LEFT JOIN SPEED400PI.NEU_INFORMACION ni
                    ON ni.ID_NEUMATICO = np.ID
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

        const params = [];
        if (filtroSupervisor) {
            params.push(filtroSupervisor.trim());
        }
        sql += ' ORDER BY np.ID DESC';
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
        const existeSql = `SELECT ID_NEUMATICO FROM SPEED400AT.NEU_CABECERA WHERE CODIGO_CASCO = ?`;
        const existeResult = await db.query(existeSql, [CODIGO]);

        let idNeumatico;

        if (existeResult && existeResult.length > 0) {
            // UPDATES logic here if needed
            idNeumatico = existeResult[0].ID_NEUMATICO;
            // TODO: Implementar Update si es necesario actualizar ficha técnica
        } else {
            // INSERT
            const insertSql = `
                INSERT INTO SPEED400AT.NEU_CABECERA (
                    CODIGO_CASCO, ID_MARCA, MEDIDA, DISEÑO, REMANENTE_INICIAL,
                    REMANENTE_ACTUAL, PROVEEDOR_NOMBRE, COSTO_INICIAL,
                    INDICE_CARGA, INDICE_VELOCIDAD, DOT_FABRICACION, FECHA_COMPRA,
                    RQ, OC, PROYECTO, SUPERVISOR_ACTUAL,
                    ID_ESTADO
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE'))
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
        estadoDestino, // <--- Agregado torque
        kmRecorrido = 0,
        FechaAsignacion = null,
        kmVida = 0// <--- Explicitly Destructured

    }) => {

        // 1. Resolver IDs de Estado y Acción explícitamente para evitar subqueries fallidas en ODBC
        const sqlEstado = `SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = ?`;
        const resEstado = await db.query(sqlEstado, [estadoDestino || 'DISPONIBLE']);
        const idEstadoResolved = (resEstado && resEstado.length > 0) ? resEstado[0].ID_ESTADO : null;

        const sqlAccion = `SELECT ID_ACCION FROM SPEED400AT.NEU_ACCION WHERE CODIGO_INTERNO = ?`;
        const resAccion = await db.query(sqlAccion, [tipoAccion]);
        const idAccionResolved = (resAccion && resAccion.length > 0) ? resAccion[0].ID_ACCION : null;

        if (!idAccionResolved) {
            console.error(`[neumaticoService] Critico: No se encontro accion '${tipoAccion}' en catalogo.`);
        }

        // 2. Resolver ID_VEHICULO: Ignorado por ahora

        const sql = `
            INSERT INTO SPEED400PI.NEU_MOVIMIENTOS (
                ID_NEUMATICO, ID_VEHICULO,
                PLACA, PROYECTO, POSICION_ANTERIOR, POSICION_NUEVA, ODOMETRO_VEHICULO,
                REMANENTE_MEDIDO, PRESION_MEDIDA, TORQUE_APLICADO, OBS, USUARIO_REGISTRADOR,
                ID_ESTADO, ID_ACCION,
                ID_OPERACION,
                COD_SUPERVISOR, 
                KM_RECORRIDOS_ETAPA,
                FECHA_ASIGNACION
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        // TODO: Usuario registrador tiene q ser quien registro el mov
        const params = [
            idNeumatico, idVehiculo || null,
            placa || null, proyecto, posicionAnterior || null, posicionNueva || null, odometro || 0,
            remanente || 0, presion || 0, torque || 0, observacion || '', usuario || 'SISTEMA',
            idEstadoResolved,
            idAccionResolved,
            ID_OPERACION,
            COD_SUPERVISOR,
            kmRecorrido,
            FechaAsignacion || null
            // kmVida || 0 (Removed)
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
                        NI.KM_TOTAL_VIDA
                    FROM SPEED400PI.NEU_PADRON NP
                    INNER JOIN SPEED400PI.NEU_INFORMACION NI
                        ON NI.ID_NEUMATICO = NP."ID"
                    LEFT JOIN SPEED400AT.NEU_ESTADO NE
                        ON NE.ID_ESTADO = NI.ID_ESTADO
                    WHERE NP.CODIGO = ?`;

        const resultId = await db.query(sqlGetId, [CodigoNeumatico]);

        if (!resultId || resultId.length === 0) {
            throw new Error(`Neumático ${CodigoNeumatico} no encontrado en NEU_CABECERA`);
        }
        const neumatico = resultId[0];
        const idNeumatico = neumatico.ID_NEUMATICO;
        const proyectoActual = neumatico.PROYECTO_ACTUAL
        // const kmTotalVida = Number(neumatico.KM_TOTAL_VIDA)
        // const kmTotalSumVida = kmTotalVida + KmRecorridoxEtapa

        const porcentajeRemantene = Math.round(((Remanente * 100) / Remanente))

        // VALIDACIÓN: Solo permitir asignar si está DISPONIBLE
        if (neumatico.ESTADO_CODIGO !== 'DISPONIBLE') {
            throw new Error(`El neumático ${CodigoNeumatico} ya se encuentra asignado o no está disponible(Estado: ${neumatico.ESTADO_CODIGO}).Por favor, realice una inspección o desasignación primero.`);
        }

        // 2. Actualizar Cabecera (Estado y Ubicacion)

        const sqlUpdate = `
            UPDATE SPEED400PI.NEU_INFORMACION
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
            FechaAsignacion
        });

        return { message: 'Asignación Correcta (Normalizada)' };
    },

    /**
     * Reubicar un neumático (Rotación o Movimiento)
     */
    reubicarNeumatico: async (data, usuario) => {
        const {
            CODIGO, PLACA, POSICION_FIN, POSICION_INICIAL,
            REMANENTE, PRESION_AIRE, KILOMETRO, OBSERVACION
        } = data;

        // 0. Validación de Regla de Negocio: Inspección Previa
        // Verificar si existe una inspección en los últimos 4 días para esta placa en NEU_DETALLE.
        const sqlInsp = `
            SELECT FECHA_SUCESO 
            FROM SPEED400AT.NEU_DETALLE 
            WHERE PLACA = ? 
              AND TIPO_ACCION LIKE '%INSPECCION%'
            ORDER BY FECHA_SUCESO DESC
            FETCH FIRST 1 ROW ONLY
        `;
        const resInsp = await db.query(sqlInsp, [PLACA]);

        // Calcular diferencia de días
        let dias = 999;
        if (resInsp && resInsp.length > 0) {
            const fechaInsp = new Date(resInsp[0].FECHA_SUCESO);
            const hoy = new Date();
            // Normalizar a medianoche para comparar días completos
            fechaInsp.setHours(0, 0, 0, 0);
            hoy.setHours(0, 0, 0, 0);
            const diffTime = Math.abs(hoy - fechaInsp);
            dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        if (dias > 4) {
            const ultimaFecha = resInsp && resInsp[0] ? new Date(resInsp[0].FECHA_SUCESO).toLocaleDateString() : 'Nunca';
            throw new Error(`REGLA DE NEGOCIO: No se puede reubicar neumáticos del vehículo ${PLACA} sin una inspección reciente (Máx 4 días). Última: ${ultimaFecha}`);
        }

        // 1. Obtener ID y Datos Actuales
        const sqlGetId = `SELECT ID_NEUMATICO, REMANENTE_ACTUAL, PRESION_ACTUAL FROM SPEED400AT.NEU_CABECERA WHERE RTRIM(CODIGO_CASCO) = ? `;
        const resultId = await db.query(sqlGetId, [CODIGO]);
        if (!resultId || resultId.length === 0) throw new Error(`Neumático ${CODIGO} no encontrado`);
        const idNeumatico = resultId[0].ID_NEUMATICO;

        // 1.5. Obtener último registro para heredar datos si no se proporcionan
        const sqlUltimo = `
            SELECT ODOMETRO_VEHICULO, PRESION_MEDIDA, REMANENTE_MEDIDO, KM_RECORRIDOS_ETAPA
            FROM SPEED400AT.NEU_DETALLE
            WHERE ID_NEUMATICO = ?
            ORDER BY FECHA_SUCESO DESC
            FETCH FIRST 1 ROW ONLY
        `;
        const resultUltimo = await db.query(sqlUltimo, [idNeumatico]);
        const ultimoRegistro = resultUltimo && resultUltimo[0] ? resultUltimo[0] : {};

        // Heredar valores si no se proporcionan nuevos
        const odometroFinal = KILOMETRO || ultimoRegistro.ODOMETRO_VEHICULO || null;
        const presionFinal = PRESION_AIRE || ultimoRegistro.PRESION_MEDIDA || resultId[0].PRESION_ACTUAL || null;
        const remanenteFinal = REMANENTE || ultimoRegistro.REMANENTE_MEDIDO || resultId[0].REMANENTE_ACTUAL || null;
        const kmRecorridoFinal = ultimoRegistro.KM_RECORRIDOS_ETAPA || 0; // Heredar KM recorridos

        // NOTA: La validación de posiciones vacías se hace en el controlador ANTES del loop
        // para validar el estado final después de TODAS las reubicaciones

        // 2. Actualizar Cabecera
        const sqlUpdate = `
            UPDATE SPEED400AT.NEU_CABECERA SET
                POSICION_ACTUAL = ?,
                FECHA_ULTIMO_SUCESO = CURRENT_TIMESTAMP
            WHERE ID_NEUMATICO = ?
        `;
        await db.query(sqlUpdate, [POSICION_FIN, idNeumatico]);

        // 3. Registrar Historial con datos heredados
        await neumaticoService.registrarMovimiento({
            idNeumatico,
            codigo: CODIGO,
            tipoAccion: 'ROTACION',
            estadoDestino: 'ASIGNADO', // <--- Sigue asignado
            placa: PLACA,
            posicionAnterior: POSICION_INICIAL,
            posicionNueva: POSICION_FIN,
            odometro: odometroFinal,
            remanente: remanenteFinal,
            presion: presionFinal,
            observacion: OBSERVACION || 'Reubicación realizada',
            usuario,
            kmRecorrido: kmRecorridoFinal // <--- Heredar KM recorridos
        });
    },

    /**
     * Desasignar Neumático (Baja o Recupero)
     */
    desasignarNeumatico: async (data, usuario) => {
        const {
            CODIGO, TIPO_MOVIMIENTO, OBSERVACION, KILOMETRO, REMANENTE
        } = data;

        // TIPO_MOVIMIENTO suele ser 'BAJA DEFINITIVA' o 'RECUPERADO'
        const nuevoEstado = (TIPO_MOVIMIENTO === 'BAJA DEFINITIVA') ? 'BAJA' : 'RECUPERADO';

        // 1. Obtener ID y PLACA actual del neumático
        const sqlGetNeumatico = `
            SELECT ID_NEUMATICO, PLACA_ACTUAL, POSICION_ACTUAL 
            FROM SPEED400AT.NEU_CABECERA 
            WHERE CODIGO_CASCO = ?
        `;
        const resultNeumatico = await db.query(sqlGetNeumatico, [CODIGO]);
        if (!resultNeumatico || resultNeumatico.length === 0) {
            throw new Error(`Neumático ${CODIGO} no encontrado`);
        }

        const idNeumatico = resultNeumatico[0].ID_NEUMATICO;
        const placaActual = resultNeumatico[0].PLACA_ACTUAL;
        const posicionActual = resultNeumatico[0].POSICION_ACTUAL;

        // NOTA: NO validamos si está asignado porque RECUPERADO/BAJA pueden aplicarse
        // a neumáticos que ya fueron desasignados previamente
        // Solo agregamos un nuevo estado al historial

        // NOTA: La validación de posiciones vacías se hace en el CONTROLADOR
        // de forma global para TODAS las desasignaciones en batch
        // Esto evita validaciones individuales que no ven el estado final

        // 3. Obtener último registro para heredar datos si no se proporcionan
        const sqlUltimo = `
            SELECT ODOMETRO_VEHICULO, PRESION_MEDIDA, REMANENTE_MEDIDO, KM_RECORRIDOS_ETAPA
            FROM SPEED400AT.NEU_DETALLE
            WHERE ID_NEUMATICO = ?
            ORDER BY FECHA_SUCESO DESC
            FETCH FIRST 1 ROW ONLY
        `;
        const resultUltimo = await db.query(sqlUltimo, [idNeumatico]);
        const ultimoRegistro = resultUltimo && resultUltimo[0] ? resultUltimo[0] : {};

        // Heredar valores si no se proporcionan nuevos
        const odometroFinal = KILOMETRO || ultimoRegistro.ODOMETRO_VEHICULO || null;
        const remanenteFinal = REMANENTE || ultimoRegistro.REMANENTE_MEDIDO || null;
        const kmRecorridoFinal = ultimoRegistro.KM_RECORRIDOS_ETAPA || 0;

        // 4. Actualizar Cabecera (Liberar vehículo)
        const sqlUpdate = `
            UPDATE SPEED400AT.NEU_CABECERA SET
                ID_ESTADO = (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = ?),
                PLACA_ACTUAL = NULL,
                POSICION_ACTUAL = NULL,
                REMANENTE_ACTUAL = ?,
                FECHA_ULTIMO_SUCESO = CURRENT_TIMESTAMP
            WHERE ID_NEUMATICO = ?
        `;
        await db.query(sqlUpdate, [nuevoEstado, remanenteFinal, idNeumatico]);

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
            tipoAccion: accionCodigo, // 'BAJA' o 'RECUPERO'
            estadoDestino: nuevoEstado,
            placa: placaActual, // Placa del vehículo antes de desasignar
            posicionAnterior: posicionActual, // Posición que tenía
            posicionNueva: null, // Ya no tiene posición
            odometro: odometroFinal,
            remanente: remanenteFinal,
            observacion: OBSERVACION,
            usuario,
            kmRecorrido: kmRecorridoFinal
        });
    },

    /**
     * Registrar Inspección (Medición de Presión, Remanente, Kilometraje)
     */
    registrarInspeccion: async (data, usuario) => {
        const {
            CODIGO, REMANENTE, PRESION, KILOMETRO, OBSERVACION, PLACA, TORQUE, cod_supervisor, id_operacion
        } = data;

        // console.log(`[registrarInspeccion] INICIO para Código: '${CODIGO}', Placa: '${PLACA}', KM: ${KILOMETRO}, Rem: ${REMANENTE}`);

        // 1. Obtener Datos Actuales y de Referencia
        // const sqlGet = `
        //     SELECT C.ID_NEUMATICO, 
        //            C.REMANENTE_INICIAL, 
        //            C.REMANENTE_ACTUAL, 
        //            C.ODOMETRO_AL_MONTAR, ** FALTA
        //            C.PLACA_ACTUAL, 
        //            C.POSICION_ACTUAL,
        //            C.KM_TOTAL_VIDA, -- Necesario para acumular
        //            E.CODIGO_INTERNO as ESTADO_CODIGO
        //     FROM SPEED400AT.NEU_CABECERA C
        //     LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO
        //     WHERE RTRIM(C.CODIGO_CASCO) = ?
        // `;

        const sqlGet = `
            SELECT
                NP.ID AS ID_NEUMATICO,
                (SELECT NM.REMANENTE_MEDIDO
                FROM SPEED400PI.NEU_MOVIMIENTOS NM
                WHERE NM.PLACA = NI.PLACA_ACTUAL AND NM.ID_ACCION = 2 AND NM.ID_NEUMATICO = NP.ID
                ORDER BY NM.ID DESC
                FETCH FIRST 1 ROW ONLY
                ) AS REMANENTE_INICIAL,
                NI.REMANENTE_ACTUAL,
                NI.PLACA_ACTUAL,
                NI.POSICION_ACTUAL,
                NI.KM_TOTAL_VIDA,
                NE.CODIGO_INTERNO AS ESTADO_CODIGO,
                (SELECT VK.KILOMETRAJE
                FROM SPEED400PI.NEU_VKILOMETRAJE VK
                WHERE VK.PLACA = NI.PLACA_ACTUAL
                ORDER BY VK.ID DESC
                FETCH FIRST 1 ROW ONLY
                ) AS ODOMETRO_AL_MONTAR,
                NI.PROYECTO_ACTUAL
            FROM SPEED400PI.NEU_PADRON NP
            LEFT JOIN SPEED400PI.NEU_INFORMACION NI
                ON NP."ID" = NI.ID_NEUMATICO
            LEFT JOIN SPEED400AT.NEU_ESTADO NE
                ON NI.ID_ESTADO = NE.ID_ESTADO
            WHERE NP.CODIGO = ? AND NI.PLACA_ACTUAL = ?`

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
            UPDATE SPEED400PI.NEU_INFORMACION SET
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
            proyecto: neumatico.PROYECTO_ACTUAL
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

        // let query = `
        //     SELECT 
        //         -- Datos de Cabecera (PRIORIDAD: Siempre existen)
        //         C.CODIGO_CASCO AS CODIGO, 
        //         C.ODOMETRO_AL_MONTAR AS ODOMETRO_INICIAL, **FALTA
        //         C.DISEÑO,
        //         C.MEDIDA,
        //         M.MARCA,
        //         C.PLACA_ACTUAL AS PLACA,
        //         C.POSICION_ACTUAL AS POSICION_NEU,
        //         -- Datos del Detalle (Reciente, puede ser nulo)
        //         d.ID_MOVIMIENTO, ** FALTA
        //         d.FECHA_SUCESO AS FECHA_MOVIMIENTO,
        //         d.ODOMETRO_VEHICULO AS KILOMETRO,
        //         d.REMANENTE_MEDIDO AS REMANENTE,
        //         d.PRESION_MEDIDA AS PRESION_AIRE,
        //         d.SUPERVISOR AS USUARIO_SUPER, ** FALTA
        //         d.OBSERVACION, *+ FALTA
        //         A.DESCRIPCION AS TIPO_MOVIMIENTO, ** FALTA
        //         -- Datos del Vehículo Actual (PO_VEHICULO)
        //         V.KILOMETRAJE AS ODOMETRO_VEHICULO_ACTUAL
        //     FROM SPEED400AT.NEU_CABECERA C
        //     LEFT JOIN SPEED400AT.NEU_MARCA M ON C.ID_MARCA = M.ID_MARCA
        //     LEFT JOIN SPEED400AT.PO_VEHICULO V ON TRIM(C.PLACA_ACTUAL) = TRIM(V.NUMPLA)
        //     LEFT JOIN SPEED400AT.NEU_DETALLE d ON d.ID_MOVIMIENTO = (
        //         SELECT MAX(ID_MOVIMIENTO) 
        //         FROM SPEED400AT.NEU_DETALLE 
        //         WHERE CODIGO_CASCO = C.CODIGO_CASCO
        //     )
        //     LEFT JOIN SPEED400AT.NEU_ACCION A ON d.ID_ACCION = A.ID_ACCION
        //     WHERE RTRIM(C.CODIGO_CASCO) = ?
        // `;

        //     (SELECT VK.KILOMETRAJE
        //                 FROM SPEED400PI.NEU_VKILOMETRAJE VK
        //                 WHERE VK.PLACA = ni.PLACA_ACTUAL
        //                 ORDER BY VK.ID DESC
        //                 FETCH FIRST 1 ROW ONLY
        //             ) AS ODOMETRO,


        // (SELECT ODOMETRO_VEHICULO 
        //  FROM SPEED400PI.NEU_MOVIMIENTOS 
        //  WHERE ID_NEUMATICO = np.ID 
        //  ORDER BY FECHA_MOVIMIENTO DESC 
        //  FETCH FIRST 1 ROW ONLY) AS ODOMETRO_ULTIMO

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
                    FROM SPEED400PI.NEU_VKILOMETRAJE VK
                    WHERE VK.PLACA = NI.PLACA_ACTUAL
                    ORDER BY VK.ID DESC
                    FETCH FIRST 1 ROW ONLY
                ) AS KILOMETRO,
                NI.REMANENTE_ACTUAL AS REMANENTE,
                NI.PRESION_ACTUAL AS PRESION_AIRE,
                V.KILOMETRAJE AS ODOMETRO_VEHICULO_ACTUAL
            FROM SPEED400PI.NEU_PADRON NP
            INNER JOIN SPEED400PI.NEU_INFORMACION NI
                ON NI.ID_NEUMATICO = NP.ID
            LEFT JOIN SPEED400AT.NEU_MARCA NM
                ON NM.ID_MARCA = NP.ID_MARCA
            LEFT JOIN SPEED400AT.PO_VEHICULO V
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
