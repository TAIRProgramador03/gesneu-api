const express = require('express');
const router = express.Router();
const Mobileauthcontroller = require('../controllers/Mobileauthcontroller');
const { verificarToken } = require('../middlewares/mobileAuthMiddleware');
const { snapshotNeumaticosController } = require('../controllers/mobileSnapshotController');
const { snapshotVehiculosController } = require('../controllers/mobileVehiculosController');
const { batchSyncController } = require('../controllers/mobileSyncBatchController');
const { inspeccionesController, detalleInspeccionController } = require('../controllers/mobileHistorialController');

router.post('/auth/login', Mobileauthcontroller.loginController)

router.use(verificarToken);

router.post('/auth/refresh', Mobileauthcontroller.refreshController);
router.get('/sync/neumaticos/snapshot', snapshotNeumaticosController);
router.get('/sync/vehiculos/snapshot', snapshotVehiculosController);
router.post('/sync/batch', batchSyncController);
router.get('/historial/inspecciones', inspeccionesController);
router.get('/historial/inspecciones/detalle', detalleInspeccionController);

module.exports = router;