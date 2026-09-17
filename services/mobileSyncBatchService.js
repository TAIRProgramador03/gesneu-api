const db = require('../config/db');
const neumaticoService = require('./neumaticoService');

const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

// NEU_MOVIL_SYNC vive en un esquema distinto al resto de tablas NEU_* — ver
// CLAUDE.md (vehicle-app) para el detalle. No es BD_SCHEMA a propósito.
const SCHEMA_SYNC = 'SPEED400PI';

/**
 * Consulta si esta operación ya se aplicó antes (mismo ID_LOCAL) — evita
 * duplicar un movimiento si el móvil reintenta subir la cola tras perder la
 * respuesta de una corrida anterior (conexión cortada a mitad del sync, etc).
 */
async function buscarSincronizacionPrevia(idLocal) {
  const filas = await db.query(
    `SELECT ESTADO, MENSAJE_ERROR, ID_MOVIMIENTO_APLICADO FROM ${SCHEMA_SYNC}.NEU_MOVIL_SYNC WHERE ID_LOCAL = ?`,
    [idLocal]
  );
  return filas[0] ?? null;
}

/**
 * El driver ODBC del AS400 (System i Access) revienta con CWBNL0107 (error
 * de conversion de CCSID/codepage) al bindear ciertos caracteres Unicode
 * "de mas" en una columna CHAR/VARCHAR — no cualquier tilde, especificamente
 * simbolos tipograficos fuera de Latin-1 como el guion largo "—". Bug real
 * encontrado en vivo (2026-09-14, CFM-871): un mensaje de rechazo con "—"
 * tumbaba el resto del batch entero con un error generico, sin relacion
 * aparente con el guion. Se normaliza CUALQUIER texto que vaya a
 * MENSAJE_ERROR antes del INSERT — no solo los mensajes que ya conocemos,
 * tambien err.message de un ODBC/JS arbitrario en el catch de aplicarBatch —
 * en vez de tener que acordarse de evitar estos caracteres a mano en cada
 * mensaje nuevo que se escriba a futuro.
 */
function sanitizarParaAS400(texto) {
  if (!texto) return texto;
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes/diacriticos (á -> a)
    .replace(/[^\x00-\x7F]/g, '-'); // cualquier otro no-ASCII (—, ñ ya sin tilde no aplica, etc.) -> guion simple
}

