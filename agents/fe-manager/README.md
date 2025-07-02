# FE Manager Agent

## Descripción

El **FE Manager Agent** es el orquestador central del sistema de generación de frontend. Se encarga de procesar historias de usuario, priorizarlas inteligentemente, y coordinar la generación de código frontend a través de múltiples agentes especializados.

## Características Principales

### 🧠 Priorización Inteligente
- Algoritmo de priorización basado en costo vs impacto
- Análisis de dependencias y riesgos
- Recomendaciones de tamaño de lote para sprints

### 🔄 Gestión de Back-pressure
- Control de tokens en tiempo real con Redis
- Límites configurables por minuto/hora/día
- Delays adaptativos basados en utilización

### 🔁 Sistema de Reintentos Inteligente
- Categorización automática de errores
- Backoff exponencial adaptativo
- Dead Letter Queue para errores irrecuperables

### 🔒 Seguridad Avanzada
- mTLS para comunicación entre servicios
- RBAC (Role-Based Access Control)
- Rate limiting y auditoría de seguridad

### 📊 Observabilidad Completa
- OpenTelemetry para trazabilidad distribuida
- Métricas detalladas de rendimiento
- Logging estructurado con Winston

### 🔌 Sistema de Plugins
- Hooks extensibles para personalización
- Carga dinámica de plugins
- API de eventos para integración

### 🧪 Testing Avanzado
- Contract testing con fixtures YAML
- Mocks de BullMQ para testing
- Cobertura de código completa

## Arquitectura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Dashboard     │    │  FE Orchestrator│    │    FE Agent     │
│   (Frontend)    │◄──►│   (Coordinator) │◄──►│  (Generator)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   FE Manager    │
                       │ (Orchestrator)  │
                       └─────────────────┘
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
            ┌─────────────┐ ┌─────────┐ ┌─────────────┐
            │    Redis    │ │ Prisma  │ │  ChromaDB   │
            │   (Queue)   │ │  (DB)   │ │ (Vectors)   │
            └─────────────┘ └─────────┘ └─────────────┘
```

## Instalación

### Prerrequisitos

- Node.js >= 18.0.0
- npm >= 8.0.0
- Redis >= 6.0
- PostgreSQL >= 13
- ChromaDB (opcional, para vectores)

### Configuración

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd fe-manager
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Configurar base de datos**
```bash
npm run prisma:generate
npm run prisma:migrate
```

5. **Construir el proyecto**
```bash
npm run build
```

## Uso

### Desarrollo
```bash
npm run dev
```

### Producción
```bash
npm start
```

### Testing
```bash
# Ejecutar todas las pruebas
npm test

# Ejecutar pruebas en modo watch
npm run test:watch

# Ejecutar contract tests
npm run test:contract
```

### Linting
```bash
# Verificar código
npm run lint

# Corregir automáticamente
npm run lint:fix
```

## API Endpoints

### Health Check
```http
GET /health
```

### Métricas
```http
GET /metrics
```

### Procesar Historias de Usuario
```http
POST /api/stories/process
Content-Type: application/json

{
  "stories": [
    {
      "id": "story-1",
      "title": "Login Form",
      "description": "Create a responsive login form with validation",
      "priority": "high",
      "pageId": "page-1",
      "projectId": "project-1"
    }
  ],
  "sprintContext": {
    "sprintId": "sprint-1",
    "capacity": 40,
    "teamSize": 4,
    "deadline": "2024-02-01"
  }
}
```

## Configuración

### Variables de Entorno

| Variable | Descripción | Valor por Defecto |
|----------|-------------|-------------------|
| `PORT` | Puerto del servidor | `3002` |
| `NODE_ENV` | Entorno de ejecución | `development` |
| `REDIS_URL` | URL de Redis | `redis://localhost:6379` |
| `DATABASE_URL` | URL de PostgreSQL | - |
| `CHROMA_URL` | URL de ChromaDB | `http://localhost:8000` |
| `TOKEN_LIMIT_PER_MINUTE` | Límite de tokens por minuto | `1000` |
| `OTEL_ENABLED` | Habilitar OpenTelemetry | `true` |

### Configuración de Seguridad

```typescript
// Configuración mTLS
const securityConfig = {
  mtls: {
    enabled: process.env.MTLS_ENABLED === 'true',
    certPath: process.env.CERT_PATH,
    keyPath: process.env.KEY_PATH,
    caPath: process.env.CA_PATH
  },
  rbac: {
    roles: {
      'fe-orchestrator': ['queue:read', 'queue:write'],
      'fe-agent': ['queue:read', 'results:write'],
      'dashboard': ['metrics:read', 'status:read']
    }
  }
};
```

## Plugins

### Crear un Plugin

```typescript
// plugins/my-plugin.ts
import { Plugin, PluginContext } from '../src/plugins/PluginManager';

export class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';

  async onBeforeProcessStories(context: PluginContext): Promise<void> {
    console.log('Processing stories:', context.stories.length);
  }

  async onAfterProcessStories(context: PluginContext): Promise<void> {
    console.log('Stories processed successfully');
  }
}
```

### Registrar Plugin

```typescript
import { PluginManager } from './src/plugins/PluginManager';
import { MyPlugin } from './plugins/my-plugin';

const pluginManager = new PluginManager();
pluginManager.registerPlugin(new MyPlugin());
```

## Monitoreo

### Métricas Disponibles

- **Throughput**: Historias procesadas por minuto
- **Latencia**: Tiempo promedio de procesamiento
- **Errores**: Tasa de errores por tipo
- **Tokens**: Uso de tokens por servicio
- **Queue**: Tamaño y latencia de colas

### Dashboards

- **Grafana**: Métricas de rendimiento
- **Jaeger**: Trazas distribuidas
- **Redis Insight**: Estado de colas

## Troubleshooting

### Problemas Comunes

1. **Error de conexión a Redis**
   ```bash
   # Verificar que Redis esté ejecutándose
   redis-cli ping
   ```

2. **Error de base de datos**
   ```bash
   # Regenerar cliente Prisma
   npm run prisma:generate
   ```

3. **Límites de tokens excedidos**
   ```bash
   # Verificar configuración en .env
   TOKEN_LIMIT_PER_MINUTE=2000
   ```

### Logs

Los logs se almacenan en:
- **Desarrollo**: Console output
- **Producción**: `logs/fe-manager.log`

### Debug Mode

```bash
# Habilitar logs de debug
LOG_LEVEL=debug npm run dev
```

## Contribución

1. Fork el repositorio
2. Crear una rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit los cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear un Pull Request

### Estándares de Código

- **TypeScript**: Tipado estricto
- **ESLint**: Linting automático
- **Prettier**: Formateo de código
- **Jest**: Testing unitario
- **Conventional Commits**: Mensajes de commit

## Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

## Soporte

Para soporte técnico:
- 📧 Email: support@project.com
- 💬 Slack: #fe-manager-support
- 📖 Docs: [Documentación completa](https://docs.project.com)