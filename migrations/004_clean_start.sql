-- MIGRACION 004: Clean Start - Importación como STOCK
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: Importa el inventario físico de PO_NEUMATICO hacia NEU_CABECERA pero 
-- "reseteando" su estado a STOCK. Esto permite que luego sean asignados CORRECTAMENTE
-- a vehículos/supervisores reales mediante el nuevo sistema, garantizando integridad.

--------------------------------------------------------------------------------
-- 1. INSERTAR INVENTARIO RESETEADO
--------------------------------------------------------------------------------
INSERT INTO SPEED400AT.NEU_CABECERA (
    CODIGO_CASCO, 
    ID_MARCA, 
    MEDIDA, 
    DISEÑO,
    PR_LONAS, 
    INDICE_CARGA, 
    INDICE_VELOCIDAD, 
    DOT_FABRICACION, 
    FECHA_COMPRA, 
    COSTO_INICIAL, 
    PROVEEDOR_NOMBRE, 
    RQ, 
    OC, 
    PROYECTO,
    
    -- ESTADO FORZADO A STOCK PARA RE-ASIGNACIÓN LIMPIA
    ESTADO_ACTUAL,
    PLACA_ACTUAL, 
    POSICION_ACTUAL, 
    SUPERVISOR_ACTUAL, -- Se limpia para re-asignar responsable real al montar
    
    REMANENTE_INICIAL, 
    REMANENTE_ACTUAL, 
    PRESION_ACTUAL,
    KM_TOTAL_VIDA, 
    ODOMETRO_AL_MONTAR,
    FECHA_ULTIMO_SUCESO
)
SELECT 
    N.CODIGO,
    M.ID,                       -- Intentamos resolver la Marca si existe
    N.MEDIDA,
    N.DISEÑO,
    N.PR,
    N.CARGA, 
    N.VELOCIDAD,
    N.FECHA_FABRICACIO,
    N.FECHA_COMPRA,
    N.COSTO,
    N.PROVEEDOR,
    N.RQ,
    N.OC,
    N.PROYECTO,
    
    'STOCK',                    -- <--- RESETEO A STOCK
    CAST(NULL AS VARCHAR(20)),  -- PLACA_ACTUAL
    CAST(NULL AS VARCHAR(20)),  -- POSICION_ACTUAL
    CAST(N.USUARIO_SUPER AS VARCHAR(50)), -- SUPERVISOR_ACTUAL (Mantiene el responsable aunque esté en Stock)
    
    N.REMANENTE,                -- Inicial
    N.REMANENTE,                -- Actual
    CAST(NULL AS DECIMAL(5, 2)),-- PRESION_ACTUAL
    N.KILOMETRO,                -- Se respeta el kilometraje acumulado histórico
    0,
    CURRENT_TIMESTAMP
FROM SPEED400AT.PO_NEUMATICO N
LEFT JOIN SPEED400AT.NEU_MARCA M ON UPPER(TRIM(M.MARCA)) = UPPER(TRIM(N.MARCA));

--------------------------------------------------------------------------------
-- 2. REGISTRAR EL INGRESO OFICIAL AL NUEVO SISTEMA
--------------------------------------------------------------------------------
INSERT INTO SPEED400AT.NEU_DETALLE (
    ID_NEUMATICO, CODIGO_CASCO, FECHA_SUCESO, TIPO_ACCION, 
    REMANENTE_MEDIDO, OBSERVACION, USUARIO_REGISTRO
)
SELECT 
    C.ID_NEUMATICO,
    C.CODIGO_CASCO,
    CURRENT_TIMESTAMP,
    'INGRESO_INVENTARIO', -- Acción inicial limpia
    C.REMANENTE_ACTUAL,
    'Carga inicial de inventario desde PO_NEUMATICO (Reset a STOCK)',
    'MIGRACION_CLEAN'
FROM SPEED400AT.NEU_CABECERA C
WHERE NOT EXISTS (SELECT 1 FROM SPEED400AT.NEU_DETALLE D WHERE D.ID_NEUMATICO = C.ID_NEUMATICO);