async function registrarResultadoSync({ idLocal, tipoOperacion, idNeumatico, placa, idMovimientoAplicado, estado, mensajeError, usuarioMovil }) {
  await db.query(
    `INSERT INTO ${SCHEMA_SYNC}.NEU_MOVIL_SYNC
      (ID_LOCAL, TIPO_OPERACION, ID_NEUMATICO, PLACA, ID_MOVIMIENTO_APLICADO, ESTADO, MENSAJE_ERROR, USUARIO_MOVIL)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [idLocal, tipoOperacion, idNeumatico, placa ?? null, idMovimientoAplicado, estado, sanitizarParaAS400(mensajeError) ?? null, usuarioMovil ?? null]
  );
}

/**
 * asignarNeumatico/reubicarNeumatico/desasignarNeumatico/registrarInspeccion
 * terminan todas en registrarMovimiento (un solo INSERT en NEU_MOVIMIENTOS),
 * pero ninguna devuelve el ID insertado — solo un mensaje. Como el batch
 * procesa las operaciones una por una (nunca en paralelo, ver aplicarBatch),
 * la última fila de NEU_MOVIMIENTOS para este neumático es, con certeza, la
 * que se acaba de insertar.
 */
async function obtenerUltimoMovimiento(idNeumatico) {
  const ultimo = await db.query(
    `SELECT ID FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS WHERE ID_NEUMATICO = ? ORDER BY ID DESC FETCH FIRST 1 ROW ONLY`,
    [idNeumatico]
  );
  return ultimo[0]?.ID ?? 0;
}

/**
 * INSPECCION — reusa neumaticoService.registrarInspeccion tal cual (misma
 * función/reglas que la web real). EnTransito no existe en el wizard móvil,
 * va en false.
 *
 * id_operacion/cod_supervisor SÍ hacen falta valores reales —
 * NEU_MOVIMIENTOS.COD_SUPERVISOR es NOT NULL (VARCHAR 15). Bug real
 * encontrado en la prueba en vivo del 2026-09-10: mandar cod_supervisor en
 * null pasaba el UPDATE a NEU_INFORMACION pero reventaba justo después en
 * el INSERT del historial, con un mensaje genérico e inútil ("[odbc] Error
 * executing the sql statement", sin detalle) — como no hay transacciones,
 * el remanente/presión quedaban guardados igual aunque el historial y
 * NEU_VKILOMETRAJE nunca se generaran. Igual que arma cada modal real de la
 * web (`vehiculo?.cod_supervisor`/`vehiculo?.ID_SUPERVISOR`), estos NO son
 * el usuario logueado — son `PO_OPERACIONES.IDSUP`/`.ID` vía
 * `PO_VEHICULO.SECOPE`, verificado y confirmado con el usuario. Se cachean
 * en `vehiculos_cache` (`mobileVehiculosService.js`) y el móvil los manda
 * en el payload de cada operación — de ahí `op.payload.codSupervisor`/
 * `.idOperacion`, no una consulta nueva acá. Si por algún motivo no
 * llegaran (caché vieja, vehículo sin operación asignada), cae a usuarioId
 * como último recurso solo para no reventar el NOT NULL.
 */
async function aplicarInspeccion(op, usuarioId) {
  const dataServicio = {
    CODIGO: op.payload.codigo,
    REMANENTE: op.payload.remanente,
    PRESION: op.payload.presion,
    KILOMETRO: op.payload.kilometro,
    OBSERVACION: op.payload.observacion,
    PLACA: op.placa,
    TORQUE: op.payload.torque,
    cod_supervisor: op.payload.codSupervisor ?? usuarioId,
    id_operacion: op.payload.idOperacion ?? null,
    fecha_inspeccion: op.payload.fechaInspeccion,
    EnTransito: false,
    TallerEnTransito: null,
  };
  await neumaticoService.registrarInspeccion(dataServicio, usuarioId);
  return obtenerUltimoMovimiento(op.idNeumatico);
}

/**
 * neumaticoService.asignarNeumatico valida el ESTADO del neumático
 * ENTRANTE (no puede estar ya ASIGNADO) pero no si la POSICIÓN destino ya
 * tiene OTRO neumático activo — no hacía falta en la web porque el modal
 * exige llenar las 5 posiciones de una sola vez, sin ventana para que dos
 * personas choquen a mitad de camino. Con el móvil offline sí hay esa
 * ventana: dos técnicos pueden asignar (sin señal) a la misma placa+posición
 * antes de sincronizar, y sin este chequeo ambos neumáticos terminarían
 * "reclamando" la misma POS0X en NEU_INFORMACION. Se verifica en cada
 * intento (no solo la primera vez), igual que el resto de checks de esta
 * cola.
 */
async function posicionYaOcupada(placa, posicion) {
  const filas = await db.query(
    `SELECT 1 FROM ${BD_SCHEMA}.NEU_INFORMACION WHERE PLACA_ACTUAL = ? AND POSICION_ACTUAL = ? AND ID_ESTADO = 2 FETCH FIRST 1 ROW ONLY`,
    [placa, posicion]
  );
  return filas.length > 0;
}

/**
 * ASIGNACION (montaje) — reusa neumaticoService.asignarNeumatico. Esa
 * función ya valida que el neumático no esté ASIGNADO todavía y exige
 * PresionAire (lanza si falta) — nada de eso se reimplementa acá. El único
 * chequeo que sí se agrega acá (no vive en el service real) es
 * posicionYaOcupada, ver arriba.
 */
async function aplicarAsignacion(op, usuarioId) {
  if (op.placa && op.payload.posicion) {
    const ocupada = await posicionYaOcupada(op.placa, op.payload.posicion);
    if (ocupada) {
      throw new Error(
        `La posicion ${op.payload.posicion} de la placa ${op.placa} ya tiene un neumatico asignado - probablemente otro tecnico ya la ocupo.`
      );
    }
  }

  const dataServicio = {
    CodigoNeumatico: op.payload.codigo,
    Remanente: op.payload.remanente,
    PresionAire: op.payload.presion,
    TorqueAplicado: op.payload.torque,
    Placa: op.placa,
    Posicion: op.payload.posicion,
    Odometro: op.payload.odometro,
    ID_OPERACION: op.payload.idOperacion ?? null,
    COD_SUPERVISOR: op.payload.codSupervisor ?? usuarioId,
    FechaAsignacion: op.payload.fechaAsignacion,
    EnTransito: false,
    Taller: null,
  };
  await neumaticoService.asignarNeumatico(dataServicio, usuarioId);
  return obtenerUltimoMovimiento(op.idNeumatico);
}

/**
 * REUBICAR (rotación de posición en el mismo vehículo) — reusa
 * neumaticoService.reubicarNeumatico, que internamente exige una
 * inspección de esa placa en los últimos 4 días (regla real, ver CLAUDE.md)
 * y lanza si no la hay. El móvil también valida esto en el cliente (mejor
 * UX, avisa antes de llenar el formulario) pero el backend sigue siendo la
 * fuente de verdad — si algo se coló, se rechaza acá igual.
 */
async function aplicarReubicacion(op, usuarioId) {
  const dataServicio = {
    CODIGO: op.payload.codigo,
    PLACA: op.placa,
    POSICION_FIN: op.payload.posicionFin,
    POSICION_INICIAL: op.payload.posicionInicial,
    REMANENTE: op.payload.remanente,
    PRESION_AIRE: op.payload.presion,
    KILOMETRO: op.payload.kilometro,
    OBSERVACION: op.payload.observacion,
    ID_OPERACION: op.payload.idOperacion ?? null,
    COD_SUPERVISOR: op.payload.codSupervisor ?? usuarioId,
    EnTransito: false,
    TallerEnTransito: null,
  };
  await neumaticoService.reubicarNeumatico(dataServicio, usuarioId);
  return obtenerUltimoMovimiento(op.idNeumatico);
}

/**
 * DESASIGNAR_RECUPERADO / DESASIGNAR_BAJA — reusa
 * neumaticoService.desasignarNeumatico. OJO: la validación de "no dejar
 * posiciones vacías" que tiene la web para esto (registrarDesasignacionNeumatico
 * en poMantenimientoController.js) consulta NEU_CABECERA, una tabla muerta
 * que las funciones normalizadas no actualizan (confirmado con el usuario,
 * ver CLAUDE.md) — a propósito NO se replica acá, cada operación se aplica
 * independiente.
 */
async function aplicarDesasignacion(op, usuarioId, tipoMovimiento) {
  const dataServicio = {
    CODIGO: op.payload.codigo,
    TIPO_MOVIMIENTO: tipoMovimiento,
    OBSERVACION: op.payload.observacion,
    KILOMETRO: op.payload.kilometro,
    REMANENTE: op.payload.remanente,
    COD_SUPERVISOR: op.payload.codSupervisor ?? usuarioId,
    ID_OPERACION: op.payload.idOperacion ?? null,
    TIPO_BAJA: op.payload.tipoBaja ?? null,
    EnTransito: false,
    Taller: null,
  };
  await neumaticoService.desasignarNeumatico(dataServicio, usuarioId);
  return obtenerUltimoMovimiento(op.idNeumatico);
}

async function aplicarOperacion(op, usuarioId) {
  switch (op.tipoOperacion) {
    case 'INSPECCION':
      return aplicarInspeccion(op, usuarioId);
    case 'ASIGNACION':
      return aplicarAsignacion(op, usuarioId);
    case 'REUBICAR':
      return aplicarReubicacion(op, usuarioId);
    case 'DESASIGNAR_RECUPERADO':
      return aplicarDesasignacion(op, usuarioId, 'RECUPERADO');
    case 'DESASIGNAR_BAJA':
      return aplicarDesasignacion(op, usuarioId, 'BAJA DEFINITIVA');
    default:
      throw new Error(`Tipo de operación no soportado: ${op.tipoOperacion}`);
  }
}

/**
 * Réplica del INSERT final de poInspeccionController.crearInspeccion: una
 * sola fila en NEU_VKILOMETRAJE por placa (no por neumático), con el
 * kilometraje/fecha/tipo de terreno/retén de esa inspección — es lo que la
 * próxima inspección/reubicación va a leer como "último odómetro/fecha
 * conocidos". FECHA_ASIGNACION se arrastra de la última fila existente (no
 * es la fecha de ESTA inspección) — mismo campo, semántica distinta a la de
 * ASIGNACION abajo.
 */
async function registrarKilometrajeInspeccion(placa, datos) {
  const ultimo = await db.query(
    `SELECT FECHA_ASIGNACION FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE WHERE PLACA = ? ORDER BY ID DESC FETCH FIRST 1 ROW ONLY`,
    [placa]
  );
  const fechaAsignacion = ultimo[0]?.FECHA_ASIGNACION ?? '2004-05-30';

  await db.query(
    `INSERT INTO ${BD_SCHEMA}.NEU_VKILOMETRAJE
      (PLACA, KILOMETRAJE, FECHA_ASIGNACION, FECHA_INSPECCION, TIPO_TERRENO, RETEN)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [placa, datos.kilometro, fechaAsignacion, datos.fecha, datos.tipoTerreno, datos.reten]
  );
}

