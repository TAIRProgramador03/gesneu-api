// neumaticosAsignacionMasivaService.js
const XLSX = require('xlsx');
const { randomUUID } = require('crypto');

const CONFIG = {
  POSICIONES_VALIDAS: ['POS01', 'POS02', 'POS03', 'POS04', 'RES01'],
  POSICION_REPUESTO: 'RES01',
  MAX_POSICIONES_POR_PLACA: 5,

  // AJUSTAR según política real
  REMANENTE_MIN: 4.0,
  REMANENTE_MAX: 20.0,
  PRESION_MIN: 25,
  PRESION_MAX: 35,
  TORQUE_MIN: 110,
  TORQUE_MAX: 150,

  ID_ACCION_MONTAJE: 2,
  ID_ESTADO_DISPONIBLE: 1,
  ID_ESTADO_ASIGNADO: 2,

  // KILOMETRAJE de asignación: debe ser mayor al último registrado en
  // PO_TEMPREGTAB para el vehículo, y menor a (ese + este incremento).
  KILOMETRAJE_MAX_INCREMENTO: 25000,

  COD_SUPERVISOR: 'E01820',

  // FECHA_ASIGNACION válida: hoy y hasta N días atrás (N=3 → 4 fechas en total,
  // incluyendo hoy).
  VENTANA_DIAS_ATRAS: 3,
};

// DB2/ODBC puede devolver las columnas en mayúsculas o minúsculas según el
// driver. Este helper evita el problema (mismo patrón que ya usas con
// `result[0].cantidad || result[0].CANTIDAD`).
function campo(row, nombre) {
  return row[nombre] ?? row[nombre.toUpperCase()] ?? row[nombre.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------
// Lectura de Excel
// ---------------------------------------------------------------------
function leerExcelAsignacion(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: null, raw: false });

  return filas.map((f, idx) => ({
    _fila: idx + 2,
    PLACA: normalizarTexto(f.PLACA),
    KILOMETRAJE: toNumberOrNull(f.KILOMETRAJE),
    CODIGO: normalizarTexto(f.CODIGO),
    POSICION: normalizarTexto(f.POSICION),
    REMANENTE: toNumberOrNull(f.REMANENTE),
    PRESION: toNumberOrNull(f.PRESION),
    TORQUE: toNumberOrNull(f.TORQUE),
    FECHA_ASIGNACION: parseFecha(f.FECHA_ASIGNACION),
  }));
}

