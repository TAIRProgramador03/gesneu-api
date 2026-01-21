-- MIGRACION 002: Ingesta de Datos de Muestra (PO_NEUMATICO -> NORMALIZADO)
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: Script para insertar el neumático muestra '1000001' (PIRELLI) en el nuevo esquema.

--------------------------------------------------------------------------------
-- 1. INSERTAR EN CABECERA (NEU_CABECERA)
--------------------------------------------------------------------------------
INSERT INTO SPEED400AT.NEU_CABECERA (
    -- Identificación
    CODIGO_CASCO, 
    ID_MARCA,        -- Se buscará dinámicamente usando el nombre 'PIRELLI'
    MEDIDA, 
    DISEÑO, 
    DOT_FABRICACION,
    
    -- Ficha Técnica
    PR_LONAS, 
    INDICE_CARGA,    -- Legacy: CARGA
    INDICE_VELOCIDAD,-- Legacy: VELOCIDAD
    
    -- Administrativo
    RQ, 
    OC, 
    PROYECTO, 
    PROVEEDOR_NOMBRE, 
    COSTO_INICIAL,
    FECHA_COMPRA,
    
    -- Estado Actual
    ESTADO_ACTUAL,       -- 'ASIGNADO'
    PLACA_ACTUAL,        -- NULL en la muestra, pero inferimos si 'ASIGNADO' requeriría vehiculo. Se deja NULL por fidelidad al dato crudo.
    POSICION_ACTUAL,     -- NULL en la muestra.
    SUPERVISOR_ACTUAL,   -- 'JZAVALETA'
    
    -- Mediciones
    REMANENTE_INICIAL,   -- Asumimos igual al actual si no hay histórico
    REMANENTE_ACTUAL,    -- 20
    PRESION_ACTUAL,      -- 32
    ODOMETRO_AL_MONTAR,  -- 0 (O el valor KILOMETRO si fuese al inicio, pero KILOMETRO '322920' parece acumulado actual)
    KM_TOTAL_VIDA,       -- 322920 (Legacy KILOMETRO)
    
    FECHA_ULTIMO_SUCESO
)
VALUES (
    '1000001',                                       -- CODIGO
    (SELECT ID FROM SPEED400AT.PO_MARCA WHERE DESCRIPCION = 'PIRELLI' FETCH FIRST 1 ROWS ONLY), -- ID_MARCA
    '245/75R16',                                     -- MEDIDA
    'M/T',                                           -- DISEÑO
    '3818',                                          -- DOT (FECHA_FABRICACION_COD)
    
    '10',                                            -- PR
    '1400',                                          -- CARGA
    '120',                                           -- VELOCIDAD
    
    '59758',                                         -- RQ
    '120',                                           -- OC (Dato confuso en imagen, tomado literal '120')
    'CUAJONE',                                       -- PROYECTO
    'LLANTACENTRO GEPSA E I R L',                    -- PROVEEDOR
    145.00,                                          -- COSTO
    '2025-07-14',                                    -- FECHA_COMPRA (14/07/25)
    
    'ASIGNADO',                                      -- ESTADO (TIPO_MOVIMIENTO)
    NULL,                                            -- PLACA (No presente en PO_NEUMATICO flatten row)
    NULL,                                            -- POSICION
    'JZAVALETA',                                     -- SUPERVISOR
    
    20.00,                                           -- REMANENTE_INICIAL (Asumido)
    20.00,                                           -- REMANENTE_ACTUAL
    32.00,                                           -- PRESION
    0,                                               -- ODOMETRO_AL_MONTAR (Desconocido)
    322920,                                          -- KM_TOTAL_VIDA
    
    CURRENT_TIMESTAMP
);

--------------------------------------------------------------------------------
-- 2. INSERTAR DETALLE INICIAL (MIGRACION)
--------------------------------------------------------------------------------
-- Recuperamos el ID recién creado para insertar el detalle
INSERT INTO SPEED400AT.NEU_DETALLE (
    ID_NEUMATICO,
    CODIGO_CASCO,
    FECHA_SUCESO,
    TIPO_ACCION,
    
    -- Datos del Estado al momento de Migrar
    REMANENTE_MEDIDO,
    PRESION_MEDIDA,
    OBSERVACION,
    USUARIO_REGISTRO
)
VALUES (
    (SELECT ID_NEUMATICO FROM SPEED400AT.NEU_CABECERA WHERE CODIGO_CASCO = '1000001'),
    '1000001',
    CURRENT_TIMESTAMP,
    'MIGRACION', -- Marcamos diferente al INGRESO normal
    
    20.00,
    32.00,
    'Migración de datos Legacy. Estado Original: ASIGNADO. KM: 322920',
    'SISTEMA_MIGRACION'
);
