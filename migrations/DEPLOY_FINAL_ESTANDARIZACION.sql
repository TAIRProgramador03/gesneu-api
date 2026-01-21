-- =========================================================================================
-- SCRIPT MAESTRO DE ESTANDARIZACIÓN (Versión Final)
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- =========================================================================================
-- DESCRIPCION:
-- Este script ejecuta secuencialmente todas las mejoras de "Normalización de Estados y Acciones"
-- que hemos trabajado. Incluye:
-- 1. Creación del Catálogo de Estados (Disponible, Asignado...)
-- 2. Creación del Catálogo de Acciones (Ingreso, Montaje...)
-- 3. Actualización masiva del historial para usar estos catálogos.
--
-- INSTRUCCIONES:
-- Ejecuta este script completo en tu consola SQL (System i Navigator / DBeaver).
-- Al finalizar, REINICIA EL SERVIDOR BACKEND.
-- =========================================================================================

-- =========================================================================================
-- PASO 1: IMPLEMENTAR CATÁLOGO DE ESTADOS (MIGRACION 008)
-- =========================================================================================

-- 1.1 Crear Tabla de Estados
CREATE TABLE SPEED400AT.NEU_ESTADO (
    ID_ESTADO INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CODIGO_INTERNO VARCHAR(20) NOT NULL,
    DESCRIPCION VARCHAR(50) NOT NULL,
    COLOR_HEX VARCHAR(10) DEFAULT '#000000'
);

-- 1.2 Poblar Estados Maestros
INSERT INTO SPEED400AT.NEU_ESTADO (CODIGO_INTERNO, DESCRIPCION, COLOR_HEX) VALUES ('DISPONIBLE', 'DISPONIBLE', '#2e7d32');
INSERT INTO SPEED400AT.NEU_ESTADO (CODIGO_INTERNO, DESCRIPCION, COLOR_HEX) VALUES ('ASIGNADO', 'ASIGNADO', '#1976d2');
INSERT INTO SPEED400AT.NEU_ESTADO (CODIGO_INTERNO, DESCRIPCION, COLOR_HEX) VALUES ('BAJA', 'BAJA DEFINITIVA', '#d32f2f');
INSERT INTO SPEED400AT.NEU_ESTADO (CODIGO_INTERNO, DESCRIPCION, COLOR_HEX) VALUES ('RECUPERADO', 'RECUPERADO', '#ed6c02');

-- 1.3 Agregar columna ID_ESTADO a Cabecera
ALTER TABLE SPEED400AT.NEU_CABECERA ADD COLUMN ID_ESTADO INT;

-- 1.4 Migrar Datos Existentes en Cabecera
-- Mapeamos el Texto antiguo al Nuevo ID (Teniendo cuidado con 'STOCK' -> 'DISPONIBLE')
UPDATE SPEED400AT.NEU_CABECERA C
SET C.ID_ESTADO = (
  SELECT E.ID_ESTADO FROM SPEED400AT.NEU_ESTADO E 
  WHERE E.CODIGO_INTERNO = CASE WHEN C.ESTADO_ACTUAL = 'STOCK' THEN 'DISPONIBLE' ELSE C.ESTADO_ACTUAL END
);

