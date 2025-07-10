const mongoose = require('mongoose');

// Schema para los datos de la base de datos
const databaseSubschema = new mongoose.Schema({
  engine: {
    type: String,
    enum: ['postgres', 'mysql', 'mongodb', 'sqlite', 'redis'],
    required: true
  },
  dbName: {
    type: String,
    required: true,
    trim: true
  },
  migrationTool: {
    type: String,
    trim: true,
    default: 'prisma'
  },
  connectionString: {
    type: String,
    trim: true
  }
}, {
  _id: true
});

// Schema para los esquemas de request/response
const schemaSubschema = new mongoose.Schema({
  type: {
    type: String,
    default: 'object'
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  required: [{
    type: String
  }]
}, {
  _id: false
});

// Schema para los endpoints
const endpointSubschema = new mongoose.Schema({
  operationId: {
    type: String,
    required: true,
    trim: true
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    uppercase: true
  },
  route: {
    type: String,
    required: true,
    trim: true
  },
  summary: {
    type: String,
    trim: true
  },
  schemas: {
    request: {
      type: schemaSubschema,
      default: null
    },
    response: {
      type: schemaSubschema,
      default: null
    }
  }
}, {
  _id: true
});

// Schema para los microservicios
const microserviceSubschema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'El nombre del microservicio no puede exceder 100 caracteres']
  },
  port: {
    type: Number,
    required: true,
    min: [1000, 'El puerto debe ser mayor a 1000'],
    max: [65535, 'El puerto debe ser menor a 65535']
  },
  language: {
    type: String,
    required: true,
    trim: true,
    default: 'node20'
  },
  dockerImage: {
    type: String,
    trim: true
  },
  database: {
    type: databaseSubschema,
    default: null
  },
  endpoints: [endpointSubschema],
  status: {
    type: String,
    enum: ['draft', 'ready', 'deployed'],
    default: 'draft'
  }
}, {
  _id: true,
  timestamps: true
});

// Schema para el historial de ejecuciones del generador
const generatorRunSubschema = new mongoose.Schema({
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  finishedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['success', 'failed'],
    required: true
  },
  logPath: {
    type: String,
    trim: true
  },
  openApiChecksum: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^[a-f0-9]{64}$/i.test(v); // SHA256 hash validation
      },
      message: 'El checksum debe ser un hash SHA256 válido'
    }
  }
}, {
  _id: true
});

// Schema principal del BackendProfile
const backendProfileSchema = new mongoose.Schema({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'El ID del proyecto es requerido'],
    index: true
  },
  openApi: {
    type: mongoose.Schema.Types.Mixed, // Puede ser String o Buffer
    required: [true, 'El YAML de OpenAPI es requerido']
  },
  architecture: {
    type: String,
    enum: ['microservices', 'monolith'],
    required: true,
    default: 'microservices'
  },
  microservices: [microserviceSubschema],
  generatorRuns: [generatorRunSubschema],
  status: {
    type: String,
    enum: ['pending', 'generated', 'failed', 'deployed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Índices para mejor rendimiento
backendProfileSchema.index({ projectId: 1 });
backendProfileSchema.index({ status: 1 });
backendProfileSchema.index({ 'microservices.name': 1 });

// Virtual para obtener el número total de endpoints
backendProfileSchema.virtual('totalEndpoints').get(function() {
  return this.microservices.reduce((total, microservice) => {
    return total + microservice.endpoints.length;
  }, 0);
});

// Virtual para obtener microservicios por estado
backendProfileSchema.virtual('microservicesByStatus').get(function() {
  const statusCount = { draft: 0, ready: 0, deployed: 0 };
  this.microservices.forEach(ms => {
    statusCount[ms.status]++;
  });
  return statusCount;
});

// Método para obtener la última ejecución del generador
backendProfileSchema.methods.getLastGeneratorRun = function() {
  if (this.generatorRuns.length === 0) return null;
  return this.generatorRuns.sort((a, b) => b.startedAt - a.startedAt)[0];
};

// Método para agregar una nueva ejecución del generador
backendProfileSchema.methods.addGeneratorRun = function(runData) {
  this.generatorRuns.push({
    startedAt: runData.startedAt || new Date(),
    finishedAt: runData.finishedAt || null,
    status: runData.status,
    logPath: runData.logPath,
    openApiChecksum: runData.openApiChecksum
  });
  return this.save();
};

// Middleware pre-save para validaciones adicionales
backendProfileSchema.pre('save', function(next) {
  // Validar que si la arquitectura es monolith, no haya múltiples microservicios
  if (this.architecture === 'monolith' && this.microservices.length > 1) {
    return next(new Error('Un proyecto monolítico no puede tener múltiples microservicios'));
  }
  
  // Validar puertos únicos
  const ports = this.microservices.map(ms => ms.port);
  const uniquePorts = [...new Set(ports)];
  if (ports.length !== uniquePorts.length) {
    return next(new Error('Los puertos de los microservicios deben ser únicos'));
  }
  
  next();
});

module.exports = mongoose.model('BackendProfile', backendProfileSchema);