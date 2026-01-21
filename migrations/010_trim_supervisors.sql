-- MIGRACION 010: Trim Supervisores
-- Autor: Antigravity AI
-- Fecha: 2025-12-09
-- Descripción: Limpia espacios en blanco de los nombres de usuario para asegurar coincidencias exactas.

UPDATE SPEED400AT.NEU_CABECERA
SET SUPERVISOR_ACTUAL = TRIM(SUPERVISOR_ACTUAL)
WHERE SUPERVISOR_ACTUAL IS NOT NULL;
