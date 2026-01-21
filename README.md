# 🚛 GesNeumatico Backend - Sistema de Gestión de Neumáticos

Backend de aplicación para la gestión integral de neumáticos con integración a AS400/iSeries DB2.

## 📋 Descripción

Sistema backend desarrollado en Node.js/Express que proporciona una API REST para la gestión completa de neumáticos, incluyendo:

- **Módulo I**: Visibilidad de estados "Baja Definitiva" y "Recuperados" 
- Gestión de padrón de neumáticos unificado
- Integración con base de datos AS400/iSeries DB2
- Autenticación y autorización por perfiles de usuario
- API RESTful documentada con Swagger

## 🚀 Tecnologías

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Base de Datos**: IBM AS400/iSeries DB2 (via ODBC)
- **Autenticación**: Express Sessions
- **Documentación**: Swagger UI
- **CORS**: Configurado para frontend
- **Middleware**: Express JSON, URL-encoded

## 🛠️ Instalación

### Prerrequisitos

1. **Node.js** 18 o superior
2. **IBM i Access ODBC Driver** instalado y configurado
3. **Conexión** a AS400/iSeries con credenciales válidas

### Configuración

1. **Clonar el repositorio**
```bash
git clone <url-del-repositorio>
cd GesNeumatico-Backend
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
# Crear archivo .env
cp .env.example .env
```

Editar `.env` con tus credenciales:
```env
# Configuración AS400/iSeries
AS400_HOST=tu-servidor-as400
AS400_USER=tu-usuario
AS400_PASSWORD=tu-password
AS400_DSN=AS400_SYSTEM

# Configuración del servidor
PORT=3006
NODE_ENV=development

# Configuración de sesiones
SESSION_SECRET=tu-clave-secreta-muy-segura
```

4. **Configurar ODBC** (macOS/Linux)
```bash
# Editar ~/.odbc.ini
[AS400_SYSTEM]
Driver=/opt/ibm/iaccess/lib64/libcwbodbc.so
System=tu-servidor-as400
UserID=tu-usuario
Password=tu-password
```

## 📊 Base de Datos

### Vista Unificada Principal
El sistema utiliza la vista `VW_NEUMATICOS_UNIFICADOS` que consolida:

- **PO_NEUMATICO**: Neumáticos operativos (558 registros)
- **NEU_ELIMINADO**: Neumáticos en baja definitiva (1 registro)
- **NEU_RECUPERADO**: Neumáticos recuperados (1 registro)
- **Total**: 560 registros unificados

### Esquemas Utilizados
- `SPEED400AT.PO_NEUMATICO`
- `SPEED400AT.NEU_ELIMINADO` 
- `SPEED400AT.NEU_RECUPERADO`
- `SPEED400AT.MAE_USUARIO`
- `SPEED400AT.PO_SUPERVISOR`

## 🚀 Uso

### Iniciar el servidor
```bash
# Desarrollo
npm start

# Con nodemon (desarrollo)
npm run dev
```

El servidor estará disponible en: `http://localhost:3006`

### Documentación API
Swagger UI disponible en: `http://localhost:3006/api-docs`

## 📡 Endpoints Principales

### Autenticación
- `POST /api/login` - Iniciar sesión
- `GET /api/session` - Verificar sesión
- `POST /api/logout` - Cerrar sesión

### Neumáticos (Módulo Principal)
- `GET /api/po-neumaticos` - Obtener padrón de neumáticos
- `GET /api/po-neumaticos/cantidad` - Cantidad total de neumáticos
- `GET /api/po-neumaticos/disponibles/cantidad` - Cantidad disponibles
- `GET /api/po-neumaticos/asignados/cantidad` - Cantidad asignados

### Módulo I - Estados Especiales
- `GET /api/po-neumaticos/todos` - Vista unificada completa
- `GET /api/po-neumaticos/baja-definitiva/cantidad` - Cantidad en baja definitiva
- `GET /api/po-neumaticos/recuperados/cantidad` - Cantidad recuperados
- `GET /api/po-neumaticos/baja-definitiva` - Listado baja definitiva
- `GET /api/po-neumaticos/recuperados` - Listado recuperados

## 🔐 Perfiles de Usuario

- **005 (OPERACIONES)**: Acceso completo a todos los neumáticos
- **002 (JEFE DE TALLER)**: Acceso limitado a neumáticos asignados
- **Otros**: Sin acceso a recursos de neumáticos

## 🏗️ Arquitectura

```
src/
├── config/
│   ├── db.js          # Configuración ODBC DB2
│   └── swagger.js     # Configuración Swagger
├── controllers/
│   ├── poNeumaticoController.js    # Controlador principal
│   ├── poInicioSesionController.js # Autenticación
│   └── ...            # Otros controladores
├── middlewares/
│   └── upload.js      # Middleware archivos
├── models/
│   └── ...            # Modelos de datos
├── routes/
│   ├── poNeumaticoRoutes.js        # Rutas neumáticos
│   ├── poInicioSesionRoutes.js     # Rutas auth
│   └── ...            # Otras rutas
└── server.js          # Punto de entrada
```

## 🧪 Testing

```bash
# Probar conexión DB
npm run test:db

# Probar endpoints Módulo I
npm run test:modulo1
```

## 🚀 Deploy

### Variables de Entorno Producción
```env
NODE_ENV=production
PORT=3006
AS400_HOST=servidor-produccion
# ... otras variables
```

### PM2 (Recomendado)
```bash
# Instalar PM2
npm install -g pm2

# Iniciar aplicación
pm2 start server.js --name "gesneumatico-backend"

# Ver logs
pm2 logs gesneumatico-backend
```

## 📈 Monitoreo

- **Logs**: Console logs con timestamps
- **Health Check**: `GET /health`
- **Status**: Verificación automática de conexión DB2

## 🤝 Contribución

1. Fork del proyecto
2. Crear rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add: AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📝 Changelog

### v1.0.0 - Módulo I Implementado (2025-11-03)
- ✅ Vista unificada VW_NEUMATICOS_UNIFICADOS (560 registros)
- ✅ Endpoints para estados "Baja Definitiva" y "Recuperados"
- ✅ Corrección conteo total de neumáticos
- ✅ Integración completa con frontend
- ✅ Documentación Swagger actualizada

## 🛡️ Seguridad

- Validación de sesiones en todos los endpoints protegidos
- Filtrado por perfil de usuario (RBAC)
- Sanitización de queries SQL
- CORS configurado específicamente

## 📞 Soporte

Para soporte técnico:
- **Email**: soporte@gesneumatico.com
- **Issues**: GitHub Issues del proyecto

## 📄 Licencia

Proyecto propietario - Todos los derechos reservados.

---

**Desarrollado con ❤️ para la gestión eficiente de neumáticos**