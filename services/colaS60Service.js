const db = require('../config/db');
const BD_SCHEMA = process.env.DB_SCHEMA ?? 'SPEED400AT';

/**
 * Cola obligatoria de S60.
 *
 * REGLA (definida con el usuario el 21-oct-2026):
 * La linea de S60 pendiente mas antigua de las operaciones a cargo del usuario
 * define la UNICA S60 habilitada. Mientras exista una pendiente, solo se puede
 * trabajar sobre la placa de esa S60 — inspeccionar, reubicar, desasignar y
 * asignar. Cualquier otra placa queda bloqueada. Al cerrarse, la cabeza pasa a
 * la siguiente.
 *
 * POR QUE: hoy las S60 se regularizan desordenadas y quedan pendientes viejas
 * sin cerrar nunca.
 *
 * LO QUE INVIERTE: hoy el sistema pregunta "quiero hacer un cambio, existe la
 * S60?" (ver poMantenimientoController.desasignarConReemplazo). Esto pregunta
 * al reves: "existe una S60, ya se hizo el cambio?".
 *
 * GRANULARIDAD: la unidad es la LINEA (almacen + comprobante + correlativo), no
 * el documento. Una S60 trae varias lineas — tipicamente 4, el juego completo
 * del vehiculo — y se pueden cerrar de a pocas: 2 hoy y 2 manana. Mientras le
 * queden lineas pendientes, la cabeza no se mueve de esa S60. Dentro de una
 * misma S60 el orden de las lineas no importa.
 *
 * DOS S60 DE LA MISMA PLACA EN DIAS DISTINTOS: solo se habilita la de la
 * cabeza. No se puede aprovechar y cerrar la mas nueva estando ahi. Es
 * estrictamente cronologico.
 *
 * CRITERIOS DE FILTRO: identicos a los de mobileSalidasService y
 * poMantenimientoController.desasignarConReemplazo. Si aca se filtrara
 * distinto, la cola mostraria una S60 que la validacion despues rechaza (o al
 * reves). Cualquier cambio alla tiene que replicarse aca.
 */

/**
 * Desde cuando cuenta la cola, como entero AAAAMMDD.
 *
 * El usuario eligio no arrastrar historia: la tabla NEU_S60_REGULARIZADA nace
 * vacia, asi que todo lo anterior a la activacion aparecería como pendiente
 * aunque ya se haya hecho. Con este corte, lo viejo se da por cerrado y no hace
 * falta ningun backfill.
 *
 * Se configura con COLA_S60_DESDE en el .env. Sin ese valor la cola queda
 * apagada (devuelve siempre "sin pendientes"), que es el estado seguro: nadie
 * se bloquea por una variable mal puesta.
 */
function obtenerFechaCorte() {
  const bruto = process.env.COLA_S60_DESDE;
  if (!bruto) return null;
  const valor = Number(String(bruto).trim());
  if (!Number.isInteger(valor) || valor < 20000101 || valor > 29991231) {
    console.error(`[colaS60Service] COLA_S60_DESDE invalido: "${bruto}". La cola queda apagada.`);
    return null;
  }
  return valor;
}

/**
 * El par llega como texto libre del ERP y hay basura cargada a mano ("SC",
 * "nuevo", "S/N-S/N"). El usuario decidio que esas S60 simplemente NO entran a
 * la cola: si entraran, nadie podria cerrarlas y congelarian el taller para
 * siempre.
 *
 * Mismo criterio que mobileSalidasService: tiene que partir en exactamente dos
 * codigos no vacios.
 */
function partirPar(par) {
  const texto = String(par ?? '').trim();
  const partes = texto.split('-');
  if (partes.length !== 2) return null;
  const entrante = partes[0].trim();
  const saliente = partes[1].trim();
  if (!entrante || !saliente) return null;
  return { par: texto, entrante, saliente };
}

/**
 * El mismo descarte, pero en SQL, para que el ORDER BY y el FETCH FIRST operen
 * ya sobre las lineas utiles. Si se filtrara solo en JS, la cabeza podria caer
 * fuera del limite por culpa de filas que igual se iban a descartar.
 */
const SQL_PAR_VALIDO = `
      AND TRIM(SINVSE.MDDRE7) <> ''
      AND LOCATE('-', TRIM(SINVSE.MDDRE7)) > 1
      AND LOCATE('-', TRIM(SINVSE.MDDRE7)) < LENGTH(TRIM(SINVSE.MDDRE7))
      AND LOCATE('-', TRIM(SINVSE.MDDRE7), LOCATE('-', TRIM(SINVSE.MDDRE7)) + 1) = 0`;

