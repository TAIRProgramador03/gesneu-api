-- MIGRACION 001: Esquema Normalizado de Neumáticos
-- Autor: Antigravity AI
-- Fecha: 2025-12-08
-- Descripción: Creación de tablas NEU_CABECERA y NEU_DETALLE para gestión centralizada.
-- ACTUALIZACIÓN: Se agregaron campos administrativos (RQ, OC, PROYECTO) y técnicos (CARGA, VELOCIDAD) del Legacy.

-- 1. Tabla Cabecera (Estado actual del neumático)
CREATE TABLE SPEED400AT.NEU_CABECERA (
    ID_NEUMATICO           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CODIGO_CASCO           VARCHAR(50) NOT NULL UNIQUE, 
    
    -- Ficha Técnica
    ID_MARCA               NUMERIC(18,0), -- FK -> PO_MARCA(ID)
    MEDIDA                 VARCHAR(20),
    DISEÑO                 VARCHAR(50),   
    PR_LONAS               VARCHAR(10),
    INDICE_CARGA           VARCHAR(10),   -- Nuevo (Ex CARGA)
    INDICE_VELOCIDAD       VARCHAR(10),   -- Nuevo (Ex VELOCIDAD)
    DOT_FABRICACION        VARCHAR(10),
    
    -- Administrativo / Compra
    FECHA_COMPRA           DATE,
    COSTO_INICIAL          DECIMAL(10, 2),
    PROVEEDOR_NOMBRE       VARCHAR(100),
    RQ                     VARCHAR(10),   -- Nuevo
    OC                     VARCHAR(10),   -- Nuevo
    PROYECTO               VARCHAR(100),  -- Nuevo
    
    -- Estado y Ubicación
    ESTADO_ACTUAL          VARCHAR(20) DEFAULT 'STOCK', -- STOCK, ASIGNADO, BAJA, RECUPERADO
    ID_VEHICULO_ACTUAL     VARCHAR(20),   -- Placa o ID
    PLACA_ACTUAL           VARCHAR(20),   -- Redundancia útil
    POSICION_ACTUAL        VARCHAR(20),
    
    -- Responsables
    ID_OPERACION_ACTUAL    NUMERIC(18,0),
    SUPERVISOR_ACTUAL      VARCHAR(50),   -- Changed from ID (Numeric) to VARCHAR to match Legacy USUARIO_SUPER

    -- Vida Útil
    REMANENTE_INICIAL      DECIMAL(5, 2),
    REMANENTE_ACTUAL       DECIMAL(5, 2),
    PORCENTAJE_VIDA        DECIMAL(5, 2) DEFAULT 100.00,
    
    -- Kilometraje
    ODOMETRO_AL_MONTAR     NUMERIC(18,0),
    KM_TOTAL_VIDA          INTEGER DEFAULT 0,
    
    PRESION_ACTUAL         DECIMAL(5, 2),
    FECHA_ULTIMO_SUCESO    TIMESTAMP
);

-- 2. Tabla Detalle (Historial de Movimientos)
CREATE TABLE SPEED400AT.NEU_DETALLE (
    ID_MOVIMIENTO          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ID_NEUMATICO           INTEGER NOT NULL,
    CODIGO_CASCO           VARCHAR(50), 
    
    FECHA_SUCESO           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TIPO_ACCION            VARCHAR(30) NOT NULL, 
    
    -- Contexto
    ID_VEHICULO            NUMERIC(18,0),
    ID_OPERACION           NUMERIC(18,0),
    SUPERVISOR             VARCHAR(50),   -- Changed to VARCHAR
    PLACA                  VARCHAR(20),
    
    POSICION_ANTERIOR      VARCHAR(20),
    POSICION_NUEVA         VARCHAR(20),
    
    -- Mediciones
    ODOMETRO_VEHICULO      NUMERIC(18,0),
    REMANENTE_MEDIDO       DECIMAL(5, 2),
    PRESION_MEDIDA         DECIMAL(5, 2),
    
    KM_RECORRIDOS_ETAPA    INTEGER DEFAULT 0,
    
    OBSERVACION            VARCHAR(900),
    USUARIO_REGISTRO       VARCHAR(50),
    
    CONSTRAINT FK_DET_NEU FOREIGN KEY (ID_NEUMATICO) REFERENCES SPEED400AT.NEU_CABECERA(ID_NEUMATICO)
);
