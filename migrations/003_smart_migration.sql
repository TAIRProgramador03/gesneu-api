-- MIGRACION 003: Migración Inteligente Masiva con Integridad Referencial
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: Migra datos de PO_NEUMATICO cruzando con NEU_ASIGNADO, PO_MARCA y PO_VEHICULO 
-- para reconstruir la historia completa y ubicación de cada neumático.

--------------------------------------------------------------------------------
-- 1. INSERTAR NEUMÁTICOS CRUZANDO INFORMACIÓN
--------------------------------------------------------------------------------
INSERT INTO SPEED400AT.NEU_CABECERA (
    CODIGO_CASCO, ID_MARCA, MEDIDA, DISEÑO, 
    PR_LONAS, INDICE_CARGA, INDICE_VELOCIDAD, DOT_FABRICACION,
    FECHA_COMPRA, COSTO_INICIAL, PROVEEDOR_NOMBRE,
    RQ, OC, PROYECTO,
    ESTADO_ACTUAL, 
    PLACA_ACTUAL, POSICION_ACTUAL, SUPERVISOR_ACTUAL,
    REMANENTE_INICIAL, REMANENTE_ACTUAL, PRESION_ACTUAL, 
    KM_TOTAL_VIDA, FECHA_ULTIMO_SUCESO
)
SELECT 
    N.CODIGO,
    M.ID,                       -- ID_MARCA (desde PO_MARCA)
    N.MEDIDA,
    N.DISEÑO,
    N.PR,
    N.CARGA, 
    N.VELOCIDAD,
    N.FECHA_FABRICACIO,         -- DOT
    N.FECHA_COMPRA,
    N.COSTO,
    N.PROVEEDOR,
    N.RQ,
    N.OC,
    N.PROYECTO,
    
    -- Lógica de Estado Inteligente
    CASE 
        WHEN A.PLACA IS NOT NULL THEN 'ASIGNADO'
        WHEN N.ESTADO_NEUMATICO = 'BAJA_DEFINITIVA' THEN 'BAJA'
        WHEN N.ESTADO_NEUMATICO = 'RECUPERADO' THEN 'RECUPERADO'
        ELSE 'STOCK'
    END AS ESTADO_CALCULADO,

    A.PLACA,                    -- PLACA_ACTUAL (Solo si existe en asignados)
    A.POSICION_NEU,             -- POSICION_ACTUAL
    COALESCE(A.USUARIO_SUPER, N.USUARIO_SUPER), -- Prioridad al supervisor de asignación
    
    N.REMANENTE,                -- Inicial (Asumimos el que está en ficha)
    N.REMANENTE,                -- Actual
    COALESCE(A.PRESION_AIRE, N.PRESION_AIRE),
    
    N.KILOMETRO,
    CURRENT_TIMESTAMP
    
FROM SPEED400AT.PO_NEUMATICO N
-- 1. Rescatar ID de Marca
LEFT JOIN SPEED400AT.PO_MARCA M ON UPPER(TRIM(M.DESCRIPCION)) = UPPER(TRIM(N.MARCA))
-- 2. Rescatar Ubicación Real (Solo si está asignado actualmente)
LEFT JOIN SPEED400AT.NEU_ASIGNADO A ON N.CODIGO = A.CODIGO;

--------------------------------------------------------------------------------
-- 2. GENERAR MOVIMIENTOS INICIALES (MIGRACION)
--------------------------------------------------------------------------------
INSERT INTO SPEED400AT.NEU_DETALLE (
    ID_NEUMATICO, CODIGO_CASCO, FECHA_SUCESO, TIPO_ACCION, 
    PLACA, POSICION_NUEVA, REMANENTE_MEDIDO, PRESION_MEDIDA, 
    OBSERVACION, USUARIO_REGISTRO
)
SELECT 
    C.ID_NEUMATICO,
    C.CODIGO_CASCO,
    CURRENT_TIMESTAMP,
    'MIGRACION',
    C.PLACA_ACTUAL,
    C.POSICION_ACTUAL,
    C.REMANENTE_ACTUAL,
    C.PRESION_ACTUAL,
    'Migración Masiva. Origen: PO_NEUMATICO + NEU_ASIGNADO',
    'SISTEMA_MIGRACION'
FROM SPEED400AT.NEU_CABECERA C
WHERE NOT EXISTS (SELECT 1 FROM SPEED400AT.NEU_DETALLE D WHERE D.ID_NEUMATICO = C.ID_NEUMATICO);
