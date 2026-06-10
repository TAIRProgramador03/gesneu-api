const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./config/db");
const session = require("express-session");
const FileStore = require("session-file-store")(session);

const poNeumaticoRoutes = require("./routes/poNeumaticoRoutes");
const poSupervisoresRoutes = require("./routes/poSupervisorRoutes");
const padronRoutes = require("./routes/poPadron");
const poBuscarVehiculoRoutes = require("./routes/poBuscarVehiculoRoutes");

const poAsignadosRoutes = require("./routes/poAsignadosRoutes");
const poNeumaticosDisponiblesRoutes = require("./routes/poNeumaticosDisponiblesRoutes");
const poAsignarNeumaticoRoutes = require("./routes/poAsignarNeumaticoRoutes");
const poInicioSesionRoutes = require("./routes/poInicioSesionRoutes");
const poInspeccionRoutes = require("./routes/poInspeccionRoutes");
const porMovimientoRoutes = require("./routes/porMovimientoRoutes");
const poMantenimientoRoutes = require("./routes/poMantenimientoRoutes");
const poReporteRoutes = require("./routes/poReporteRoutes");
const poMapaRoutes = require("./routes/poMapaRoutes");

const swaggerUi = require("swagger-ui-express");
const swaggerJSDoc = require("swagger-jsdoc");

const app = express();

const allowedOrigins = [
  "http://192.168.5.207:3000",
  "http://192.168.4.13:3000",
  "http://192.168.4.51:3000",
  "http://192.168.4.143:3000",
  "http://192.168.5.207:3001",
  "http://192.168.100.182:3000",
  "http://localhost:3000",
  "https://gesneu.tair360.net",
  process.env.URL_GESNEU_WEB,
].filter(Boolean);
app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como Postman o curl)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(null, false);
      }
    },
    credentials: true,
  })
);
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Neumáticos TAIR",
      version: "1.0.0",
      description: "Documentación de la API para la gestión de neumáticos.",
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Configura express-session con FileStore (persiste sesiones en disco)
app.use(
  session({
    store: new FileStore({
      path: "./sessions",
      ttl: 8 * 60 * 60,        // TTL en segundos (igual que cookie.maxAge)
      retries: 0,               // sin reintentos — sesión inexistente = archivo no existe, punto
      reapInterval: 60 * 60,    // borra archivos de sesión expirados cada hora
      logFn: () => { },          // silencia warnings de sesiones expiradas/fantasma
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000, // 8 horas en ms
    },
  })
);


app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>API Neumáticos TAIR</title>
        <style>
          body { background: #fff; color: #111; font-family: Arial, sans-serif; margin: 40px; }
          .container { max-width: 600px; margin: auto; padding: 2em; border: 1px solid #222; border-radius: 8px; }
          h1 { font-size: 2em; margin-bottom: 0.5em; }
          p { margin: 0.5em 0; }
          code { background: #eee; padding: 2px 6px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>API Neumáticos TAIR</h1>
          <p><b>Estado:</b> <span style="color:green">🟢 En línea</span></p>
          <p>Bienvenido a la API de gestión de neumáticos.</p>
          <p>Consulta la documentación en <a href="/api-docs" target="_blank">/api-docs</a></p>
          <hr>
          <p><b>Rutas principales:</b></p>
          <ul>
            <li><code>GET /api/po-neumaticos</code></li>
            <li><code>GET /api/po-asignados</code></li>
            <li><code>GET /api/po-supervisores</code></li>
            <li><code>GET /api/po-padron</code></li>
            <li><code>GET /api/vehiculo</code></li>
            <li><code>GET /api/po-asignar-neumatico</code></li>
            <li><code>GET /api/inspeccion</code></li>
            <li><code>GET /api/po-movimiento</code></li>
            <li><code>GET /api/po-reportes</code></li>
          </ul>
          <p style="font-size:0.9em;color:#888;">&copy; 2026 Gesneu Ibarcena</p>
        </div>
      </body>
    </html>
  `);
});

// Rutas API
app.use("/api", poInicioSesionRoutes);
app.use("/api/po-neumaticos", poNeumaticoRoutes);
app.use("/api/po-asignados", poAsignadosRoutes);

app.use("/api/po-neumaticos-disponibles", poNeumaticosDisponiblesRoutes);

app.use("/api/po-supervisores", poSupervisoresRoutes);
app.use("/api/po-padron", padronRoutes);
app.use("/api/vehiculo", poBuscarVehiculoRoutes);
app.use("/api/po-asignar-neumatico", poAsignarNeumaticoRoutes);
app.use("/api/inspeccion", poInspeccionRoutes);
app.use("/api/po-movimiento", porMovimientoRoutes);
app.use("/api", poMantenimientoRoutes);
app.use("/api/po-reportes", poReporteRoutes);
app.use("/api/mapa", poMapaRoutes)
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const dbOk = await db.validate();
  if (dbOk) {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(503).json({ status: 'db_down' });
  }
});

// Error middleware — debe ir DESPUÉS de todas las rutas
// Captura errores de DB y cualquier error no manejado que llegue vía next(err)
app.use((err, req, res, next) => {
  if (err.code === 'DB_UNAVAILABLE') {
    return res.status(503).json({ error: 'Base de datos no disponible' });
  }
  console.error('❌ Error no capturado:', err.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`[${new Date().toISOString()}] 🟢 Servidor ARRANCÓ en http://0.0.0.0:${PORT} — PID ${process.pid}`);
  await db.connect();
});
