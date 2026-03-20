const express = require("express");
const router = express.Router();
const poNeumaticosDisponiblesController = require("../controllers/poNeumaticosDisponiblesController");

router.get('/', poNeumaticosDisponiblesController.listarNeumaticosDisponibles);


module.exports = router;