/**
 * Estado en el que tiene que estar el neumatico ENTRANTE para que la linea
 * entre a la cola. Decidido con el usuario el 21-oct-2026: solo DISPONIBLE (1).
 *
 * Ojo: el listado de "neumaticos que puedes montar" de una desasignacion acepta
 * hoy ID_ESTADO 1 o 3 (poNeumaticosDisponiblesController.js). La cola es a
 * proposito mas estricta. El usuario dijo que mas adelante quizas lo cambie;
 * si eso pasa, es esta sola constante.
 */
const ESTADOS_ENTRANTE_VALIDOS = [1];

/**
 * Partir el par dentro del SQL, para poder cruzarlo contra el padron.
 * "65398-64763" -> entrante "65398", saliente "64763".
 */
const SQL_COD_ENTRANTE = `TRIM(LEFT(TRIM(SINVSE.MDDRE7), LOCATE('-', TRIM(SINVSE.MDDRE7)) - 1))`;
const SQL_COD_SALIENTE = `TRIM(SUBSTR(TRIM(SINVSE.MDDRE7), LOCATE('-', TRIM(SINVSE.MDDRE7)) + 1))`;

/**
 * Lineas de S60 todavia no regularizadas, de las placas del usuario, en el
 * orden exacto de la cola.
 *
 * ORDEN: fecha -> hora -> correlativo.
 * - MDFECH es AAAAMMDD numerico y MHHOIN es HHMMSS numerico; se comparan como
 *   numeros, nunca como texto.
 * - MHHOIN esta en la CABECERA, asi que las lineas de una misma S60 comparten
 *   hora: por eso MDCORR es obligatorio como tercer criterio.
 * - Verificado contra produccion el 21-oct-2026 sobre 1.638 filas: este trio no
 *   produce ningun empate, y MHHOIN viene siempre lleno (0 nulos, 0 en cero).
 *
 * UNA LINEA SOLO ENTRA A LA COLA SI ES REALIZABLE (decidido con el usuario el
 * 21-oct-2026). No basta que el par parta en dos: los dos codigos tienen que
 * existir en NEU_PADRON y estar en el estado correcto —
 *   - el ENTRANTE (el nuevo) en estado DISPONIBLE,
 *   - el SALIENTE (el viejo) montado justamente en la placa de esa S60.
 *
 * Por que: "S/N-S/N" si parte en dos codigos no vacios, asi que pasaba el
 * filtro de texto. Ningun neumatico se llama "S/N", de modo que esa linea no se
 * podria cerrar nunca y, al quedar de cabeza, congelaria el taller para
 * siempre. Cruzando contra el padron no hace falta mantener una lista negra: lo
 * que no se puede hacer, no entra.
 *
 * Efecto secundario util: si el cambio ya se hizo, el saliente deja de estar en
 * esa placa y la linea se cae sola de la cola, aunque por algun motivo no haya
 * quedado su fila en NEU_S60_REGULARIZADA.
 */
