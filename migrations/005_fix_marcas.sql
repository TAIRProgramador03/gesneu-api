-- MIGRACION 005: Sincronización de Marcas (NEU_MARCA Existente)
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: 
-- 1. Inserta en la tabla existente NEU_MARCA cualquier marca de PO_NEUMATICO que falte.
--    (Usa columnas ID_MARCA y MARCA según tu estructura).

INSERT INTO SPEED400AT.NEU_MARCA (MARCA)
SELECT DISTINCT UPPER(TRIM(P.MARCA))
FROM SPEED400AT.PO_NEUMATICO P
WHERE P.MARCA IS NOT NULL 
  AND TRIM(P.MARCA) <> ''
  AND NOT EXISTS (
      SELECT 1 
      FROM SPEED400AT.NEU_MARCA M 
      WHERE UPPER(TRIM(M.MARCA)) = UPPER(TRIM(P.MARCA))
  );

-- NOTA: Como la tabla ya existe y tiene ID_MARCA autogenerado (Identity), 
-- solo insertamos el nombre (MARCA) y el motor asignará el nuevo ID.
