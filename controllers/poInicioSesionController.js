const db = require('../config/db');

const login = async (req, res) => {
    // Validar que se envíen usuario y password
    if (!req.body.usuario || !req.body.password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    const { usuario, password } = req.body;
    try {
        const users = await db.query(
            `SELECT CH_CODI_USUARIO, VC_DESC_NOMB_USUARIO, VC_DESC_APELL_PATERNO, VC_DESC_APELL_MATERNO, CH_PASS_USUA, CH_ESTA_ACTIVO
             FROM SPEED400AT.MAE_USUARIO
             WHERE CH_CODI_USUARIO = ?`,
            [usuario]
        );
        const user = users[0];

        if (!user || String(user.CH_PASS_USUA).trim() !== String(password).trim()) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        if (user.CH_ESTA_ACTIVO !== 'A') {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }

        const perfiles = await db.query(
            `SELECT P.CH_CODI_PERFIL, PF.VC_DESC_PERFIL
             FROM SPEED400AT.MAE_PERFIL_MAE_USUARIO P
             JOIN SPEED400AT.MAE_PERFIL PF ON P.CH_CODI_PERFIL = PF.CH_CODI_PERFIL
             WHERE P.CH_CODI_USUARIO = ? AND P.CH_ESTA_PERFIL_USUA = 'A' AND PF.CH_ESTA_PERFIL = 'A'`,
            [usuario]
        );

        // Guarda el usuario en la sesión y fuerza el guardado
        req.session.user = {
            usuario: user.CH_CODI_USUARIO,
            nombre: user.VC_DESC_NOMB_USUARIO,
            apellido_paterno: user.VC_DESC_APELL_PATERNO,
            apellido_materno: user.VC_DESC_APELL_MATERNO,
            perfiles: perfiles.map(p => ({
                codigo: p.CH_CODI_PERFIL,
                descripcion: p.VC_DESC_PERFIL
            }))
        };
        req.session.save((err) => {
            if (err) {
                return res.status(500).json({ error: 'Error al guardar la sesión' });
            }
            res.json(req.session.user);
        });
    } catch (error) {
        res.status(500).json({ error: 'Error en el login' });
    }
};

const session = (req, res) => {
    if (req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

module.exports = { login, session };