async function obtenerPendientes(usuario, limite = 50) {
  const codigoUsuario = String(usuario ?? '').trim();
  if (!codigoUsuario) return [];

  const desde = obtenerFechaCorte();
  if (desde === null) return [];

  const estadosEntrante = ESTADOS_ENTRANTE_VALIDOS.join(',');

  const sql = `
    WITH PENDIENTES AS (
    SELECT
      SINVSE.MDALMA        AS ALMACEN,
      SINVSEH.MHCOMP       AS COMPROBANTE,
      SINVSE.MDCORR        AS CORRELATIVO,
      SINVSE.MDFECH        AS FECHA,
      SINVSEH.MHHOIN       AS HORA,
      TRIM(SINVSEH.MHREF3) AS PLACA,
      TRIM(SINVSE.MDDRE7)  AS PAR,
      ${SQL_COD_ENTRANTE}  AS COD_ENTRANTE,
      ${SQL_COD_SALIENTE}  AS COD_SALIENTE,
      TRIM(POPE.DESCRIPCION)  AS OPERACION,
      TRIM(PTALL.DESCRIPCION) AS TALLER
    FROM ${BD_SCHEMA}.TMOVD AS SINVSE
    INNER JOIN ${BD_SCHEMA}.TMOVH AS SINVSEH
      ON SINVSEH.MHCMOV = SINVSE.MDCMOV
     AND SINVSEH.MHTMOV = SINVSE.MDTMOV
     AND SINVSEH.MHALMA = SINVSE.MDALMA
     AND SINVSEH.MHCOMP = SINVSE.MDCOMP
     AND (TRIM(SINVSEH.MHREF6) LIKE '%NEU'
       OR TRIM(SINVSEH.MHREF6) LIKE '%SIN'
       OR TRIM(SINVSEH.MHREF6) LIKE '%COB')
       AND SINVSEH.MHALMA <> '51'
    -- La placa de la S60 tiene que existir y ser del usuario.
    --
    -- Se usa MAE_OPERACION_X_USUARIO, la MISMA tabla con la que
    -- poBuscarVehiculoController decide si una unidad le pertenece. Antes se
    -- filtraba por los talleres de la sesion (MAE_TALLER_X_USUARIO), dando el
    -- rodeo PO_VEHICULO -> PO_OPERACIONES -> PO_TALLER, y eso estaba mal: esa
    -- tabla delimita NEUMATICOS, no placas, y como un taller agrupa VARIAS
    -- operaciones se colaban placas ajenas. Si una quedaba de cabeza, el
    -- usuario no podia abrirla ("la unidad no le pertenece") ni saltar a la
    -- siguiente: la cola se le trancaba.
    --
    -- INNER y no LEFT a proposito: una S60 cuya placa no resuelve dueño no debe
    -- aparecer en la cola de nadie.
    INNER JOIN ${BD_SCHEMA}.PO_VEHICULO VE
      ON TRIM(VE.NUMPLA) = TRIM(SINVSEH.MHREF3)
    INNER JOIN ${BD_SCHEMA}.MAE_OPERACION_X_USUARIO USU
      ON USU.IDOPERACION = VE.SECOPE
     AND TRIM(USU.CH_CODI_USUARIO) = ?
    -- Solo para mostrar los nombres. No filtran.
    LEFT JOIN ${BD_SCHEMA}.PO_OPERACIONES POPE
      ON POPE."ID" = VE.SECOPE
    LEFT JOIN ${BD_SCHEMA}.PO_TALLER PTALL
      ON PTALL."ID" = POPE.IDTLR
    WHERE SINVSE.MDCMOV = 'S'
      AND SINVSE.MDTMOV = '60'
      AND (SINVSE.MDCOAR LIKE '140%' OR SINVSE.MDCOAR LIKE '240%')
      AND SINVSE.MDFECH >= ?

      -- NO se filtra por el taller donde se emitio el vale, a proposito.
      --
      -- Se probo cruzar TRIM(PT.CH_SERI_TALLER) = SUBSTR(MHREF6, 1, 4) contra
      -- los talleres del usuario —que es como lo hace el reporte de neumaticos
      -- despachados— y deja un hueco que no se puede cerrar: si una placa pasa
      -- a otra operacion, su S60 vieja no le aparece a NADIE. Al dueño anterior
      -- lo descarta el filtro de operacion (ya no es su placa) y al nuevo lo
      -- descartaria el de taller (el vale se emitio en el taller del otro). Esa
      -- S60 quedaria pendiente para siempre, sin forma de regularizarla.
      --
      -- Manda quien tiene la placa HOY: es el unico que puede hacer el cambio.
      ${SQL_PAR_VALIDO}
      AND NOT EXISTS (
        SELECT 1
        FROM ${BD_SCHEMA}.NEU_S60_REGULARIZADA R
        WHERE R.S60_ALMACEN     = SINVSE.MDALMA
          AND R.S60_COMPROBANTE = SINVSEH.MHCOMP
          AND R.S60_CORRELATIVO = SINVSE.MDCORR
      )
    )
    SELECT P.*
    FROM PENDIENTES P
    WHERE EXISTS (
        SELECT 1
        FROM ${BD_SCHEMA}.NEU_PADRON NP
        INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
          ON NI.ID_NEUMATICO = NP."ID"
        WHERE TRIM(NP.CODIGO) = P.COD_ENTRANTE
          AND NI.ID_ESTADO IN (${estadosEntrante})
      )
      AND EXISTS (
        SELECT 1
        FROM ${BD_SCHEMA}.NEU_PADRON NP
        INNER JOIN ${BD_SCHEMA}.NEU_INFORMACION NI
          ON NI.ID_NEUMATICO = NP."ID"
        WHERE TRIM(NP.CODIGO) = P.COD_SALIENTE
          AND TRIM(NI.PLACA_ACTUAL) = P.PLACA
      )
    ORDER BY P.FECHA, P.HORA, P.CORRELATIVO
    FETCH FIRST ${Number(limite)} ROWS ONLY
  `;

  // El orden importa: el usuario va en el JOIN, que esta antes que el WHERE
  // donde va la fecha.
  const filas = await db.query(sql, [codigoUsuario, desde]);

  const pendientes = [];
  for (const fila of filas ?? []) {
    // Red de seguridad: el filtro SQL ya descarto los pares invalidos, pero la
    // regla real vive en partirPar() y es la que manda.
    const partido = partirPar(fila.PAR);
    if (!partido) continue;

    pendientes.push({
      almacen: String(fila.ALMACEN ?? '').trim(),
      comprobante: Number(fila.COMPROBANTE),
      correlativo: Number(fila.CORRELATIVO),
      fecha: Number(fila.FECHA),
      hora: Number(fila.HORA),
      placa: String(fila.PLACA ?? '').trim(),
      operacion: String(fila.OPERACION ?? '').trim(),
      taller: String(fila.TALLER ?? '').trim(),
      par: partido.par,
      codigoEntrante: partido.entrante,
      codigoSaliente: partido.saliente,
    });
  }
  return pendientes;
}

