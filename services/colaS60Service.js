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
 * Usuarios a los que la cola NO les aplica (decidido el 09-nov-2026).
 *
 * Administracion necesita poder registrar sobre cualquier vehiculo en cualquier
 * momento — entre otras cosas, para destrabar colas mal armadas. Para ellos la
 * cola existe como informacion, no como candado. Para todos los demas sigue
 * siendo obligatoria y en orden cronologico.
 *
 * Revierte el "sin excepciones por perfil" que se habia acordado el
 * 21-oct-2026.
 *
 * OJO: esta misma lista esta en el front, en
 * src/hooks/use-cola-s60.tsx (USUARIOS_SIN_COLA_S60), para que los botones no
 * salgan deshabilitados. Si se agrega o quita a alguien, hay que tocar los dos
 * lados: el front decide que se ve, este decide que se puede. La autoridad es
 * esta; el front sin actualizar solo molesta, no rompe nada.
 */
const USUARIOS_SIN_COLA_S60 = ['GESNEU', 'EGAMBOA'];

/** Si este usuario esta exceptuado. Compara sin espacios ni mayusculas. */
function esUsuarioExento(usuario) {
  const codigo = String(usuario ?? '').trim().toUpperCase();
  if (!codigo) return false;
  return USUARIOS_SIN_COLA_S60.includes(codigo);
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
  if (!cabeza) return { habilitada: true, cabeza: null, exento: esUsuarioExento(usuario) };

  // A los exceptuados se les devuelve la cabeza igual —la pantalla la muestra
  // como aviso— pero habilitada, porque para ellos no bloquea.
  if (esUsuarioExento(usuario)) return { habilitada: true, cabeza, exento: true };

  const placaPedida = String(placa ?? '').trim().toUpperCase();
  const placaCabeza = cabeza.placa.toUpperCase();

  return { habilitada: placaPedida === placaCabeza, cabeza, exento: false };
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

/* =====================================================================
 * Reporte de cambio de neumaticos
 *
 * Una S60 regularizada es, en la practica, el acta de un cambio: dice que
 * neumatico salio y cual entro, en que placa y cuando. Eso es justo lo que
 * pide el formato FR-OP-03 que hoy se llena a mano.
 *
 * La cabecera (almacen, comprobante, fecha, hora, placa, taller) sale de
 * NEU_S60_REGULARIZADA tal cual. Lo demas —marca, medida, diseño, posicion,
 * remanente, presion— se trae por los dos enlaces al movimiento que esa
 * misma fila guarda.
 *
 * OJO con los enlaces: ID_MOVIMIENTO e ID_MOVIMIENTO_ENTRADA pueden venir
 * NULL. `registrarRegularizacion` graba la fila igual aunque no resuelva el
 * movimiento, a proposito, para no perder la regularizacion. Por eso cada
 * dato del neumatico se busca primero por el movimiento y, si no hay, por el
 * codigo contra el padron: asi el reporte sale con marca y medida aunque el
 * enlace falte. Lo que no se puede recuperar sin movimiento es lo medido en
 * el momento (remanente, presion), que queda vacio para llenar a mano.
 * ===================================================================== */

/**
 * Tipo de vehiculo segun PO_VEHICULO.RECMEN2.
 *
 * Es el dato que va en la casilla "Vehiculo" del reporte de cambio. Ojo: NO
 * es el mismo catalogo que el campo TIPO que devuelve la busqueda de placas
 * (ese sale de PO_TIPO.DESCRIPCION). Aqui manda RECMEN2, que es lo que pidio
 * el usuario para el formato.
 */
const TIPOS_VEHICULO = {
  1: 'PICK-UP 4x4',
  2: 'PICK-UP 4x2',
  3: 'SUV',
  4: 'SEDÁN',
  5: 'CAMION',
  6: 'MOTOCICLETA',
  7: 'MINIBUS',
  8: 'FURGONETA/VAN',
  9: 'EQUIPO INDUSTRIAL',
  10: 'DEPORTIVO COUPÉ',
};

/**
 * "09:00 AM" a partir de la hora y el minuto sueltos de la O.T.
 *
 * El formato en papel se llena en 12 horas con AM/PM, asi que se imprime
 * igual. Si la O.T. no tiene la fecha cargada, devuelve null y la casilla
 * sale vacia para escribirla a mano.
 */
function horaDesdeHM(hora, minuto) {
  if (hora === null || hora === undefined) return null;
  const h = Number(hora);
  const m = Number(minuto ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const sufijo = h < 12 ? 'AM' : 'PM';
  // 0 h es 12 AM y 12 h es 12 PM: el modulo solo no lo resuelve.
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** El nombre si se pudo resolver; si no, el codigo; si no hay nada, null. */
function nombreODigo(codigo, mapa) {
  const cod = codigo ? String(codigo).trim() : '';
  if (cod === '') return null;
  return mapa.get(cod) ?? cod;
}

/**
 * Nombres de mecanicos y supervisores, a partir de sus codigos.
 *
 * Se hace en una consulta aparte y no con JOINs en la consulta grande para
 * no tener que concatenar nombre y apellidos en SQL. Son pocos codigos por
 * reporte, asi que el costo es despreciable.
 *
 * Devuelve dos mapas codigo -> nombre. Un codigo que no resuelva no aparece
 * en el mapa, y quien llama imprime el codigo tal cual: mas vale "RQUISPE"
 * que una casilla vacia.
 */
async function resolverNombres(codigosMecanico, codigosSupervisor) {
  const mecanicos = new Map();
  const supervisores = new Map();

  const unicos = (lista) =>
    [...new Set(lista.filter((c) => c && String(c).trim() !== '').map((c) => String(c).trim()))];

  const codMec = unicos(codigosMecanico);
  const codSup = unicos(codigosSupervisor);

  if (codMec.length > 0) {
    const marcas = codMec.map(() => '?').join(', ');
    const filas = await db.query(
      `SELECT TRIM(CH_CODI_MECANICO) AS COD, TRIM(VC_NOMB_MECANICO) AS NOMBRE
         FROM ${BD_SCHEMA}.GM_MMECANICO
        WHERE TRIM(CH_CODI_MECANICO) IN (${marcas})`,
      codMec
    );
    for (const f of filas ?? []) {
      if (f.NOMBRE && String(f.NOMBRE).trim() !== '') {
        mecanicos.set(String(f.COD).trim(), String(f.NOMBRE).trim());
      }
    }
  }

  if (codSup.length > 0) {
    const marcas = codSup.map(() => '?').join(', ');
    const filas = await db.query(
      `SELECT TRIM(CH_CODI_USUARIO)       AS COD,
              TRIM(VC_DESC_NOMB_USUARIO)  AS NOMBRE,
              TRIM(VC_DESC_APELL_PATERNO) AS PATERNO,
              TRIM(VC_DESC_APELL_MATERNO) AS MATERNO
         FROM ${BD_SCHEMA}.MAE_USUARIO
        WHERE TRIM(CH_CODI_USUARIO) IN (${marcas})`,
      codSup
    );
    for (const f of filas ?? []) {
      const nombre = [f.NOMBRE, f.PATERNO, f.MATERNO]
        .map((p) => (p ? String(p).trim() : ''))
        .filter((p) => p !== '')
        .join(' ');
      if (nombre !== '') supervisores.set(String(f.COD).trim(), nombre);
    }
  }

  return { mecanicos, supervisores };
}

/**
 * Lineas regularizadas de una placa, con todo lo que necesita el reporte.
 * Una fila por linea de S60; agruparlas es trabajo de quien llama.
 */
async function listarRegularizadasPorPlaca(placa) {
  const placaLimpia = String(placa ?? '').trim();
  if (!placaLimpia) return [];

  const sql = `
    SELECT
      R.S60_ALMACEN                AS ALMACEN,
      R.S60_COMPROBANTE            AS COMPROBANTE,
      R.S60_CORRELATIVO            AS CORRELATIVO,
      R.S60_FECHA                  AS FECHA,
      R.S60_HORA                   AS HORA,
      TRIM(R.PLACA)                AS PLACA,
      TRIM(R.PAR)                  AS PAR,
      TRIM(R.CODIGO_ENTRANTE)      AS CODIGO_ENTRANTE,
      TRIM(R.CODIGO_SALIENTE)      AS CODIGO_SALIENTE,
      R.TALLER                     AS TALLER,
      R.USUARIO                    AS USUARIO,
      -- Los enlaces al movimiento: sirven de ancla para reconstruir como
      -- quedo el vehiculo justo despues del cambio.
      R.ID_MOVIMIENTO              AS ID_MOV_SALIDA,
      R.ID_MOVIMIENTO_ENTRADA      AS ID_MOV_ENTRADA,
      TRIM(H.MHREF6)               AS OT,
      VE.RECMEN2                   AS TIPO_VEHICULO_COD,

      -- Mecanico y supervisor de la orden de trabajo.
      --
      -- El camino es largo: la O.T. (TMOVH.MHREF6) se busca en
      -- PO_TEMPREGTAB.OT, de ahi sale IDOTGM, que es la clave de GM_HOT
      -- (NU_CODI_OT), y es GM_HOT quien guarda los dos codigos.
      --
      -- Van como subconsultas escalares y NO como JOIN a proposito: una
      -- misma O.T. puede tener mas de una fila en PO_TEMPREGTAB, y un JOIN
      -- multiplicaria las lineas de la S60. El FETCH FIRST garantiza una.
      -- Aqui solo salen los CODIGOS; los nombres se resuelven despues, en
      -- una consulta aparte, para no armar concatenaciones en SQL.
      (SELECT TRIM(HOT.CH_CODI_MECANICO)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS COD_MECANICO,
      (SELECT TRIM(HOT.CH_CODI_USUA_CALI)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS COD_SUPERVISOR_OT,

      -- Horas de entrada y salida del taller, de la misma O.T.
      --
      -- DT_FECH_INIC_OT y DT_FECH_FINA_OT son fecha + hora, y en el formato
      -- solo va la hora. Se piden HOUR y MINUTE por separado, como enteros,
      -- en vez de formatear en SQL: asi no depende de como el driver
      -- entregue un timestamp ni de la zona horaria del job, que es
      -- justamente lo que ya nos corrio un dia las fechas del backend.
      (SELECT HOUR(HOT.DT_FECH_INIC_OT)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS HORA_INGRESO_H,
      (SELECT MINUTE(HOT.DT_FECH_INIC_OT)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS HORA_INGRESO_M,
      (SELECT HOUR(HOT.DT_FECH_FINA_OT)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS HORA_SALIDA_H,
      (SELECT MINUTE(HOT.DT_FECH_FINA_OT)
         FROM ${BD_SCHEMA}.PO_TEMPREGTAB TR
         INNER JOIN ${BD_SCHEMA}.GM_HOT HOT ON HOT.NU_CODI_OT = TR.IDOTGM
        WHERE TRIM(TR.OT) = TRIM(H.MHREF6)
        FETCH FIRST 1 ROW ONLY)   AS HORA_SALIDA_M,

      -- El que sale
      MS.POSICION_ANTERIOR         AS POSICION_SALIDA,
      MS.REMANENTE_MEDIDO          AS REMANENTE_SALIDA,
      MS.PRESION_MEDIDA            AS PRESION_SALIDA,
      MS.ODOMETRO_VEHICULO         AS ODOMETRO,
      MS.KM_RECORRIDOS_ETAPA       AS KM_ETAPA,
      MS.OBS                       AS OBSERVACION,
      MS.TIPO_BAJA                 AS TIPO_BAJA,
      NA.DESCRIPCION               AS ACCION_SALIDA,
      COALESCE(PS.DISENO, PSC.DISENO)  AS DISENO_SALIDA,
      COALESCE(PS.MEDIDA, PSC.MEDIDA)  AS MEDIDA_SALIDA,
      COALESCE(KS.MARCA,  KSC.MARCA)   AS MARCA_SALIDA,

      -- El que entra
      ME.POSICION_NUEVA            AS POSICION_ENTRADA,
      ME.REMANENTE_MEDIDO          AS REMANENTE_ENTRADA,
      ME.PRESION_MEDIDA            AS PRESION_ENTRADA,
      ME.TORQUE_APLICADO           AS TORQUE_ENTRADA,
      COALESCE(PE.DISENO, PEC.DISENO)  AS DISENO_ENTRADA,
      COALESCE(PE.MEDIDA, PEC.MEDIDA)  AS MEDIDA_ENTRADA,
      COALESCE(KE.MARCA,  KEC.MARCA)   AS MARCA_ENTRADA

    FROM ${BD_SCHEMA}.NEU_S60_REGULARIZADA R

    -- La orden de trabajo vive en la CABECERA de la S60 en el ERP, no en
    -- NEU_S60_REGULARIZADA: TMOVH.MHREF6. Es el mismo campo con el que la
    -- cola filtra las S60 de neumaticos (LIKE '%NEU' / '%SIN' / '%COB'), asi
    -- que llega con ese sufijo pegado; se imprime tal cual.
    --
    -- MHTMOV = 60 y MHCMOV = 'S' son lo que identifica a una S60. LEFT y no
    -- INNER: si la cabecera no aparece, el reporte sale igual con la casilla
    -- de O.T. vacia.
    LEFT JOIN ${BD_SCHEMA}.TMOVH H
      ON H.MHALMA = TRIM(R.S60_ALMACEN)
     AND H.MHCOMP = R.S60_COMPROBANTE
     AND H.MHTMOV = '60'
     AND H.MHCMOV = 'S'

    -- El tipo de vehiculo sale de PO_VEHICULO.RECMEN2, por placa. Se
    -- devuelve el numero crudo: el nombre se arma en JS (ver TIPOS_VEHICULO)
    -- para no meter acentos en el SQL.
    LEFT JOIN ${BD_SCHEMA}.PO_VEHICULO VE
      ON TRIM(VE.NUMPLA) = TRIM(R.PLACA)

    -- Movimiento de salida (el que se desmonta) y su neumatico
    LEFT JOIN ${BD_SCHEMA}.NEU_MOVIMIENTOS MS ON MS."ID"      = R.ID_MOVIMIENTO
    LEFT JOIN ${BD_SCHEMA}.NEU_ACCION      NA ON NA.ID_ACCION = MS.ID_ACCION
    LEFT JOIN ${BD_SCHEMA}.NEU_PADRON      PS ON PS."ID"      = MS.ID_NEUMATICO
    LEFT JOIN ${BD_SCHEMA}.NEU_MARCA       KS ON KS.ID_MARCA  = PS.ID_MARCA

    -- Movimiento de entrada (el que se monta) y su neumatico
    LEFT JOIN ${BD_SCHEMA}.NEU_MOVIMIENTOS ME ON ME."ID"      = R.ID_MOVIMIENTO_ENTRADA
    LEFT JOIN ${BD_SCHEMA}.NEU_PADRON      PE ON PE."ID"      = ME.ID_NEUMATICO
    LEFT JOIN ${BD_SCHEMA}.NEU_MARCA       KE ON KE.ID_MARCA  = PE.ID_MARCA

    -- Respaldo por codigo, para las filas que quedaron sin enlace
    LEFT JOIN ${BD_SCHEMA}.NEU_PADRON     PSC ON TRIM(PSC.CODIGO) = TRIM(R.CODIGO_SALIENTE)
    LEFT JOIN ${BD_SCHEMA}.NEU_MARCA      KSC ON KSC.ID_MARCA     = PSC.ID_MARCA
    LEFT JOIN ${BD_SCHEMA}.NEU_PADRON     PEC ON TRIM(PEC.CODIGO) = TRIM(R.CODIGO_ENTRANTE)
    LEFT JOIN ${BD_SCHEMA}.NEU_MARCA      KEC ON KEC.ID_MARCA     = PEC.ID_MARCA

    WHERE TRIM(R.PLACA) = ?
    ORDER BY R.S60_FECHA DESC, R.S60_HORA DESC, R.S60_COMPROBANTE DESC, R.S60_CORRELATIVO ASC
  `;

  const filas = await db.query(sql, [placaLimpia]);
  return Array.isArray(filas) ? filas : [];
}

/**
 * Lo mismo, ya agrupado: un elemento por S60 (almacen + comprobante) con sus
 * lineas adentro. Un reporte es una S60 entera, no una linea suelta.
 */
async function listarReportesCambioPorPlaca(placa) {
  const filas = await listarRegularizadasPorPlaca(placa);
  const { mecanicos, supervisores } = await resolverNombres(
    filas.map((f) => f.COD_MECANICO),
    filas.map((f) => f.COD_SUPERVISOR_OT)
  );
  const porS60 = new Map();

  for (const f of filas) {
    const clave = `${String(f.ALMACEN ?? '').trim()}-${Number(f.COMPROBANTE)}`;

    if (!porS60.has(clave)) {
      porS60.set(clave, {
        clave,
        almacen: String(f.ALMACEN ?? '').trim(),
        comprobante: Number(f.COMPROBANTE),
        fecha: Number(f.FECHA),
        hora: Number(f.HORA),
        fechaTexto: formatearFecha(f.FECHA),
        horaTexto: formatearHora(f.HORA),
        placa: String(f.PLACA ?? '').trim(),
        taller: f.TALLER ? String(f.TALLER).trim() : null,
        usuario: f.USUARIO ? String(f.USUARIO).trim() : null,
        // Orden de trabajo: viene de la cabecera de la S60 en el ERP.
        ot: f.OT && String(f.OT).trim() !== '' ? String(f.OT).trim() : null,
        // Un RECMEN2 que no este en el catalogo deja la casilla vacia, en
        // vez de imprimir un numero suelto que nadie sabe leer.
        tipoVehiculo: TIPOS_VEHICULO[Number(f.TIPO_VEHICULO_COD)] ?? null,
        // Quienes firman. Si el nombre no resuelve se imprime el codigo:
        // "RQUISPE" dice mas que una casilla en blanco.
        mecanico: nombreODigo(f.COD_MECANICO, mecanicos),
        supervisor: nombreODigo(f.COD_SUPERVISOR_OT, supervisores),
        // Entrada y salida del taller, de la O.T.: solo la hora.
        horaIngreso: horaDesdeHM(f.HORA_INGRESO_H, f.HORA_INGRESO_M),
        horaSalida: horaDesdeHM(f.HORA_SALIDA_H, f.HORA_SALIDA_M),
        // Odometro y observacion son del cambio, no de cada linea: se toma
        // el primero que venga con valor.
        odometro: null,
        observacion: null,
        lineas: [],
      });
    }

    const s60 = porS60.get(clave);

    if (s60.odometro === null && f.ODOMETRO !== null && f.ODOMETRO !== undefined) {
      s60.odometro = Number(f.ODOMETRO);
    }
    if (!s60.observacion && f.OBSERVACION && String(f.OBSERVACION).trim() !== '') {
      s60.observacion = String(f.OBSERVACION).trim();
    }

    s60.lineas.push({
      correlativo: Number(f.CORRELATIVO),
      par: String(f.PAR ?? '').trim(),
      idMovimientoSalida: f.ID_MOV_SALIDA ?? null,
      idMovimientoEntrada: f.ID_MOV_ENTRADA ?? null,
      // Sale del movimiento. Sin enlace queda null y el reporte la imprime
      // vacia, para escribirla a mano.
      posicion: f.POSICION_SALIDA ?? f.POSICION_ENTRADA ?? null,
      sale: {
        codigo: String(f.CODIGO_SALIENTE ?? '').trim(),
        marca: f.MARCA_SALIDA ?? null,
        medida: f.MEDIDA_SALIDA ?? null,
        diseno: f.DISENO_SALIDA ?? null,
        remanente: f.REMANENTE_SALIDA ?? null,
        presion: f.PRESION_SALIDA ?? null,
        posicion: f.POSICION_SALIDA ?? null,
        accion: f.ACCION_SALIDA ?? null,
        tipoBaja: f.TIPO_BAJA ?? null,
        kmEtapa: f.KM_ETAPA ?? null,
      },
      entra: {
        codigo: String(f.CODIGO_ENTRANTE ?? '').trim(),
        marca: f.MARCA_ENTRADA ?? null,
        medida: f.MEDIDA_ENTRADA ?? null,
        diseno: f.DISENO_ENTRADA ?? null,
        remanente: f.REMANENTE_ENTRADA ?? null,
        presion: f.PRESION_ENTRADA ?? null,
        torque: f.TORQUE_ENTRADA ?? null,
        posicion: f.POSICION_ENTRADA ?? null,
      },
    });
  }

  return Array.from(porS60.values());
}

/**
 * Como quedo el vehiculo justo despues de un cambio.
 *
 * El formato de papel lista arriba el JUEGO COMPLETO que queda montado —los
 * que entraron y los que nadie toco— y abajo solo los retirados. Eso no esta
 * guardado en ningun lado: hay que reconstruirlo del historial.
 *
 * LA REGLA: se mira NEUMATICO por NEUMATICO, no posicion por posicion. De
 * cada neumatico que paso por la placa se toma su ultimo movimiento hasta el
 * del cambio, y esta montado solo si ese movimiento TERMINO en una posicion
 * (POSICION_NUEVA con valor). Las convenciones de NEU_MOVIMIENTOS lo
 * permiten:
 *
 *   montaje      -> POSICION_ANTERIOR null,  POSICION_NUEVA = la posicion
 *   desmontaje   -> POSICION_ANTERIOR = pos, POSICION_NUEVA NULL
 *   rotacion     -> ANTERIOR = de donde salio, NUEVA = a donde fue
 *   inspeccion   -> las dos iguales
 *
 * POR QUE NO POR POSICION: una PERMUTA entre dos posiciones se graba como
 * dos rotaciones seguidas, y la segunda sale de la posicion donde la primera
 * acababa de dejar un neumatico:
 *
 *   id 23359  POS03 -> RES01   neumatico A
 *   id 23360  RES01 -> POS03   neumatico B
 *
 * Mirando RES01, su ultimo movimiento (23360) SALE de RES01, asi que la
 * posicion parecia vacia y el repuesto desaparecia del reporte. Pasa de
 * verdad: placa CFE-927, S60 35-36583. Mirando el neumatico A, su ultimo
 * movimiento termina en RES01 y no hay nada que interpretar.
 *
 * Si dos neumaticos reclamaran la misma posicion —solo posible con el
 * historial roto— gana el movimiento mas reciente.
 *
 * ES UNA RECONSTRUCCION, no un dato guardado: si al historial le falta un
 * movimiento, aqui sale una posicion de mas o de menos. Por eso quien arma
 * el reporte pisa este resultado con los entrantes de la S60, que si son
 * dato cierto.
 */
async function obtenerMontadosAlMomento(placa, idMovimientoAncla) {
  const placaLimpia = String(placa ?? '').trim();
  const ancla = Number(idMovimientoAncla);
  if (!placaLimpia || !Number.isFinite(ancla) || ancla <= 0) return [];

  const sql = `
    WITH MOV AS (
      SELECT NM."ID"              AS ID_MOV,
             NM.ID_NEUMATICO      AS ID_NEU,
             NM.POSICION_NUEVA    AS POS_NUE,
             TRIM(PA.CODIGO)      AS CODIGO,
             NM.REMANENTE_MEDIDO  AS REMANENTE,
             NM.PRESION_MEDIDA    AS PRESION,
             PA.DISENO            AS DISENO,
             PA.MEDIDA            AS MEDIDA,
             MK.MARCA             AS MARCA
      FROM ${BD_SCHEMA}.NEU_MOVIMIENTOS NM
      LEFT JOIN ${BD_SCHEMA}.NEU_PADRON PA ON PA."ID"     = NM.ID_NEUMATICO
      LEFT JOIN ${BD_SCHEMA}.NEU_MARCA  MK ON MK.ID_MARCA = PA.ID_MARCA
      WHERE TRIM(NM.PLACA) = ?
        AND NM."ID" <= ?
        AND NM.ID_NEUMATICO IS NOT NULL
    ),
    ULTIMO_DEL_NEUMATICO AS (
      SELECT M.*, ROW_NUMBER() OVER (PARTITION BY M.ID_NEU ORDER BY M.ID_MOV DESC) AS RN
      FROM MOV M
    ),
    MONTADOS AS (
      SELECT TRIM(POS_NUE) AS POSICION, ID_MOV, CODIGO, REMANENTE, PRESION, DISENO, MEDIDA, MARCA
      FROM ULTIMO_DEL_NEUMATICO
      WHERE RN = 1
        AND POS_NUE IS NOT NULL
        AND TRIM(POS_NUE) <> ''
    ),
    UNO_POR_POSICION AS (
      SELECT P.*, ROW_NUMBER() OVER (PARTITION BY P.POSICION ORDER BY P.ID_MOV DESC) AS RN_POS
      FROM MONTADOS P
    )
    SELECT POSICION, CODIGO, MARCA, MEDIDA, DISENO, REMANENTE, PRESION
    FROM UNO_POR_POSICION
    WHERE RN_POS = 1
    ORDER BY POSICION
  `;

  try {
    const filas = await db.query(sql, [placaLimpia, ancla]);
    return (filas ?? []).map((f) => ({
      posicion: String(f.POSICION ?? '').trim(),
      codigo: String(f.CODIGO ?? '').trim(),
      marca: f.MARCA ?? null,
      medida: f.MEDIDA ?? null,
      diseno: f.DISENO ?? null,
      remanente: f.REMANENTE ?? null,
      presion: f.PRESION ?? null,
    }));
  } catch (err) {
    // Si la reconstruccion falla, el reporte sale igual con los entrantes de
    // la S60. Perder el juego completo es malo; perder el reporte es peor.
    console.warn(
      `[colaS60Service] No se pudo reconstruir el montaje de ${placaLimpia} hasta el movimiento ${ancla}:`,
      err.message
    );
    return [];
  }
}

/**
 * Un reporte concreto, con el juego completo que quedo montado.
 *
 * Es aparte de `listarReportesCambioPorPlaca` a proposito: la reconstruccion
 * cuesta una consulta por S60 y la lista no la necesita. Se calcula solo
 * para la que el usuario manda a imprimir.
 */
async function obtenerReporteCambio(placa, almacen, comprobante) {
  const reportes = await listarReportesCambioPorPlaca(placa);
  const buscado = reportes.find(
    (r) => r.almacen === String(almacen).trim() && r.comprobante === Number(comprobante)
  );
  if (!buscado) return null;

  // El ancla es el movimiento mas alto de esta S60. Se prefiere el de
  // entrada —el montaje— porque el juego completo se mira DESPUES del
  // cambio; si falta ese enlace, sirve el de salida.
  const ancla = buscado.lineas.reduce((mayor, l) => {
    const id = Number(l.idMovimientoEntrada ?? l.idMovimientoSalida ?? 0);
    return Number.isFinite(id) && id > mayor ? id : mayor;
  }, 0);

  buscado.montados = await obtenerMontadosAlMomento(buscado.placa, ancla);
  return buscado;
}

module.exports = {
  obtenerPendientes,
  esUsuarioExento,
  obtenerCabeza,
  verificarPlacaHabilitada,
  listarRegularizadasPorPlaca,
  listarReportesCambioPorPlaca,
  obtenerReporteCambio,
  obtenerMontadosAlMomento,
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