-- Corrección de nulos o corruptos a DISPONIBLE
UPDATE SPEED400AT.NEU_CABECERA
SET ID_ESTADO = (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE')
WHERE ID_ESTADO IS NULL;


-- 1.5 Agregar columna ID_ESTADO al Detalle (Trazabilidad)
ALTER TABLE SPEED400AT.NEU_DETALLE ADD COLUMN ID_ESTADO INT;

-- 1.6 Migrar Historial de Estados basado en la Acción antigua
UPDATE SPEED400AT.NEU_DETALLE D
SET ID_ESTADO = (
    CASE 
        WHEN TIPO_ACCION IN ('INGRESO', 'INGRESO_INVENTARIO', 'DESMONTAJE', 'COMPRA') 
            THEN (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE')
        WHEN TIPO_ACCION IN ('MONTAJE', 'ROTACION', 'ASIGNACION') 
            THEN (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'ASIGNADO')
        WHEN TIPO_ACCION IN ('BAJA', 'BAJA DEFINITIVA') 
            THEN (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'BAJA')
        WHEN TIPO_ACCION IN ('RECUPERADO', 'RECUPERO') 
            THEN (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'RECUPERADO')
        ELSE 
            (SELECT ID_ESTADO FROM SPEED400AT.NEU_ESTADO WHERE CODIGO_INTERNO = 'DISPONIBLE')
    END
);


-- =========================================================================================
-- PASO 2: IMPLEMENTAR CATÁLOGO DE ACCIONES (MIGRACION 009)
-- =========================================================================================

-- 2.1 Crear Tabla de Acciones (Con ID Manual para consistencia de reportes)
CREATE TABLE SPEED400AT.NEU_ACCION (
    ID_ACCION INT NOT NULL PRIMARY KEY,
    CODIGO_INTERNO VARCHAR(20) NOT NULL UNIQUE, 
    DESCRIPCION VARCHAR(50) NOT NULL
);

-- 2.2 Poblar Acciones Maestras
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (1, 'INGRESO', 'INGRESO AL INVENTARIO');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (2, 'MONTAJE', 'MONTAJE EN VEHICULO');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (3, 'DESMONTAJE', 'DESMONTAJE DE VEHICULO');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (4, 'ROTACION', 'ROTACION DE POSICION');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (5, 'BAJA', 'BAJA DEFINITIVA');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (6, 'RECUPERO', 'RECUPERACION DE NEUMATICO');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (7, 'INSPECCION', 'INSPECCION RUTINARIA');
INSERT INTO SPEED400AT.NEU_ACCION (ID_ACCION, CODIGO_INTERNO, DESCRIPCION) VALUES (8, 'COMPRA', 'COMPRA DE NEUMATICO');

-- 2.3 Agregar ID_ACCION al Detalle
ALTER TABLE SPEED400AT.NEU_DETALLE ADD COLUMN ID_ACCION INT;

-- 2.4 Migrar Historial de Acciones (Limpieza de Texto libre a ID Oficial)
UPDATE SPEED400AT.NEU_DETALLE D
SET ID_ACCION = (
  CASE 
    WHEN UPPER(TIPO_ACCION) LIKE '%INGRESO%' THEN 1  -- INGRESO
    WHEN UPPER(TIPO_ACCION) LIKE '%COMPRA%' THEN 8   -- COMPRA
    WHEN UPPER(TIPO_ACCION) LIKE '%MONTAJE%' AND UPPER(TIPO_ACCION) NOT LIKE '%DESMONTAJE%' THEN 2 -- MONTAJE
    WHEN UPPER(TIPO_ACCION) LIKE '%DESMONTAJE%' THEN 3 -- DESMONTAJE
    WHEN UPPER(TIPO_ACCION) LIKE '%ROTACION%' THEN 4 -- ROTACION
    WHEN UPPER(TIPO_ACCION) LIKE '%BAJA%' THEN 5     -- BAJA
    WHEN UPPER(TIPO_ACCION) LIKE '%RECUPERA%' OR UPPER(TIPO_ACCION) LIKE '%RECUPERO%' THEN 6 -- RECUPERO
    WHEN UPPER(TIPO_ACCION) LIKE '%INSPECCION%' THEN 7 -- INSPECCION
    ELSE 1 -- Default INGRESO
  END
);

-- 2.5 Relaciones (Foreign Keys)
-- Opcional, pero recomendado
ALTER TABLE SPEED400AT.NEU_DETALLE 
ADD CONSTRAINT FK_NEU_ACCION FOREIGN KEY (ID_ACCION) REFERENCES SPEED400AT.NEU_ACCION(ID_ACCION);

ALTER TABLE SPEED400AT.NEU_CABECERA 
ADD CONSTRAINT FK_NEU_ESTADO FOREIGN KEY (ID_ESTADO) REFERENCES SPEED400AT.NEU_ESTADO(ID_ESTADO);

-- =========================================================================================
-- PASO 3: ELIMINACION DE COLUMNAS LEGACY (SOLICITUD DE USUARIO)
-- =========================================================================================
-- El usuario solicitó eliminar los campos manuales 'ESTADO_ACTUAL' y 'TIPO_ACCION' 
-- para evitar redundancia y errores de digitación.

-- =========================================================================================
-- PASO 3: OBSOLESCENCIA DE COLUMNAS LEGACY
-- =========================================================================================
-- Debido a restricciones de bloqueo en DB2 (Reason Code 10: Reorg Required), 
-- en lugar de ELIMINAR (DROP), vamos a RENOMBRAR las columnas para que queden
-- como "Basura Oculta" (Z_) y no confundan al desarrollador.
-- El código ya no las usa.

-- =========================================================================================
-- PASO 3: OBSOLESCENCIA DE COLUMNAS LEGACY
-- =========================================================================================
-- (Omitido por restricción de bloqueo del sistema. Se pueden ignorar o borrar manualmente después).
--
-- 3.1 Cabecera: Renombrar ESTADO_ACTUAL -> Z_LEGACY_ESTADO
-- ALTER TABLE SPEED400AT.NEU_CABECERA ALTER COLUMN ESTADO_ACTUAL DROP DEFAULT;
-- ALTER TABLE SPEED400AT.NEU_CABECERA RENAME COLUMN ESTADO_ACTUAL TO Z_LEGACY_ESTADO;

-- 3.2 Detalle: Renombrar TIPO_ACCION -> Z_LEGACY_ACCION
-- ALTER TABLE SPEED400AT.NEU_DETALLE RENAME COLUMN TIPO_ACCION TO Z_LEGACY_ACCION;

-- =========================================================================================
-- FIN DEL SCRIPT MAESTRO DE ESTANDARIZACION
-- =========================================================================================