/**
 * La S60 de la cabeza, con TODAS sus lineas pendientes.
 *
 * Devuelve null cuando no hay nada pendiente — ese es el estado "libre", en el
 * que no se bloquea nada.
 *
 * Se arma con una sola consulta: como el orden es fecha -> hora -> correlativo
 * y las lineas de un mismo documento comparten fecha y hora, las de la cabeza
 * salen siempre juntas al principio.
 */
async function obtenerCabeza(usuario) {
  const pendientes = await obtenerPendientes(usuario, 50);
  if (pendientes.length === 0) return null;

  const primera = pendientes[0];
  const lineas = pendientes.filter(
    (p) => p.almacen === primera.almacen && p.comprobante === primera.comprobante
  );

  return {
    almacen: primera.almacen,
    comprobante: primera.comprobante,
    fecha: primera.fecha,
    hora: primera.hora,
    placa: primera.placa,
    operacion: primera.operacion,
    taller: primera.taller,
    lineas: lineas.map((l) => ({
      correlativo: l.correlativo,
      par: l.par,
      codigoEntrante: l.codigoEntrante,
      codigoSaliente: l.codigoSaliente,
    })),
  };
}

/**
 * Responde si se puede trabajar una placa.
 *
 * Tres resultados posibles:
 *  - { habilitada: true,  cabeza: null }   -> no hay pendientes, todo libre
 *  - { habilitada: true,  cabeza: {...} }  -> es justo la placa de la cabeza
 *  - { habilitada: false, cabeza: {...} }  -> bloqueada; `cabeza` dice cual toca
 *
 * El estado seguro ante una cola vacia es DEJAR PASAR. Un error de lectura no
 * debe trancar un taller entero.
 */
async function verificarPlacaHabilitada(usuario, placa) {
  const cabeza = await obtenerCabeza(usuario);
  if (!cabeza) return { habilitada: true, cabeza: null };

  const placaPedida = String(placa ?? '').trim().toUpperCase();
  const placaCabeza = cabeza.placa.toUpperCase();

  return { habilitada: placaPedida === placaCabeza, cabeza };
}

/**
 * Busca, entre las lineas pendientes de la cabeza, la que corresponde a un par
 * "entrante-saliente". Devuelve null si ese par no pertenece a la cabeza.
 *
 * Es lo que reemplaza al "existe alguna S60 con este par?" de hoy: ya no basta
 * que la S60 exista en algun lado, tiene que ser una linea pendiente de la S60
 * que toca.
 */
function buscarLineaPorPar(cabeza, codigoEntrante, codigoSaliente) {
  if (!cabeza) return null;
  const entrante = String(codigoEntrante ?? '').trim();
  const saliente = String(codigoSaliente ?? '').trim();
  return (
    cabeza.lineas.find((l) => l.codigoEntrante === entrante && l.codigoSaliente === saliente) ?? null
  );
}