/**
 * Réplica del INSERT que hace poAsignarNeumaticoController tras aplicar las
 * 5 posiciones: una sola fila en NEU_VKILOMETRAJE por placa, con
 * FECHA_ASIGNACION = la fecha real de ESTA asignación (no se arrastra de la
 * fila anterior, a diferencia de inspección) y FECHA_INSPECCION en null —
 * verificado contra el controller real, mismo shape exacto.
 */
async function registrarKilometrajeAsignacion(placa, datos) {
  await db.query(
    `INSERT INTO ${BD_SCHEMA}.NEU_VKILOMETRAJE (PLACA, KILOMETRAJE, FECHA_ASIGNACION)
     VALUES (?, ?, ?)`,
    [placa, datos.kilometro, datos.fecha]
  );
}

/**
 * ¿Ya existe una inspección de esta placa en esta fecha? Consulta
 * NEU_VKILOMETRAJE directo — cubre el caso de otro técnico (u otro sync
 * anterior) que ya haya registrado esa misma placa+fecha. Ojo: esto NO
 * detecta un duplicado que llegue DENTRO del mismo batch (la fila de
 * NEU_VKILOMETRAJE de una inspección recién se inserta al final de todo el
 * batch, ver más abajo) — ese caso lo cubre el propio Map `inspeccionesNuevas`
 * en aplicarBatch.
 */
