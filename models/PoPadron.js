const express = require('express');
const router = express.Router();
const { cargarPadronDesdeExcel } = require('../controllers/poPadronController');

router.get('/cargar-padron', cargarPadronDesdeExcel); // GET solo para pruebas

module.exports = router;