/**
 * El `"ID"` del ultimo movimiento de un neumatico en una placa.
 *
 * Un cambio genera DOS movimientos y la fila de regularizacion guarda los dos:
 * el del neumatico que sale (`CODIGO_SALIENTE` -> columna `ID_MOVIMIENTO`) y el
 * del que entra (`CODIGO_ENTRANTE` -> columna `ID_MOVIMIENTO_ENTRADA`). Con uno
 * solo la fila cuenta media historia.
 *
 * La asimetria de los nombres es historica: `ID_MOVIMIENTO` se creo antes de
 * decidir que se guardarian los dos y la base no acepto renombrarla.
 *
 * Por que se busca en vez de recibirlo: `neumaticoService.registrarMovimiento`
 * hace el INSERT pero no devuelve la identidad que genera la base. Traerla
 * desde alla obligaria a cambiar ese INSERT —que usan montaje, rotacion,
 * inspeccion, recupero y baja— por un `SELECT ... FROM FINAL TABLE (INSERT ...)`.
 * Es la forma correcta en DB2, pero si el driver no lo soporta se cae TODO
 * movimiento del sistema, y esto es un campo de apoyo para auditoria: no vale
 * ese riesgo.
 *
 * Se llama inmediatamente despues del cambio y acotado al codigo y la placa, asi
 * que el ultimo movimiento es el que se acaba de crear. El `ORDER BY` importa:
 * un neumatico pudo estar antes en esa misma placa y tener movimientos viejos.
 *
 * Devuelve null si no lo encuentra — la fila se graba igual, solo sin el enlace.
 */
async function buscarIdUltimoMovimiento(codigoNeumatico, placa) {
  const codigo = String(codigoNeumatico ?? '').trim();
  const placaLimpia = String(placa ?? '').trim();
  if (!codigo || !placaLimpia) return null;

  const sql = `
    SELECT NM."ID" AS ID_MOVIMIENTO
    FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
    INNER JOIN ${BD_SCHEMA}.NEU_PADRON NP
      ON NP."ID" = NM.ID_NEUMATICO
    WHERE TRIM(NP.CODIGO) = ?
      AND TRIM(NM.PLACA)  = ?
    ORDER BY NM."ID" DESC
    FETCH FIRST 1 ROW ONLY
  `;

  try {
    const filas = await db.query(sql, [codigo, placaLimpia]);
    const id = filas?.[0]?.ID_MOVIMIENTO;
    return id === undefined || id === null ? null : Number(id);
  } catch (err) {
    console.warn(
      `[colaS60Service] No se pudo resolver el movimiento de ${codigo} en ${placaLimpia}:`,
      err.message
    );
    return null;
  }
}

/**
 * Marca una linea de S60 como regularizada.
 *
 * La clave primaria es (almacen, comprobante, correlativo), asi que un reintento
 * o un doble clic choca contra la base y no duplica nada. Ese choque NO es un
 * error de negocio: significa que la linea ya estaba cerrada, que es justo el
 * estado al que queriamos llegar. Por eso se devuelve `{ duplicado: true }` en
 * vez de propagar la excepcion.
 */
