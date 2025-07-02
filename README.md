# Backend - Project Manager

Backend del sistema de gestión de proyectos construido con Node.js, Express y MongoDB.

## Arquitectura

El backend sigue el patrón MVC (Model-View-Controller):

- **Models** (`/models`): Esquemas de Mongoose para MongoDB
- **Controllers** (`/controllers`): Lógica de negocio
- **Routes** (`/routes`): Definición de endpoints
- **Middleware** (`/middleware`): Middleware personalizado (autenticación)
- **Config** (`/config`): Configuración de la base de datos

## Estructura de Archivos

```
backend/
├── config/
│   └── database.js          # Configuración de MongoDB
├── controllers/
│   ├── authController.js     # Controlador de autenticación
│   ├── projectController.js  # Controlador de proyectos
│   └── userController.js     # Controlador de usuarios
├── middleware/
│   └── auth.js              # Middleware de autenticación JWT
├── models/
│   ├── Project.js           # Modelo de proyecto
│   └── User.js              # Modelo de usuario
├── routes/
│   ├── auth.js              # Rutas de autenticación
│   ├── projects.js          # Rutas de proyectos
│   └── users.js             # Rutas de usuarios
├── .env.example             # Variables de entorno de ejemplo
├── package.json
└── server.js                # Punto de entrada
```

## Configuración

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   ```
   
   Editar `.env` con tus valores:
   ```
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017/project-manager
   JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
   NODE_ENV=development
   ```

3. **Iniciar MongoDB:**
   - Local: Asegúrate de que MongoDB esté ejecutándose
   - Atlas: Usa la URI de conexión de MongoDB Atlas

4. **Ejecutar el servidor:**
   ```bash
   npm run dev
   ```

## Modelos de Datos

### Usuario (User)
- `name`: Nombre del usuario
- `email`: Email único
- `password`: Contraseña hasheada
- `avatar`: URL del avatar (opcional)
- `role`: Rol del usuario (default: 'user')
- `isActive`: Estado de la cuenta
- `createdAt`, `updatedAt`: Timestamps automáticos

### Proyecto (Project)
- `name`: Nombre del proyecto
- `description`: Descripción
- `status`: Estado ('planning', 'in-progress', 'completed', 'on-hold')
- `color`: Color en hexadecimal
- `techStack`: Array de tecnologías
- `githubUrl`: URL del repositorio (opcional)
- `userId`: Referencia al usuario propietario
- `pages`: Array de páginas del proyecto
- `isActive`: Estado del proyecto
- `createdAt`, `updatedAt`: Timestamps automáticos

#### Página (Page) - Subdocumento
- `name`: Nombre de la página
- `description`: Descripción (opcional)
- `route`: Ruta de la página
- `userStories`: Array de historias de usuario
- `createdAt`: Timestamp de creación

#### Historia de Usuario (UserStory) - Subdocumento
- `title`: Título de la historia
- `description`: Descripción detallada
- `priority`: Prioridad ('low', 'medium', 'high')
- `status`: Estado ('backlog', 'in-progress', 'review', 'completed')
- `estimatedHours`: Horas estimadas (opcional)
- `createdAt`: Timestamp de creación

## API Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Obtener usuario actual
- `POST /api/auth/verify-token` - Verificar token

### Proyectos
- `GET /api/projects` - Obtener proyectos del usuario
- `GET /api/projects/:id` - Obtener proyecto específico
- `POST /api/projects` - Crear proyecto
- `PUT /api/projects/:id` - Actualizar proyecto
- `DELETE /api/projects/:id` - Eliminar proyecto
- `POST /api/projects/:id/pages` - Agregar página
- `POST /api/projects/:projectId/pages/:pageId/user-stories` - Agregar historia de usuario

### Usuarios
- `GET /api/users/profile` - Obtener perfil
- `PUT /api/users/profile` - Actualizar perfil
- `PUT /api/users/change-password` - Cambiar contraseña
- `DELETE /api/users/account` - Desactivar cuenta

## Características

- ✅ Autenticación JWT
- ✅ Validación de datos con express-validator
- ✅ Middleware de seguridad (helmet, cors)
- ✅ Logging con morgan
- ✅ Conexión a MongoDB con Mongoose
- ✅ Esquemas y validaciones de datos
- ✅ Arquitectura MVC
- ✅ Manejo de errores
- ✅ Soft delete (isActive)

## Tecnologías

- **Node.js** - Runtime de JavaScript
- **Express.js** - Framework web
- **MongoDB** - Base de datos NoSQL
- **Mongoose** - ODM para MongoDB
- **JWT** - Autenticación
- **bcryptjs** - Hash de contraseñas
- **express-validator** - Validación de datos
- **helmet** - Seguridad
- **cors** - CORS
- **morgan** - Logging
- **dotenv** - Variables de entorno

### Utilidades

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|----- |
| GET | `/api/health` | Health check del servidor | ❌ |

## 🔐 Autenticación

El API utiliza JWT (JSON Web Tokens) para la autenticación. Para acceder a rutas protegidas, incluye el token en el header:

```
Authorization: Bearer <tu-jwt-token>
```

## 📝 Ejemplos de Uso

### Login
```bash
curl -X POST https://astrocode-eba407d9ef8a.herokuapp.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "admin123"
  }'
```

### Crear Proyecto
```bash
curl -X POST https://astrocode-eba407d9ef8a.herokuapp.com/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <tu-token>" \
  -d '{
    "name": "Mi Nuevo Proyecto",
    "description": "Descripción del proyecto",
    "status": "planning",
    "color": "#3B82F6",
    "techStack": ["React", "Node.js"]
  }'
```

## 🗂️ Estructura del Proyecto

```
backend/
├── data/
│   ├── users.js          # Datos y funciones de usuarios
│   └── projects.js       # Datos y funciones de proyectos
├── middleware/
│   └── auth.js           # Middleware de autenticación
├── routes/
│   ├── auth.js           # Rutas de autenticación
│   ├── projects.js       # Rutas de proyectos
│   └── users.js          # Rutas de usuarios
├── .env                  # Variables de entorno
├── package.json          # Dependencias y scripts
├── server.js             # Archivo principal del servidor
└── README.md             # Documentación
```

## 🧪 Usuarios de Prueba

El sistema incluye usuarios de demostración:

| Email | Contraseña | Rol |
|-------|------------|-----|
| admin@demo.com | admin123 | admin |
| user@demo.com | user123 | user |

## 🔒 Seguridad

- **Helmet**: Protección de headers HTTP
- **CORS**: Configuración de Cross-Origin Resource Sharing
- **bcryptjs**: Hash seguro de contraseñas
- **JWT**: Tokens seguros con expiración
- **Validación**: Validación robusta de entrada de datos
- **Rate Limiting**: (Recomendado para producción)

## 🚀 Despliegue

Para producción, asegúrate de:

1. Configurar variables de entorno apropiadas
2. Usar un JWT_SECRET fuerte y único
3. Configurar HTTPS
4. Implementar rate limiting
5. Usar una base de datos real (MongoDB, PostgreSQL, etc.)
6. Configurar logging apropiado
7. Implementar monitoreo

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.