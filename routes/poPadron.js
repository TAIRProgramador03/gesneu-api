const express = require('express');
const router = express.Router();
const multer = require('multer');

const { cargarPadronDesdeExcel } = require('../controllers/poPadronController');

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @swagger
 * /api/po-padron/cargar-padron:
 *   post:
 *     summary: Cargar padrón de neumáticos desde un archivo Excel
 *     description: |
 *       Sube un archivo Excel (.xlsx) con los datos del padrón de neumáticos. El sistema detecta automáticamente los encabezados de las columnas, por lo que acepta variantes como "DISEÑO" o "DISENO", "FECHA FABRICACION", etc. **Ahora puedes enviar solo algunos de los campos y los faltantes se completarán como nulos o valores por defecto.**
 *       
 *       **Puedes incluir solo las columnas que desees cargar.** Las columnas que falten serán enviadas como null (o 0 para numéricos) al sistema. Solo se rechaza el archivo si no se reconoce ninguna columna relevante.
 *       
 *       **Columnas reconocidas (pueden variar en nombre):**
 *       - CODIGO
 *       - MARCA
 *       - MEDIDA
 *       - DISEÑO o DISENO
 *       - REMANENTE
 *       - PR
 *       - CARGA
 *       - VELOCIDAD
 *       - FECHA FABRICACION
 *       - RQ
 *       - OC
 *       - PROYECTO
 *       - COSTO
 *       - PROVEEDOR
 *       - FECHA COMPRA
 *       
 *       **Ejemplo de encabezados válidos en el Excel:**
 *       | CODIGO | MARCA | MEDIDA | DISEÑO | REMANENTE | PR | CARGA | VELOCIDAD | FECHA FABRICACION | RQ | OC | PROYECTO | COSTO | PROVEEDOR | FECHA COMPRA |
 *       |--------|-------|--------|--------|-----------|----|-------|-----------|-------------------|----|----|----------|-------|-----------|--------------|
 *       | 1001   | GOODYEAR | 215/75R16 | AT | 12 | 8 | 1000 | 120 | 2022 | 10 | 1 | PROYECTO A | 500.00 | PROV1 | 2024-01-01 |
 *     tags: [Padrón]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *                 description: Archivo Excel a cargar
 *     responses:
 *       200:
 *         description: Padrón actualizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mensaje:
 *                   type: string
 *                   example: "Padrón actualizado correctamente. Todos los registros fueron insertados."
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 insertados:
 *                   type: integer
 *                   example: 50
 *                 errores:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fila:
 *                         type: string
 *                         example: "1001"
 *                       mensaje:
 *                         type: string
 *                         example: "Error de formato en fecha de compra."
 *       400:
 *         description: Error en la solicitud (archivo faltante, formato incorrecto o columnas requeridas ausentes)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "El archivo Excel no contiene todas las columnas necesarias."
 *       500:
 *         description: Error interno al procesar el padrón
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error al procesar el padrón."
 *                 detalle:
 *                   type: string
 *                   example: "Fallo en la conexión con la base de datos."
 */
router.post('/cargar-padron', upload.single('archivo'), cargarPadronDesdeExcel);

module.exports = router;