async function registrarRegularizacion({
  almacen,
  comprobante,
  correlativo,
  fecha,
  hora,
  placa,
  par,
  codigoEntrante,
  codigoSaliente,
  idMovimientoSalida = null,
  idMovimientoEntrada = null,
  taller = null,
  usuario,
}) {
  // OJO con el nombre de la columna: `ID_MOVIMIENTO` es el movimiento de
  // SALIDA (el neumatico que se desmonta). Se iba a renombrar a
  // ID_MOVIMIENTO_SALIDA para que fuera explicito, pero la base no permitio el
  // RENAME COLUMN, asi que quedo con el nombre original. Su pareja si se llama
  // ID_MOVIMIENTO_ENTRADA.
  const sql = `
    INSERT INTO ${BD_SCHEMA}.NEU_S60_REGULARIZADA (
      S60_ALMACEN, S60_COMPROBANTE, S60_CORRELATIVO,
      S60_FECHA, S60_HORA,
      PLACA, PAR, CODIGO_ENTRANTE, CODIGO_SALIENTE,
      ID_MOVIMIENTO, ID_MOVIMIENTO_ENTRADA, TALLER, USUARIO
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    String(almacen).trim(),
    Number(comprobante),
    Number(correlativo),
    Number(fecha),
    Number(hora),
    String(placa).trim(),
    String(par).trim(),
    String(codigoEntrante).trim(),
    String(codigoSaliente).trim(),
    idMovimientoSalida ?? null,
    idMovimientoEntrada ?? null,
    taller ? String(taller).trim() : null,
    String(usuario ?? 'SISTEMA').trim(),
  ];

  try {
    await db.query(sql, params);
    return { registrado: true, duplicado: false };
  } catch (err) {
    const texto = String(err?.message ?? '');
    // SQL0803 = clave duplicada en DB2 for i.
    if (texto.includes('SQL0803') || /duplicate key/i.test(texto)) {
      console.warn(
        `[colaS60Service] S60 ${almacen}-${comprobante}-${correlativo} ya estaba regularizada.`
      );
      return { registrado: false, duplicado: true };
    }
    throw err;
  }
}

/**
 * El codigo del usuario de la sesion web.
 *
 * Es lo unico que necesita la cola: las placas salen de
 * MAE_OPERACION_X_USUARIO cruzando por este codigo. Si viene vacio la cola sale
 * vacia y no se bloquea nada — trancar a alguien por un dato de configuracion
 * que falta es peor que dejarlo pasar.
 */
function usuarioDeSesion(sessionUser) {
  return String(sessionUser?.usuario ?? '').trim();
}

/** `20261021` -> `21/10/2026`, para los mensajes que ve el tecnico. */
function formatearFecha(fecha) {
  const texto = String(fecha ?? '');
  if (!/^\d{8}$/.test(texto)) return texto;
  return `${texto.slice(6, 8)}/${texto.slice(4, 6)}/${texto.slice(0, 4)}`;
}

/**
 * `94226` -> `09:42:26`.
 *
 * MHHOIN es HHMMSS numerico, asi que las horas de un digito pierden el cero de
 * adelante. Sin rellenar a 6, "94226" se leeria como "94:22:6".
 */
function formatearHora(hora) {
  const texto = String(hora ?? '').padStart(6, '0');
  if (!/^\d{6}$/.test(texto)) return '';
  return `${texto.slice(0, 2)}:${texto.slice(2, 4)}:${texto.slice(4, 6)}`;
}

/**
 * El texto que ve el tecnico cuando intenta trabajar una placa bloqueada.
 * Tiene que decirle que hacer, no solo que no puede.
 */
function mensajeBloqueo(cabeza) {
  if (!cabeza) return null;
  const cuando = `${formatearFecha(cabeza.fecha)} ${formatearHora(cabeza.hora)}`.trim();
  return (
    `Primero hay que regularizar la S60 pendiente mas antigua: placa ${cabeza.placa} ` +
    `(${cuando}), ${cabeza.lineas.length} ${cabeza.lineas.length === 1 ? 'cambio' : 'cambios'} por hacer. ` +
    `Hasta completarla no se puede trabajar en otra placa.`
  );
}

/**
 * Guardia compartido por los cuatro flujos (inspeccion, reubicacion,
 * desasignacion y asignacion).
 *
 * Esta en un solo lugar a proposito: copiado cuatro veces, basta que alguien
 * toque uno para que la regla deje de aplicar igual en todos. Es el mismo error
 * que ya nos costo caro con las listas de posiciones hardcodeadas.
 *
 * Devuelve null cuando se puede seguir, o un objeto { status, body } listo para
 * responder cuando no.
 */
async function bloquearSiPlacaNoHabilitada(sessionUser, placa) {
  const usuario = usuarioDeSesion(sessionUser);
  const { habilitada, cabeza } = await verificarPlacaHabilitada(usuario, placa);
  if (habilitada) return null;

  return {
    status: 409,
    body: {
      error: 'S60 pendiente',
      detalle: mensajeBloqueo(cabeza),
      colaS60: {
        placaHabilitada: cabeza.placa,
        fecha: cabeza.fecha,
        hora: cabeza.hora,
        lineasPendientes: cabeza.lineas.length,
      },
    },
  };
}

module.exports = {
  obtenerPendientes,
  obtenerCabeza,
  verificarPlacaHabilitada,
  buscarLineaPorPar,
  buscarIdUltimoMovimiento,
  registrarRegularizacion,
  bloquearSiPlacaNoHabilitada,
  usuarioDeSesion,
  mensajeBloqueo,
  partirPar,
  obtenerFechaCorte,
  formatearFecha,
  formatearHora,
};
