const mongoose = require('mongoose');

// Schema para logs de infraestructura y sistema
const logSchema = new mongoose.Schema({
  // Identificación del contexto
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'El ID del proyecto es requerido'],
    index: true
  },
  
  // Información del log
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error', 'fatal'],
    required: [true, 'El nivel del log es requerido'],
    index: true
  },
  
  service: {
    type: String,
    required: [true, 'El servicio es requerido'],
    trim: true,
    maxlength: [100, 'El nombre del servicio no puede exceder 100 caracteres'],
    index: true
  },
  
  component: {
    type: String,
    trim: true,
    maxlength: [100, 'El componente no puede exceder 100 caracteres'],
    index: true
  },
  
  message: {
    type: String,
    required: [true, 'El mensaje es requerido'],
    trim: true,
    maxlength: [2000, 'El mensaje no puede exceder 2000 caracteres']
  },
  
  // Contexto técnico
  context: {
    // Request/Response info
    requestId: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    sessionId: String,
    
    // HTTP info
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']
    },
    url: String,
    statusCode: Number,
    responseTime: Number, // en ms
    
    // Error info
    errorCode: String,
    errorType: String,
    stackTrace: String,
    
    // Performance info
    memoryUsage: Number, // en MB
    cpuUsage: Number, // en porcentaje
    
    // Database info
    queryTime: Number, // en ms
    queryCount: Number,
    
    // Datos adicionales
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Información del entorno
  environment: {
    type: String,
    enum: ['development', 'staging', 'production', 'test'],
    default: 'development',
    index: true
  },
  
  // Información del servidor/instancia
  instance: {
    hostname: String,
    pid: Number,
    version: String,
    nodeVersion: String
  },
  
  // Geolocalización (para logs de requests)
  location: {
    ip: String,
    country: String,
    city: String,
    userAgent: String
  },
  
  // Tags para filtrado
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Cada tag no puede exceder 50 caracteres']
  }],
  
  // Correlación con otros logs
  correlationId: {
    type: String,
    index: true
  },
  
  // Control de retención
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 } // TTL index
  }
}, {
  timestamps: true
});

// Índices compuestos para consultas eficientes
logSchema.index({ projectId: 1, level: 1, createdAt: -1 });
logSchema.index({ service: 1, level: 1, createdAt: -1 });
logSchema.index({ environment: 1, level: 1, createdAt: -1 });
logSchema.index({ 'context.userId': 1, createdAt: -1 });
logSchema.index({ correlationId: 1, createdAt: -1 });
logSchema.index({ tags: 1, createdAt: -1 });

// Método estático para obtener logs con filtros
logSchema.statics.getLogs = function(projectId, options = {}) {
  const {
    limit = 100,
    skip = 0,
    level = null,
    service = null,
    component = null,
    environment = null,
    startDate = null,
    endDate = null,
    tags = null,
    correlationId = null
  } = options;
  
  let query = { projectId };
  
  if (level) {
    if (Array.isArray(level)) {
      query.level = { $in: level };
    } else {
      query.level = level;
    }
  }
  
  if (service) query.service = service;
  if (component) query.component = component;
  if (environment) query.environment = environment;
  if (correlationId) query.correlationId = correlationId;
  
  if (tags && tags.length > 0) {
    query.tags = { $in: tags };
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .populate('context.userId', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Método para obtener estadísticas de logs
logSchema.statics.getLogStats = function(projectId, timeRange = '24h') {
  const now = new Date();
  let startDate;
  
  switch (timeRange) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return this.aggregate([
    {
      $match: {
        projectId: new mongoose.Types.ObjectId(projectId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          level: '$level',
          service: '$service'
        },
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$context.responseTime' },
        lastOccurrence: { $max: '$createdAt' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

// Middleware para establecer TTL automático basado en el nivel
logSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const now = new Date();
    let retentionHours;
    
    switch (this.level) {
      case 'debug':
        retentionHours = 24; // 1 día
        break;
      case 'info':
        retentionHours = 72; // 3 días
        break;
      case 'warn':
        retentionHours = 168; // 7 días
        break;
      case 'error':
      case 'fatal':
        retentionHours = 720; // 30 días
        break;
      default:
        retentionHours = 72;
    }
    
    this.expiresAt = new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
  }
  next();
});

module.exports = mongoose.model('Log', logSchema);