function normalizarTexto(v) {
  if (v === null || v === undefined) return null;
  return String(v).trim().toUpperCase();
}
function toNumberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? NaN : n;
}
function parseFecha(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// El driver ODBC de IBM i no acepta objetos Date de JS como parámetro:
// hay que formatearlos a string antes de hacer bind (mismo patrón que
// formatDate/formatTimestamp en poInspeccionController.js).
function formatDateParam(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatTimestampParam(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
// Resta días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'.
// Formato ISO → comparable con < / > como string.
function restarDiasParam(fechaISO, dias) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - dias);
  return formatDateParam(dt);
}

// ---------------------------------------------------------------------
// Generar plantilla vacía
// ---------------------------------------------------------------------
function generarPlantillaBuffer() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['PLACA', 'KILOMETRAJE', 'CODIGO', 'POSICION', 'REMANENTE', 'PRESION', 'TORQUE', 'FECHA_ASIGNACION'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ---------------------------------------------------------------------
// Validación estructural (sin BD) — por fila
// ---------------------------------------------------------------------
function validarFilaEstructura(fila) {
  const errores = [];

  if (!fila.PLACA) errores.push('PLACA vacía o inválida');
  if (!fila.CODIGO) errores.push('CODIGO vacío o inválido');

  if (fila.KILOMETRAJE === null || Number.isNaN(fila.KILOMETRAJE)) {
    errores.push('KILOMETRAJE vacío o no numérico');
  } else if (fila.KILOMETRAJE < 0) {
    errores.push('KILOMETRAJE no puede ser negativo');
  }

  if (!fila.POSICION) {
    errores.push('POSICION vacía');
  } else if (!CONFIG.POSICIONES_VALIDAS.includes(fila.POSICION)) {
    errores.push(`POSICION "${fila.POSICION}" no está en el catálogo permitido`);
  }

  if (fila.REMANENTE === null || Number.isNaN(fila.REMANENTE)) {
    errores.push('REMANENTE vacío o no numérico');
  } else if (fila.REMANENTE < CONFIG.REMANENTE_MIN || fila.REMANENTE > CONFIG.REMANENTE_MAX) {
    errores.push(`REMANENTE ${fila.REMANENTE}mm fuera de rango (${CONFIG.REMANENTE_MIN}-${CONFIG.REMANENTE_MAX}mm)`);
  }

  // PRESION es obligatoria y validada IGUAL para todas las posiciones,
  // incluyendo RES01 (repuesto también debe estar con presión correcta)
  if (fila.PRESION === null || Number.isNaN(fila.PRESION)) {
    errores.push('PRESION vacía o no numérica');
  } else if (fila.PRESION < CONFIG.PRESION_MIN || fila.PRESION > CONFIG.PRESION_MAX) {
    errores.push(`PRESION ${fila.PRESION}psi fuera de rango (${CONFIG.PRESION_MIN}-${CONFIG.PRESION_MAX}psi)`);
  }

  // Solo TORQUE cambia de comportamiento según la posición
  const esRepuesto = fila.POSICION === CONFIG.POSICION_REPUESTO;
  if (esRepuesto) {
    if (fila.TORQUE !== null && !Number.isNaN(fila.TORQUE) && fila.TORQUE !== 0) {
      errores.push(`Posición ${CONFIG.POSICION_REPUESTO} (repuesto) no debe llevar torque (vino ${fila.TORQUE})`);
    }
  } else {
    if (fila.TORQUE === null || Number.isNaN(fila.TORQUE)) {
      errores.push('TORQUE vacío o no numérico (obligatorio en posiciones montadas)');
    } else if (fila.TORQUE < CONFIG.TORQUE_MIN || fila.TORQUE > CONFIG.TORQUE_MAX) {
      errores.push(`TORQUE ${fila.TORQUE} fuera de rango (${CONFIG.TORQUE_MIN}-${CONFIG.TORQUE_MAX})`);
    }
  }

  if (!fila.FECHA_ASIGNACION) {
    errores.push('FECHA_ASIGNACION vacía o con formato inválido');
  } else if (fila.FECHA_ASIGNACION > new Date()) {
    errores.push('FECHA_ASIGNACION no puede ser futura');
  }

  return errores;
}

function agruparPorPlaca(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const key = fila.PLACA || `__SIN_PLACA_FILA_${fila._fila}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(fila);
  }
  return grupos;
}

function validarGrupoEstructura(placa, filas) {
  const errores = [];
  if (filas.length !== CONFIG.MAX_POSICIONES_POR_PLACA) {
    errores.push(`La placa ${placa} tiene ${filas.length} fila(s), debe tener exactamente ${CONFIG.MAX_POSICIONES_POR_PLACA} (una por cada posición: ${CONFIG.POSICIONES_VALIDAS.join(', ')})`);
  }
  const vistas = new Map();
  for (const fila of filas) {
    if (!fila.POSICION) continue;
    if (vistas.has(fila.POSICION)) {
      errores.push(`Posición ${fila.POSICION} repetida en la placa ${placa} (filas ${vistas.get(fila.POSICION)} y ${fila._fila})`);
    } else {
      vistas.set(fila.POSICION, fila._fila);
    }
  }

  const faltantes = CONFIG.POSICIONES_VALIDAS.filter((p) => !vistas.has(p));
  if (faltantes.length) {
    errores.push(`A la placa ${placa} le falta(n) la(s) posición(es): ${faltantes.join(', ')}`);
  }

  // Todas las filas de una misma placa deben asignarse el mismo día
  const fechasVistas = new Set(
    filas.map((f) => formatDateParam(f.FECHA_ASIGNACION)).filter(Boolean)
  );
  if (fechasVistas.size > 1) {
    errores.push(`La placa ${placa} tiene fechas de asignación distintas entre sus filas (${[...fechasVistas].join(', ')}); todas deben asignarse el mismo día`);
  }

  // El KILOMETRAJE se registra una sola vez por placa en NEU_VKILOMETRAJE,
  // así que todas las filas de la placa deben traer el mismo valor.
  const kmsVistos = new Set(
    filas
      .map((f) => f.KILOMETRAJE)
      .filter((k) => k !== null && !Number.isNaN(k))
  );
  if (kmsVistos.size > 1) {
    errores.push(`La placa ${placa} tiene valores de KILOMETRAJE distintos entre sus filas (${[...kmsVistos].join(', ')}); debe ser el mismo para todas las posiciones`);
  }

  return errores;
}

// ---------------------------------------------------------------------
// Validación contra BD — usa tu esquema real (BD_SCHEMA, db.query)
// ---------------------------------------------------------------------
async function validarContraBD(db, BD_SCHEMA, filas) {
  const erroresPorFila = new Map();
  const addError = (fila, msg) => {
    if (!erroresPorFila.has(fila._fila)) erroresPorFila.set(fila._fila, []);
    erroresPorFila.get(fila._fila).push(msg);
  };

  const codigos = [...new Set(filas.map((f) => f.CODIGO).filter(Boolean))];
  const placas = [...new Set(filas.map((f) => f.PLACA).filter(Boolean))];

  // CODIGO repetido dentro del mismo archivo
  const conteo = new Map();
  for (const f of filas) {
    if (!f.CODIGO) continue;
    conteo.set(f.CODIGO, (conteo.get(f.CODIGO) || 0) + 1);
  }
  for (const f of filas) {
    if (f.CODIGO && conteo.get(f.CODIGO) > 1) {
      addError(f, `CODIGO ${f.CODIGO} aparece repetido ${conteo.get(f.CODIGO)} veces en el archivo`);
    }
  }

  if (codigos.length === 0 || placas.length === 0) {
    return { erroresPorFila, infoPorCodigo: new Map(), vehiculoPorPlaca: new Map(), kmBasePorPlaca: new Map() };
  }

  const phCod = codigos.map(() => '?').join(',');

  const infoNeumaticos = await db.query(
    `SELECT P.ID, P.CODIGO, I.ID_ESTADO, I.PLACA_ACTUAL, I.POSICION_ACTUAL, I.PROYECTO_ACTUAL,
            CAST(I.ES_RECUPERADO AS SMALLINT) AS ES_RECUPERADO
           FROM ${BD_SCHEMA}.NEU_PADRON P
           LEFT JOIN ${BD_SCHEMA}.NEU_INFORMACION I ON I.ID_NEUMATICO = P.ID
          WHERE P.CODIGO IN (${phCod})`,
    codigos
  );
  const infoPorCodigo = new Map(
    infoNeumaticos.map((r) => [String(campo(r, 'CODIGO')).trim(), r])
  );

  const phPlacas = placas.map(() => '?').join(',');
  const vehiculos = await db.query(
    `SELECT ID AS ID_VEHICULO, NUMPLA AS PLACA, KILOMETRAJE
           FROM ${BD_SCHEMA}.PO_VEHICULO
          WHERE NUMPLA IN (${phPlacas})`,
    placas
  );
  const vehiculoPorPlaca = new Map(
    vehiculos.map((r) => [String(campo(r, 'PLACA')).trim(), r])
  );

  // Kilometraje base por placa: el mayor KILOMETRAJE registrado en
  // PO_TEMPREGTAB para el vehículo (ID) de esa placa.
  const idsVehiculo = [...new Set(
    [...vehiculoPorPlaca.values()]
      .map((v) => campo(v, 'ID_VEHICULO'))
      .filter((v) => v !== null && v !== undefined)
  )];

  const kmBasePorIdVehiculo = new Map();
  if (idsVehiculo.length) {
    const phVeh = idsVehiculo.map(() => '?').join(',');
    const kmBaseRows = await db.query(
      `SELECT IDVEH, MAX(KILOMETRAJE) AS KILOMETRAJE_BASE
             FROM ${BD_SCHEMA}.PO_TEMPREGTAB
            WHERE IDVEH IN (${phVeh})
            GROUP BY IDVEH`,
      idsVehiculo
    );
    for (const r of kmBaseRows) {
      const idveh = campo(r, 'IDVEH');
      const kmBase = campo(r, 'KILOMETRAJE_BASE');
      if (idveh !== null && kmBase !== null) {
        kmBasePorIdVehiculo.set(String(idveh).trim(), Number(kmBase));
      }
    }
  }

  const kmBasePorPlaca = new Map();
  for (const [placa, vRow] of vehiculoPorPlaca) {
    const idVehiculo = campo(vRow, 'ID_VEHICULO');
    if (idVehiculo === null || idVehiculo === undefined) continue;

    let kmBase = kmBasePorIdVehiculo.get(String(idVehiculo).trim()) ?? null;
    if (kmBase === null) {
      // Sin registros en PO_TEMPREGTAB: usar el KILOMETRAJE actual del
      // vehículo en PO_VEHICULO como base.
      const kmVehiculo = campo(vRow, 'KILOMETRAJE');
      if (kmVehiculo !== null && kmVehiculo !== undefined) {
        kmBase = Number(kmVehiculo);
      }
    }
    kmBasePorPlaca.set(placa, kmBase);
  }

  const ocupadas = await db.query(
    `SELECT PLACA_ACTUAL, POSICION_ACTUAL
           FROM ${BD_SCHEMA}.NEU_INFORMACION
          WHERE PLACA_ACTUAL IN (${phPlacas})
            AND ID_ESTADO = ?`,
    [...placas, CONFIG.ID_ESTADO_ASIGNADO]
  );
  const key = (placa, pos) => `${placa}::${pos}`;
  const posicionesOcupadas = new Set(
    ocupadas.map((r) => key(campo(r, 'PLACA_ACTUAL'), campo(r, 'POSICION_ACTUAL')))
  );

  const hoyISO = formatDateParam(new Date());
  const ventanaInfISO = restarDiasParam(hoyISO, CONFIG.VENTANA_DIAS_ATRAS);

  for (const f of filas) {
    if (!f.CODIGO || !f.PLACA) continue;

    const info = infoPorCodigo.get(f.CODIGO);
    if (!info) {
      addError(f, `CODIGO ${f.CODIGO} no existe en el padron de neumáticos`);
    } else if (Number(campo(info, 'ID_ESTADO')) !== CONFIG.ID_ESTADO_DISPONIBLE) {
      const estado = Number(campo(info, 'ID_ESTADO')) === CONFIG.ID_ESTADO_ASIGNADO ? 'Asignado' : 'Baja';
      addError(f, `CODIGO ${f.CODIGO} no está Disponible (estado actual: ${estado})`);
    } else if (Number(campo(info, 'ES_RECUPERADO')) === 1) {
      addError(f, `CODIGO ${f.CODIGO} está marcado como Recuperado; no se puede asignar por carga masiva`);
    }

    if (!vehiculoPorPlaca.get(f.PLACA)) {
      addError(f, `PLACA ${f.PLACA} no existe en PO_VEHICULO`);
    }

    if (f.POSICION && posicionesOcupadas.has(key(f.PLACA, f.POSICION))) {
      addError(f, `La posición ${f.POSICION} de la placa ${f.PLACA} ya tiene un neumático Asignado`);
    }

    if (f.FECHA_ASIGNACION) {
      const fechaFilaISO = formatDateParam(f.FECHA_ASIGNACION);
      if (fechaFilaISO < ventanaInfISO) {
        addError(
          f,
          `FECHA_ASIGNACION (${fechaFilaISO}) fuera del rango permitido: máximo ${CONFIG.VENTANA_DIAS_ATRAS} días atrás (desde ${ventanaInfISO} hasta ${hoyISO})`
        );
      }
    }
  }

  return { erroresPorFila, infoPorCodigo, vehiculoPorPlaca, kmBasePorPlaca };
}

// KILOMETRAJE de la placa vs. el último registrado en PO_TEMPREGTAB para su vehículo:
// debe ser mayor a kmBase y menor a kmBase + KILOMETRAJE_MAX_INCREMENTO.
function validarKilometrajeGrupo(placa, filas, kmBase) {
  const errores = [];
  const kmsValidos = filas.map((f) => f.KILOMETRAJE).filter((k) => k !== null && !Number.isNaN(k));
  if (kmsValidos.length === 0) return errores; // ya reportado como error de fila

  const km = kmsValidos[0];

  if (kmBase === null || kmBase === undefined) {
    errores.push(`No se encontró kilometraje base  para la placa ${placa}; no se puede validar el KILOMETRAJE de asignación`);
    return errores;
  }

  const kmMax = kmBase + CONFIG.KILOMETRAJE_MAX_INCREMENTO;
  if (km <= kmBase) {
    errores.push(`KILOMETRAJE (${km}) de la placa ${placa} debe ser mayor al último kilometraje registrado (${kmBase})`);
  } else if (km >= kmMax) {
    errores.push(`KILOMETRAJE (${km}) de la placa ${placa} debe ser menor a ${kmBase} + ${CONFIG.KILOMETRAJE_MAX_INCREMENTO} (${kmMax})`);
  }

  return errores;
}

// ---------------------------------------------------------------------
// Orquestación de validación completa -> reporte por placa
// ---------------------------------------------------------------------
async function validarAsignacionMasiva(db, BD_SCHEMA, filas) {
  const reportePorPlaca = new Map();
  const grupos = agruparPorPlaca(filas);

  for (const [placa, filasGrupo] of grupos) {
    const erroresFilas = [];
    for (const fila of filasGrupo) {
      const errs = validarFilaEstructura(fila);
      if (errs.length) erroresFilas.push({ fila: fila._fila, codigo: fila.CODIGO, errores: errs });
    }
    const erroresGrupo = validarGrupoEstructura(placa, filasGrupo);
    reportePorPlaca.set(placa, { filas: filasGrupo, erroresFilas, erroresGrupo });
  }

  const { erroresPorFila, infoPorCodigo, vehiculoPorPlaca, kmBasePorPlaca } = await validarContraBD(db, BD_SCHEMA, filas);

  for (const [placa, rep] of reportePorPlaca) {
    for (const fila of rep.filas) {
      const errsBD = erroresPorFila.get(fila._fila);
      if (errsBD?.length) {
        rep.erroresFilas.push({ fila: fila._fila, codigo: fila.CODIGO, errores: errsBD });
      }
    }
    rep.erroresGrupo.push(...validarKilometrajeGrupo(placa, rep.filas, kmBasePorPlaca.get(placa)));
    rep.valido = rep.erroresFilas.length === 0 && rep.erroresGrupo.length === 0;
  }

  return { reportePorPlaca, infoPorCodigo, vehiculoPorPlaca };
}

// ---------------------------------------------------------------------
// Convierte el reporte interno (Maps) al shape que espera el frontend
// ---------------------------------------------------------------------
function serializarReporte(batchId, totalFilas, reportePorPlaca) {
  const aprobadas = [];
  const rechazadas = [];

  for (const [placa, rep] of reportePorPlaca) {
    const neumaticos = rep.filas.map((f) => ({
      codigo: f.CODIGO,
      posicion: f.POSICION,
      remanente: f.REMANENTE,
      presion: f.PRESION,
      torque: f.TORQUE,
      fechaAsignacion: f.FECHA_ASIGNACION,
    }));
    const kilometraje = rep.filas.find((f) => f.KILOMETRAJE !== null && !Number.isNaN(f.KILOMETRAJE))?.KILOMETRAJE ?? null;

    if (rep.valido) {
      aprobadas.push({ placa, kilometraje, neumaticos });
    } else {
      const motivos = [
        ...rep.erroresGrupo,
        ...rep.erroresFilas.flatMap((e) => e.errores.map((m) => `Fila ${e.fila} (${e.codigo}): ${m}`)),
      ];
      rechazadas.push({ placa, kilometraje, neumaticos, motivo: motivos[0] ?? 'Error de validación', motivos });
    }
  }

  return { batchId, totalFilas, aprobadas, rechazadas };
}

// ---------------------------------------------------------------------
// Confirmar: registra solo las placas aprobadas del lote guardado
// ---------------------------------------------------------------------
async function confirmarLote(db, BD_SCHEMA, lote, usuario) {
  const { reportePorPlaca, infoPorCodigo } = lote;
  const resultado = { registradas: [], rechazadas: [] };

  for (const [placa, rep] of reportePorPlaca) {
    if (!rep.valido) {
      resultado.rechazadas.push({ placa, motivo: 'No pasó validación, no se registró' });
      continue;
    }

    try {
      // KILOMETRAJE es el mismo para todas las filas de la placa (validado antes)
      // y se registra una sola vez por placa en NEU_VKILOMETRAJE, no por neumático.
      const primeraFila = rep.filas[0];
      await db.query(
        `INSERT INTO ${BD_SCHEMA}.NEU_VKILOMETRAJE (PLACA, KILOMETRAJE, FECHA_ASIGNACION)
             VALUES (?, ?, ?)`,
        [placa, primeraFila.KILOMETRAJE, formatDateParam(primeraFila.FECHA_ASIGNACION)]
      );

      for (const fila of rep.filas) {
        const info = infoPorCodigo.get(fila.CODIGO);
        const idNeumatico = campo(info, 'ID');
        const idVehiculo = null;
        const proyecto = campo(info, 'PROYECTO_ACTUAL');
        if (!proyecto) {
          throw new Error(`CODIGO ${fila.CODIGO} no tiene PROYECTO_ACTUAL en NEU_INFORMACION`);
        }
        const fechaAsignacion = formatDateParam(fila.FECHA_ASIGNACION);

        await db.query(
          `INSERT INTO ${BD_SCHEMA}.NEU_MOVIMIENTOS
                       (ID_NEUMATICO, FECHA_MOVIMIENTO, ID_ACCION, ID_VEHICULO, PLACA,
                        POSICION_ANTERIOR, POSICION_NUEVA, PROYECTO, REMANENTE_MEDIDO,
                        PRESION_MEDIDA, TORQUE_APLICADO, ODOMETRO_VEHICULO,
                        KM_RECORRIDOS_ETAPA, ID_ESTADO, OBS, USUARIO_REGISTRADOR,
                        COD_SUPERVISOR, FECHA_ASIGNACION)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            idNeumatico, fechaAsignacion, CONFIG.ID_ACCION_MONTAJE, idVehiculo, placa,
            null, fila.POSICION, proyecto, fila.REMANENTE, fila.PRESION, fila.TORQUE || 0,
            0, 0, CONFIG.ID_ESTADO_ASIGNADO, 'Asignación masiva por Excel',
            usuario, CONFIG.COD_SUPERVISOR, fechaAsignacion,
          ]
        );

        await db.query(
          `UPDATE ${BD_SCHEMA}.NEU_INFORMACION
                        SET ID_ESTADO = ?, PLACA_ACTUAL = ?, POSICION_ACTUAL = ?,
                            PROYECTO_ACTUAL = ?, REMANENTE_ACTUAL = ?, PRESION_ACTUAL = ?,
                            TORQUE_ACTUAL = ?, FECHA_ULTIMA_ASIGNACION = ?,
                            FECHA_ULTIMA_ACTUALIZACION = ?, ES_RECUPERADO = 0, QTY_RECUPERADO = 0
                      WHERE ID_NEUMATICO = ?`,
          [
            CONFIG.ID_ESTADO_ASIGNADO, placa, fila.POSICION, proyecto,
            fila.REMANENTE, fila.PRESION, fila.TORQUE || 0,
            fechaAsignacion, formatTimestampParam(new Date()), idNeumatico,
          ]
        );
      }
      resultado.registradas.push({ placa, neumaticos: rep.filas.length });
    } catch (err) {
      // NOTA: si tu módulo `db` soporta transacciones (begin/commit/rollback),
      // envolver el for de arriba en una para que la placa quede atómica
      // también a nivel SQL, no solo por validación previa.
      const detalle = err.odbcErrors ? ` | ${JSON.stringify(err.odbcErrors)}` : '';
      console.error(`[confirmarLote] Error SQL en placa ${placa}: ${err.message}${detalle}`);
      resultado.rechazadas.push({ placa, motivo: `Error SQL al registrar: ${err.message}${detalle}` });
    }
  }

  return resultado;
}

