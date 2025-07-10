const mongoose = require('mongoose');

// Schema para elementos del feed del proyecto
const feedSchema = new mongoose.Schema({
  // Identificación y contexto
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'El ID del proyecto es requerido'],
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El ID del usuario es requerido'],
    index: true
  },
  
  // Información del evento
  eventType: {
    type: String,
    enum: [
      'project_created',
      'project_updated', 
      'page_added',
      'page_updated',
      'user_story_created',
      'user_story_completed',
      'github_commit',
      'github_pr_opened',
      'github_pr_merged',
      'deployment',
      'comment_added',
      'status_changed',
      'tech_stack_updated',
      'auth_config_updated'
    ],
    required: [true, 'El tipo de evento es requerido'],
    index: true
  },
  
  title: {
    type: String,
    required: [true, 'El título del evento es requerido'],
    trim: true,
    maxlength: [200, 'El título no puede exceder 200 caracteres']
  },
  
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    trim: true,
    maxlength: [1000, 'La descripción no puede exceder 1000 caracteres']
  },
  
  // Actor del evento
  actor: {
    name: {
      type: String,
      required: [true, 'El nombre del actor es requerido'],
      trim: true
    },
    avatar: {
      type: String,
      default: null
    },
    type: {
      type: String,
      enum: ['user', 'system', 'ai', 'github'],
      default: 'user'
    }
  },
  
  // Metadatos del evento
  metadata: {
    // Para commits de GitHub
    commitHash: String,
    commitMessage: String,
    branch: String,
    
    // Para PRs
    prNumber: Number,
    prTitle: String,
    
    // Para páginas y user stories
    pageId: String,
    pageName: String,
    userStoryId: String,
    userStoryTitle: String,
    
    // Para cambios de estado
    previousValue: String,
    newValue: String,
    
    // Para despliegues
    environment: {
      type: String,
      enum: ['development', 'staging', 'production']
    },
    deploymentUrl: String,
    
    // Datos adicionales flexibles
    additionalData: mongoose.Schema.Types.Mixed
  },
  
  // Prioridad visual
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
    index: true
  },
  
  // Icono para la UI
  icon: {
    type: String,
    default: 'activity',
    trim: true
  },
  
  // Color para la UI
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'El color debe ser un código hexadecimal válido']
  },
  
  // Control de visibilidad
  isVisible: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Soft delete
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Índices compuestos para consultas eficientes
feedSchema.index({ projectId: 1, createdAt: -1 });
feedSchema.index({ userId: 1, createdAt: -1 });
feedSchema.index({ eventType: 1, createdAt: -1 });
feedSchema.index({ projectId: 1, eventType: 1, createdAt: -1 });
feedSchema.index({ isVisible: 1, isActive: 1, createdAt: -1 });

// Método estático para obtener feed de un proyecto
feedSchema.statics.getProjectFeed = function(projectId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    eventTypes = null,
    priority = null,
    startDate = null,
    endDate = null
  } = options;
  
  let query = {
    projectId,
    isVisible: true,
    isActive: true
  };
  
  if (eventTypes && eventTypes.length > 0) {
    query.eventType = { $in: eventTypes };
  }
  
  if (priority) {
    query.priority = priority;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .populate('userId', 'name avatar')
    .populate('projectId', 'name color')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Método para limpiar entradas antiguas (retención de semanas/meses)
feedSchema.statics.cleanupOldEntries = function(retentionDays = 90) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  return this.deleteMany({
    createdAt: { $lt: cutoffDate }
  });
};

module.exports = mongoose.model('Feed', feedSchema);