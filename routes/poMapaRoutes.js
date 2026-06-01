const express = require('express');
const router = express.Router();
const poMapaController = require('../controllers/poMapaController');

router.get('/cantidad-flota-por-taller', poMapaController.contarNeumaticos)

router.get('/todos-los-talleres', poMapaController.todosLosTalleres)

module.exports = router;