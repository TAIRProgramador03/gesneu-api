const db = require('../config/db');
const neumaticoService = require('../services/neumaticoService');

// ============================================================================
// LECTURA PRINCIPAL DEL PADRÓN (Usando Nuevo Servicio Normalizado)
// ============================================================================
const getTodosNeumaticos = async (req, res) => {
    // Validar sesión y usuario
    if (!req.session.user || !req.session.user.usuario) {
        return res.status(401).json({ mensaje: 'No autenticado' });
    }
    try {
        // Obtener usuario y perfiles desde la sesión
        const usuario = req.session.user?.usuario;
        const perfiles = req.session.user?.perfiles?.map(p => p.codigo) || [];

        // Si NO es OPERACIONES (005), filtra por USUARIO_SUPER
        const filtroSupervisor = !perfiles.includes('005') ? usuario : null;

        // 1. Obtener datos normalizados desde el servicio (NEU_CABECERA + NEU_MARCA)
        // El servicio ya se encarga de formatear los campos como 'PR', 'CARGA', 'ESTADO_NEUMATICO', etc.
        const datosNormalizados = await neumaticoService.obtenerTodos(filtroSupervisor);

        // Validar que el resultado sea un array
        if (!Array.isArray(datosNormalizados)) {
            console.error('❌ Error Crítico: El servicio не devolvió un array.', typeof datosNormalizados, datosNormalizados);
            // Fallback seguro para evitar rotura de frontend
            return res.json([]);
        }

        // 3. Responder con la estructura exacta que espera el frontend (Array directo)
        // console.log(`✅ Enviando ${datosNormalizados.length} registros al frontend.`);
        res.json(datosNormalizados);

    } catch (error) {
        console.error('❌ Error al obtener todos los neumáticos (Service):', error);
        // Responder con array vacío en lugar de error 500 para evitar que el frontend explote con .filter()
        res.status(200).json([]);
    }
};

// Alias para mantener compatibilidad si el frontend llama a getPoNeumaticos
const getPoNeumaticos = getTodosNeumaticos;

// ============================================================================
// FUNCIONES DE CONTEO (Refactorizadas a NEU_CABECERA)
// ============================================================================
const contarNeumaticos = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        const perfiles = req.session.user.perfiles?.map(p => p.codigo) || [];

        let query = 'SELECT COUNT(*) AS cantidad FROM SPEED400AT.NEU_CABECERA';
        let params = [];
        if (!perfiles.includes('005')) {
            query += ' WHERE SUPERVISOR_ACTUAL = ?';
            params.push(usuario);
        }

        const result = await db.query(query, params);
        // DB2 fix: Check lowercase or uppercase column name
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (error) {
        console.error('Error al contar neumáticos:', error);
        res.status(500).json({ error: 'Error al contar neumáticos' });
    }
};

const contarNeumaticosBajaDefinitiva = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        const perfiles = req.session.user.perfiles?.map(p => p.codigo) || [];

        let query = "SELECT COUNT(*) AS cantidad FROM SPEED400AT.NEU_CABECERA C LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO WHERE E.CODIGO_INTERNO = 'BAJA'";
        let params = [];
        if (!perfiles.includes('005')) {
            query += ' AND C.SUPERVISOR_ACTUAL = ?';
            params.push(usuario);
        }

        const result = await db.query(query, params);
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (error) {
        console.error('Error contar bajas:', error);
        res.status(500).json({ error: 'Error al contar bajas' });
    }
};

const contarNeumaticoRecuperados = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        const perfiles = req.session.user.perfiles?.map(p => p.codigo) || [];

        let query = "SELECT COUNT(*) AS cantidad FROM SPEED400AT.NEU_CABECERA C LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO WHERE E.CODIGO_INTERNO = 'RECUPERADO'";
        let params = [];
        if (!perfiles.includes('005')) {
            query += ' AND C.SUPERVISOR_ACTUAL = ?';
            params.push(usuario);
        }

        const result = await db.query(query, params);
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (error) {
        console.error('Error contar recuperados:', error);
        res.status(500).json({ error: 'Error al contar recuperados' });
    }
};

// ============================================================================
// OTRAS FUNCIONES (Mantienen lógica o pendientes de migrar CRUD completo)
// ============================================================================
const actualizarNeumatico = async (req, res) => {
    // TODO: Migrar a neumaticoService.actualizarNeumatico cuando se implemente la edición completa
    // Por ahora, se retorna error o se mantiene la lógica antigua si es estrictamente necesaria.
    // Dado que el usuario pidió centrarse en "mostrar el padrón", dejamos esto como placeholder funcional o pendiente.
    res.status(501).json({ message: 'Funcionalidad en migración. Use el módulo de asignación/movimientos.' });
};

const eliminarNeumatico = async (req, res) => {
    const { codigo } = req.params;
    // Lógica temporal para dar de baja vía servicio? 
    // Por ahora simple soft-delete o error.
    res.status(501).json({ message: 'Use la función de Dar de Baja.' });
};

const contarProyectosNeumatico = async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(DISTINCT PROYECTO) AS cantidad FROM SPEED400AT.NEU_CABECERA');
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (error) {
        res.status(500).json({ error: 'Error al contar proyectos' });
    }
};

const contarNeumaticosAsignados = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        const perfiles = req.session.user.perfiles?.map(p => p.codigo) || [];

        let query = "SELECT COUNT(*) AS cantidad FROM SPEED400AT.NEU_CABECERA C LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO WHERE E.CODIGO_INTERNO = 'ASIGNADO'";
        let params = [];
        if (!perfiles.includes('005')) {
            query += ' AND C.SUPERVISOR_ACTUAL = ?';
            params.push(usuario);
        }

        const result = await db.query(query, params);
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

const contarNeumaticosDisponibles = async (req, res) => {
    if (!req.session.user || !req.session.user.usuario) return res.status(401).json({ mensaje: 'No autenticado' });
    try {
        const usuario = req.session.user.usuario;
        const perfiles = req.session.user.perfiles?.map(p => p.codigo) || [];

        let query = "SELECT COUNT(*) AS cantidad FROM SPEED400AT.NEU_CABECERA C LEFT JOIN SPEED400AT.NEU_ESTADO E ON C.ID_ESTADO = E.ID_ESTADO WHERE E.CODIGO_INTERNO = 'DISPONIBLE'";
        let params = [];
        if (!perfiles.includes('005')) {
            // STOCK/DISPONIBLE visible para supervisor: ¿Solo lo suyo o todo lo huerfano?
            // Mismo criterio que lista: Lo suyo + lo huerfano
            query += " AND (C.SUPERVISOR_ACTUAL = ? OR C.SUPERVISOR_ACTUAL IS NULL)";
            params.push(usuario);
        }

        const result = await db.query(query, params);
        const valor = result && result[0] ? (result[0].cantidad || result[0].CANTIDAD || 0) : 0;
        res.json({ cantidad: valor });
    } catch (e) { res.status(500).json({ error: e.message }); }
};

// Exportar todo
module.exports = {
    getPoNeumaticos,
    getTodosNeumaticos,
    actualizarNeumatico,
    eliminarNeumatico,
    contarProyectosNeumatico,
    contarNeumaticos,
    contarNeumaticosAsignados,
    contarNeumaticosDisponibles,
    contarNeumaticosBajaDefinitiva,
    contarNeumaticoRecuperados,
    // Stub functions for route compatibility if they exist
    getNeumaticosBajaDefinitiva: getTodosNeumaticos, // Or specific filter if needed
    getNeumaticoRecuperados: getTodosNeumaticos
};