async function existeInspeccionParaFecha(placa, fechaInspeccion) {
  const filas = await db.query(
    `SELECT 1 FROM ${BD_SCHEMA}.NEU_VKILOMETRAJE WHERE PLACA = ? AND FECHA_INSPECCION = ? FETCH FIRST 1 ROW ONLY`,
    [placa, fechaInspeccion]
  );
  return filas.length > 0;
}

/**
 * Punto de entrada del batch. Procesa las operaciones EN ORDEN (no en
 * paralelo) — necesario tanto para el truco de "última fila insertada" de
 * arriba como para que, si el técnico desasignó un neumático y asignó otro
 * a la misma posición en el mismo batch, se apliquen en el orden en que
 * ocurrieron de verdad (la cola local ya viene ordenada por creado_en).
 */
async function aplicarBatch(operaciones, usuarioId) {
  const resultados = [];
  // Eventos que van a terminar en su propia fila de NEU_VKILOMETRAJE —
  // INSPECCION y ASIGNACION comparten esta misma cola (con un campo `tipo`
  // porque el INSERT real de cada una tiene forma distinta, ver
  // registrarKilometrajeInspeccion/registrarKilometrajeAsignacion) para que
  // se inserten ordenados cronológicamente ENTRE los dos tipos, no cada uno
  // por su cuenta — si algún día coinciden una asignación y una inspección
  // de la misma placa en el mismo batch, importa que la fila más vieja se
  // inserte primero sin importar de qué tipo sea cada una (ver el porqué del
  // orden cronológico más abajo). Clave = `${placa}|${fecha}`, no solo
  // placa — si el mismo batch trae DOS inspecciones reales distintas de la
  // misma placa (el técnico inspeccionó offline dos veces antes de
  // recuperar señal, algo que en la web no pasa porque crearInspeccion
  // siempre corre una vez por envío), acá antes se pisaban entre sí y solo
  // se insertaba una fila en NEU_VKILOMETRAJE. Bug real confirmado
  // 2026-09-10 (BTS-766).
  const eventosVkilometraje = new Map();
  // Cache en memoria de `${placa}|${fecha}` -> ya existe una inspección con
  // esa combinación (true/false) — evita repetir la consulta a
  // NEU_VKILOMETRAJE 5 veces (una por posición) para la misma inspección.
  const duplicadoInspeccionCache = new Map();

  for (const op of operaciones) {
    const previa = await buscarSincronizacionPrevia(op.idLocal);
    if (previa) {
      resultados.push({
        idLocal: op.idLocal,
        estado: previa.ESTADO === 'APLICADO' ? 'YA_APLICADO' : 'RECHAZADO',
        mensajeError: previa.MENSAJE_ERROR ?? undefined,
        idMovimientoAplicado: previa.ID_MOVIMIENTO_APLICADO || undefined,
      });
      continue;
    }

    // Regla acordada con el usuario: "el que sincroniza primero, gana". Si
    // ya existe una inspección de esta placa+fecha — sea porque otro técnico
    // ya la sincronizó antes (NEU_VKILOMETRAJE real) o porque otra inspección
    // de este mismo batch ya la reclamó (inspeccionesNuevas) — se rechaza la
    // operación ENTERA, no solo el kilometraje: o entra completa, o no entra
    // nada, para no dejar 4 posiciones aplicadas y 1 rara. El motivo queda
    // registrado en NEU_MOVIL_SYNC (no en las tablas reales de neumáticos),
    // consultable para revisar el caso — no debería pasar seguido, ya que el
    // propio móvil bloquea repetir fecha con el mismo técnico/dispositivo;
    // esto cubre el caso de DOS técnicos distintos inspeccionando la misma
    // placa el mismo día sin saber uno del otro.
    if (op.tipoOperacion === 'INSPECCION' && op.placa) {
      const claveInspeccion = `${op.placa}|${op.payload.fechaInspeccion}`;
      if (!duplicadoInspeccionCache.has(claveInspeccion)) {
        const yaExiste =
          eventosVkilometraje.has(claveInspeccion) ||
          (await existeInspeccionParaFecha(op.placa, op.payload.fechaInspeccion));
        duplicadoInspeccionCache.set(claveInspeccion, yaExiste);
      }
      if (duplicadoInspeccionCache.get(claveInspeccion)) {
        const mensaje = `Ya existe una inspeccion registrada para la placa ${op.placa} en la fecha ${op.payload.fechaInspeccion} (posiblemente de otro tecnico) - se descarta esta.`;
        console.error(`[mobileSyncBatchService] Operación ${op.idLocal} (INSPECCION) rechazada por duplicado:`, mensaje);
        await registrarResultadoSync({
          idLocal: op.idLocal,
          tipoOperacion: op.tipoOperacion,
          idNeumatico: op.idNeumatico,
          placa: op.placa,
          idMovimientoAplicado: 0,
          estado: 'RECHAZADO',
          mensajeError: mensaje,
          usuarioMovil: usuarioId,
        });
        resultados.push({ idLocal: op.idLocal, estado: 'RECHAZADO', mensajeError: mensaje });
        continue;
      }
    }

    try {
      const idMovimiento = await aplicarOperacion(op, usuarioId);
      await registrarResultadoSync({
        idLocal: op.idLocal,
        tipoOperacion: op.tipoOperacion,
        idNeumatico: op.idNeumatico,
        placa: op.placa,
        idMovimientoAplicado: idMovimiento,
        estado: 'APLICADO',
        usuarioMovil: usuarioId,
      });
      resultados.push({ idLocal: op.idLocal, estado: 'APLICADO', idMovimientoAplicado: idMovimiento });

      if (op.tipoOperacion === 'INSPECCION' && op.placa) {
        eventosVkilometraje.set(`${op.placa}|${op.payload.fechaInspeccion}`, {
          tipo: 'INSPECCION',
          placa: op.placa,
          kilometro: op.payload.kilometro,
          fecha: op.payload.fechaInspeccion,
          tipoTerreno: op.payload.tipoTerreno,
          reten: op.payload.reten,
        });
      } else if (op.tipoOperacion === 'ASIGNACION' && op.placa) {
        // Clave por placa+fecha igual que inspección — las 5 posiciones de
        // una misma asignación comparten la misma fecha (el wizard móvil
        // solo permite una fecha compartida para las 5, igual que exige la
        // web con su validación "todasIguales"), así que las 5 colapsan en
        // esta única entrada del Map sin problema — se quiere UNA fila en
        // NEU_VKILOMETRAJE por asignación, no una por neumático.
        eventosVkilometraje.set(`${op.placa}|${op.payload.fechaAsignacion}`, {
          tipo: 'ASIGNACION',
          placa: op.placa,
          // OJO: el payload de ASIGNACION usa `odometro`, no `kilometro`
          // (mismo campo que lee aplicarAsignacion como Odometro) — bug real
          // encontrado en la primera prueba en vivo (CFG-933, 2026-09-14):
          // leer `op.payload.kilometro` acá (copiado sin ajustar del bloque
          // de INSPECCION, que sí se llama así) mandaba `undefined` al
          // INSERT, que fallaba silencioso — las 5 posiciones quedaban
          // APLICADO igual (no dependen de este campo) pero la fila de
          // NEU_VKILOMETRAJE nunca se creaba, sin ningún rastro visible para
          // el técnico ni en NEU_MOVIL_SYNC.
          kilometro: op.payload.odometro,
          fecha: op.payload.fechaAsignacion,
        });
      }
    } catch (err) {
      // err.message de un error ODBC es inútil ("[odbc] Error executing the
      // sql statement") — el detalle real (SQLSTATE, columna, motivo) viene
      // en err.odbcErrors (mismo campo que ya usa config/db.js para
      // loguear reconexiones). Lo incluimos para poder diagnosticar sin
      // tener que reproducir el bug a mano.
      const detalleOdbc = err?.odbcErrors ? ` | odbcErrors: ${JSON.stringify(err.odbcErrors)}` : '';
      const mensaje = (String(err?.message ?? err) + detalleOdbc).slice(0, 500);
      console.error(`[mobileSyncBatchService] Operación ${op.idLocal} (${op.tipoOperacion}) rechazada:`, mensaje);
      // ID_MOVIMIENTO_APLICADO es NOT NULL en NEU_MOVIL_SYNC — 0 es el
      // sentinel acordado para "no hay movimiento real que referenciar"
      // (los IDs reales de NEU_MOVIMIENTOS arrancan en 1).
      await registrarResultadoSync({
        idLocal: op.idLocal,
        tipoOperacion: op.tipoOperacion,
        idNeumatico: op.idNeumatico,
        placa: op.placa,
        idMovimientoAplicado: 0,
        estado: 'RECHAZADO',
        mensajeError: mensaje,
        usuarioMovil: usuarioId,
      });
      resultados.push({ idLocal: op.idLocal, estado: 'RECHAZADO', mensajeError: mensaje });
    }
  }

  // Una fila en NEU_VKILOMETRAJE por CADA evento real nuevo de este batch
  // (INSPECCION o ASIGNACION, no por cada neumático, y no para los que ya
  // estaban sincronizados de una corrida anterior — esa fila ya se insertó
  // entonces). Se insertan en orden CRONOLÓGICO (fecha ascendente, la más
  // vieja primero) — no en el orden en que se procesaron las operaciones, y
  // ATRAVESANDO ambos tipos juntos (no primero todas las asignaciones y
  // luego todas las inspecciones). Importa: cada INSERT de INSPECCION
  // arrastra FECHA_ASIGNACION de "la última fila por ID" de esa placa
  // (registrarKilometrajeInspeccion), y esa misma "última fila por ID" es lo
  // que leen registrarInspeccion/reubicarNeumatico/etc. como "último
  // odómetro/fecha conocidos" para el SIGUIENTE evento. Si se insertara el
  // más nuevo antes que el viejo, la tabla quedaría con el viejo como "el
  // más reciente" — no es solo prolijidad, rompe esa lógica para cualquier
  // evento futuro de esa placa.
  const eventosOrdenados = [...eventosVkilometraje.values()].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0
  );

  for (const datos of eventosOrdenados) {
    try {
      if (datos.tipo === 'INSPECCION') {
        await registrarKilometrajeInspeccion(datos.placa, datos);
      } else {
        await registrarKilometrajeAsignacion(datos.placa, datos);
      }
    } catch (err) {
      console.error(`[mobileSyncBatchService] Error registrando kilometraje de ${datos.placa} (${datos.tipo}):`, err);
      // No revertimos los movimientos ya aplicados por esto — el técnico ya
      // vería sus inspecciones/asignaciones guardadas; el kilometraje del
      // vehículo queda desactualizado hasta el próximo evento, se loguea
      // para revisar.
    }
  }

  return resultados;
}

module.exports = { aplicarBatch };
