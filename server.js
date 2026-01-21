const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./config/db");
const session = require("express-session");

const poNeumaticoRoutes = require("./routes/poNeumaticoRoutes");
const poSupervisoresRoutes = require("./routes/poSupervisorRoutes");
const padronRoutes = require("./routes/poPadron");
const poBuscarVehiculoRoutes = require("./routes/poBuscarVehiculoRoutes");

const poAsignadosRoutes = require("./routes/poAsignadosRoutes");
const poAsignarNeumaticoRoutes = require("./routes/poAsignarNeumaticoRoutes");
const poInicioSesionRoutes = require("./routes/poInicioSesionRoutes");
const poInspeccionRoutes = require("./routes/poInspeccionRoutes");
const porMovimientoRoutes = require("./routes/porMovimientoRoutes");
const poMantenimientoRoutes = require("./routes/poMantenimientoRoutes");
const poReporteRoutes = require("./routes/poReporteRoutes");

const swaggerUi = require("swagger-ui-express");
const swaggerJSDoc = require("swagger-jsdoc");

const app = express();

const allowedOrigins = [
  "http://192.168.5.207:3000",
  "http://192.168.4.13:3000",
  "http://192.168.5.207:3001",
  "http://192.168.100.182:3000",
  "http://localhost:3000",
  process.env.URL_GESNEU_WEB,
  null, // Para peticiones sin origin (opcional, para pruebas locales)
];
app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como Postman o curl)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
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

// Configura express-session
app.use(
  session({
    secret: process.env.SESSION_SECRET, // Usar variable de entorno
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // true si usas HTTPS
      httpOnly: true,
      sameSite: "lax",
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
app.use("/api/po-supervisores", poSupervisoresRoutes);
app.use("/api/po-padron", padronRoutes);
app.use("/api/vehiculo", poBuscarVehiculoRoutes);
app.use("/api/po-asignar-neumatico", poAsignarNeumaticoRoutes);
app.use("/api/inspeccion", poInspeccionRoutes);
app.use("/api/po-movimiento", porMovimientoRoutes);
app.use("/api", poMantenimientoRoutes);
app.use("/api/po-reportes", poReporteRoutes);

// Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🟢 Servidor corriendo en http://0.0.0.0:${PORT}`);
  await db.connect();
});
