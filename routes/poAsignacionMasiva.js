const express = require('express');
const router = express.Router();
const poAsignacionMasivaController = require('../controllers/poAsignacionMasivaController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/validar', upload.single('archivo'), poAsignacionMasivaController.validarArchivoMasivo);
router.get('/plantilla', poAsignacionMasivaController.descargarPlantilla);
router.post('/confirmar', poAsignacionMasivaController.confirmarArchivoMasivo);
router.get('/lotes/:batchId', poAsignacionMasivaController.obtenerLoteMasivo);
router.get('/reporte/:batchId', poAsignacionMasivaController.descargarReporte);

module.exports = router;