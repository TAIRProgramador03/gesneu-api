-- MIGRACION 006: Reparación de Marcas Nulas
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: Script correctivo para solucionar el "ID_MARCA es NULL" en neumáticos ya migrados.

--------------------------------------------------------------------------------
-- 1. SINCRONIZAR MARCAS FALTANTES
-- Aseguramos que todas las marcas de PO_NEUMATICO existan en NEU_MARCA
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- 2. ACTUALIZAR NEU_CABECERA CON EL ID CORRECTO
-- Cruzamos: NEU_CABECERA -> PO_NEUMATICO (Texto Marca) -> NEU_MARCA (ID)
--------------------------------------------------------------------------------
UPDATE SPEED400AT.NEU_CABECERA C
SET ID_MARCA = (
    SELECT M.ID_MARCA
    FROM SPEED400AT.PO_NEUMATICO P
    INNER JOIN SPEED400AT.NEU_MARCA M ON UPPER(TRIM(P.MARCA)) = UPPER(TRIM(M.MARCA))
    WHERE P.CODIGO = C.CODIGO_CASCO
)
WHERE ID_MARCA IS NULL;

-- Verificación final (Opcional)
-- SELECT count(*) as FALTANTES FROM SPEED400AT.NEU_CABECERA WHERE ID_MARCA IS NULL;