// ---------------------------------------------------------------------
// Generar reporte descargable (Excel) de un lote ya procesado
// ---------------------------------------------------------------------
function generarReporteBuffer(reportePorPlaca) {
  const filasAprobadas = [];
  const filasRechazadas = [];

  for (const [placa, rep] of reportePorPlaca) {
    for (const fila of rep.filas) {
      const base = {
        PLACA: placa,
        KILOMETRAJE: fila.KILOMETRAJE,
        CODIGO: fila.CODIGO,
        POSICION: fila.POSICION,
        REMANENTE: fila.REMANENTE,
        PRESION: fila.PRESION,
        TORQUE: fila.TORQUE,
        FECHA_ASIGNACION: fila.FECHA_ASIGNACION,
      };

      if (rep.valido) {
        filasAprobadas.push({ ...base, ESTADO: 'REGISTRADO' });
      } else {
        const erroresFila = rep.erroresFilas.find((e) => e.fila === fila._fila);
        const motivo = erroresFila
          ? erroresFila.errores.join(' | ')
          : [...rep.erroresGrupo, 'Bloqueado por otra fila de esta placa'].join(' | ');
        filasRechazadas.push({ ...base, ESTADO: 'RECHAZADO', MOTIVO: motivo });
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasAprobadas), 'Aprobadas');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasRechazadas), 'Rechazadas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  CONFIG,
  leerExcelAsignacion,
  generarReporteBuffer,
  generarPlantillaBuffer,
  validarAsignacionMasiva,
  serializarReporte,
  confirmarLote,
};