const mongoose = require('mongoose');

const userStorySchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: [true, 'El título de la historia de usuario es requerido'],
    trim: true,
    maxlength: [300, 'El título no puede exceder 300 caracteres'] // Aumentado para formato "Implementar US-X: Como usuario..."
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    trim: true,
    maxlength: [2000, 'La descripción no puede exceder 2000 caracteres'] // Aumentado para descripción detallada
  },
  // Nuevos campos para el formato solicitado
  pageContext: {
    type: String,
    trim: true,
    maxlength: [200, 'El contexto de página no puede exceder 200 caracteres']
  },
  affectedFiles: [{
    type: String,
    trim: true,
    maxlength: [300, 'La ruta del archivo no puede exceder 300 caracteres']
  }],
  componentsModules: {
    create: [{
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'El nombre del componente no puede exceder 100 caracteres']
      },
      type: {
        type: String,
        enum: ['component', 'hook', 'service', 'util', 'module'],
        default: 'component'
      }
    }],
    import: [{
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'El nombre del import no puede exceder 100 caracteres']
      },
      from: {
        type: String,
        trim: true,
        maxlength: [200, 'La fuente del import no puede exceder 200 caracteres']
      }
    }]
  },
  logicData: {
    type: String,
    trim: true,
    maxlength: [1000, 'La lógica/datos no puede exceder 1000 caracteres']
  },
  styling: {
    framework: {
      type: String,
      default: 'tailwind'
    },
    classes: {
      type: String,
      trim: true,
      maxlength: [500, 'Las clases de estilo no pueden exceder 500 caracteres']
    },
    colorCoding: {
      type: String,
      trim: true,
      maxlength: [200, 'La codificación de colores no puede exceder 200 caracteres']
    }
  },
  acceptanceCriteria: [{
    type: String,
    trim: true,
    maxlength: [300, 'Cada criterio de aceptación no puede exceder 300 caracteres']
  }],
  additionalSuggestions: [{
    type: String,
    trim: true,
    maxlength: [200, 'Cada sugerencia adicional no puede exceder 200 caracteres']
  }],
  aiEditorTask: {
    type: String,
    trim: true,
    maxlength: [500, 'La tarea del editor IA no puede exceder 500 caracteres']
  },
  // Campos originales
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  estimatedHours: {
    type: Number,
    min: [0, 'Las horas estimadas no pueden ser negativas'],
    default: 0
  }
}, {
  timestamps: true
});

const pageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: [true, 'El nombre de la página es requerido'],
    trim: true,
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  route: {
    type: String,
    required: [true, 'La ruta es requerida'],
    trim: true
  },
  userStories: [userStorySchema]
}, {
  timestamps: true
});

const userTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del tipo de usuario es requerido'],
    trim: true,
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'La descripción no puede exceder 200 caracteres']
  },
  permissions: [{
    type: String,
    trim: true
  }],
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  _id: true
});

const authConfigSchema = new mongoose.Schema({
  hasLogin: {
    type: Boolean,
    default: false
  },
  authMethod: {
    type: String,
    enum: ['none', 'basic', 'jwt', 'oauth', 'session', 'custom'],
    default: 'none'
  },
  oauthProviders: [{
    type: String,
    enum: ['google', 'github', 'facebook', 'twitter', 'linkedin', 'microsoft'],
    trim: true
  }],
  requiresEmailVerification: {
    type: Boolean,
    default: false
  },
  passwordPolicy: {
    minLength: {
      type: Number,
      default: 8,
      min: [6, 'La longitud mínima debe ser al menos 6']
    },
    requireUppercase: {
      type: Boolean,
      default: false
    },
    requireLowercase: {
      type: Boolean,
      default: false
    },
    requireNumbers: {
      type: Boolean,
      default: false
    },
    requireSpecialChars: {
      type: Boolean,
      default: false
    }
  },
  sessionTimeout: {
    type: Number,
    default: 3600, // 1 hour in seconds
    min: [300, 'El timeout mínimo es 5 minutos (300 segundos)']
  },
  multiFactorAuth: {
    enabled: {
      type: Boolean,
      default: false
    },
    methods: [{
      type: String,
      enum: ['sms', 'email', 'totp', 'backup_codes'],
      trim: true
    }]
  },
  userTypes: [userTypeSchema]
}, {
  _id: false
});

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'El nombre del proyecto es requerido'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [100, 'El nombre no puede exceder 100 caracteres']
  },
  description: {
    type: String,
    required: [true, 'La descripción es requerida'],
    trim: true,
    minlength: [10, 'La descripción debe tener al menos 10 caracteres'],
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  status: {
    type: String,
    enum: ['planning', 'in-progress', 'completed', 'on-hold'],
    default: 'planning'
  },
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'El color debe ser un código hexadecimal válido']
  },
  colorTheme: [{
    type: String,
    match: [/^#[0-9A-F]{6}$/i, 'Cada color del tema debe ser un código hexadecimal válido'],
    trim: true
  }],
  techStack: [{
    type: String,
    trim: true
  }],
  githubUrl: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+/.test(v);
      },
      message: 'La URL de GitHub debe ser una URL válida'
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'El ID del usuario es requerido']
  },
  pages: [pageSchema],
  authConfig: {
    type: authConfigSchema,
    default: () => ({
      hasLogin: false,
      authMethod: 'none',
      oauthProviders: [],
      requiresEmailVerification: false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false
      },
      sessionTimeout: 3600,
      multiFactorAuth: {
        enabled: false,
        methods: []
      },
      userTypes: []
    })
  },
  // Nuevo campo para estructura de archivos
  fileStructure: {
    folders: [{
      path: {
        type: String,
        trim: true,
        maxlength: [500, 'La ruta de carpeta no puede exceder 500 caracteres']
      },
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'El nombre de carpeta no puede exceder 100 caracteres']
      },
      type: {
        type: String,
        enum: ['folder', 'feature', 'component', 'hook', 'style'],
        default: 'folder'
      }
    }],
    files: [{
      path: {
        type: String,
        trim: true,
        maxlength: [500, 'La ruta de archivo no puede exceder 500 caracteres']
      },
      name: {
        type: String,
        trim: true,
        maxlength: [100, 'El nombre de archivo no puede exceder 100 caracteres']
      },
      type: {
        type: String,
        enum: ['component', 'page', 'hook', 'api', 'config', 'style', 'route'],
        default: 'component'
      },
      description: {
        type: String,
        trim: true,
        maxlength: [300, 'La descripción del archivo no puede exceder 300 caracteres']
      }
    }],
    generatedAt: {
      type: Date,
      default: null
    },
    promptType: {
      type: String,
      enum: ['completo', 'minimalista'],
      default: 'minimalista'
    }
  },  // Nuevo campo para estudio de mercado

  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
projectSchema.index({ userId: 1, createdAt: -1 });
projectSchema.index({ name: 'text', description: 'text' });

// Virtual for total user stories count
projectSchema.virtual('totalUserStories').get(function() {
  return this.pages.reduce((total, page) => total + page.userStories.length, 0);
});

// Virtual for completed user stories count
projectSchema.virtual('completedUserStories').get(function() {
  return this.pages.reduce((total, page) => {
    return total + page.userStories.filter(story => story.status === 'completed').length;
  }, 0);
});

module.exports = mongoose.model('Project', projectSchema);