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
  },
  // Nuevo campo para estudio de mercado
  estudiodemercado: {
    resumenEjecutivo: {
      id: {
        type: String,
        trim: true
      },
      overview: {
        type: String,
        trim: true,
        maxlength: [1000, 'La visión general no puede exceder 1000 caracteres']
      },
      marketSize: {
        type: String,
        trim: true,
        maxlength: [500, 'El tamaño de mercado no puede exceder 500 caracteres']
      },
      marketGap: {
        type: String,
        trim: true,
        maxlength: [500, 'La brecha de mercado no puede exceder 500 caracteres']
      },
      opportunity: {
        type: String,
        trim: true,
        maxlength: [500, 'La oportunidad no puede exceder 500 caracteres']
      },
      keyPoints: [{
        type: String,
        trim: true,
        maxlength: [200, 'Cada punto clave no puede exceder 200 caracteres']
      }],
      createdAt: {
        type: Date,
        default: null
      },
      generatedByAI: {
        type: Boolean,
        default: false
      }
    },
    definicionMercado: {
      id: {
        type: String,
        trim: true
      },
      problemStatement: {
        type: String,
        trim: true,
        maxlength: [1000, 'La declaración del problema no puede exceder 1000 caracteres']
      },
      targetAudience: {
        type: String,
        trim: true,
        maxlength: [500, 'La audiencia objetivo no puede exceder 500 caracteres']
      },
      geography: {
        type: String,
        trim: true,
        maxlength: [300, 'La geografía no puede exceder 300 caracteres']
      },
      sector: {
        type: String,
        trim: true,
        maxlength: [200, 'El sector no puede exceder 200 caracteres']
      },
      keywords: [{
        type: String,
        trim: true,
        maxlength: [50, 'Cada palabra clave no puede exceder 50 caracteres']
      }],
      naicsCodes: [{
        type: String,
        trim: true,
        maxlength: [20, 'Cada código NAICS no puede exceder 20 caracteres']
      }],
      naceCodes: [{
        type: String,
        trim: true,
        maxlength: [20, 'Cada código NACE no puede exceder 20 caracteres']
      }],
      createdAt: {
        type: Date,
        default: null
      },
      generatedByAI: {
        type: Boolean,
        default: false
      }
    },
    segmentacion: {
      id: {
        type: String,
        trim: true
      },
      segments: [{
        name: {
          type: String,
          trim: true,
          maxlength: 200
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        tam: {
          type: String,
          trim: true,
          maxlength: 100
        },
        sam: {
          type: String,
          trim: true,
          maxlength: 100
        },
        som: {
          type: String,
          trim: true,
          maxlength: 100
        },
        characteristics: [{
          type: String,
          trim: true,
          maxlength: 200
        }]
      }],
      buyerPersonas: [{
        name: {
          type: String,
          trim: true,
          maxlength: 100
        },
        role: {
          type: String,
          trim: true,
          maxlength: 100
        },
        demographics: {
          age: {
            type: String,
            trim: true,
            maxlength: 50
          },
          income: {
            type: String,
            trim: true,
            maxlength: 100
          },
          education: {
            type: String,
            trim: true,
            maxlength: 100
          },
          location: {
            type: String,
            trim: true,
            maxlength: 100
          }
        },
        painPoints: [{
          type: String,
          trim: true,
          maxlength: 300
        }],
        goals: [{
          type: String,
          trim: true,
          maxlength: 300
        }],
        buyingBehavior: {
          type: String,
          trim: true,
          maxlength: 500
        }
      }],
      createdAt: {
        type: Date,
        default: Date.now
      },
      generatedByAI: {
        type: Boolean,
        default: true
      }
    },
    tamanoMercado: {
      id: {
        type: String,
        trim: true
      },
      tam: {
        value: {
          type: String,
          trim: true,
          maxlength: 100
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        methodology: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      },
      sam: {
        value: {
          type: String,
          trim: true,
          maxlength: 100
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        methodology: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      },
      som: {
        value: {
          type: String,
          trim: true,
          maxlength: 100
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        methodology: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      },
      historicalData: [{
        year: {
          type: Number
        },
        marketValue: {
          type: String,
          trim: true,
          maxlength: 100
        }
      }],
      dataSources: [{
        type: String,
        trim: true,
        maxlength: 200
      }],
      assumptions: [{
        type: String,
        trim: true,
        maxlength: 500
      }],
      createdAt: {
        type: Date,
        default: Date.now
      },
      generatedByAI: {
        type: Boolean,
        default: true
      }
    },
    tendencias: {
      id: {
        type: String,
        trim: true
      },
      cagr: {
        value: {
          type: String,
          trim: true,
          maxlength: 50
        },
        period: {
          type: String,
          trim: true,
          maxlength: 100
        },
        methodology: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      },
      growthDrivers: [{
        driver: {
          type: String,
          trim: true,
          maxlength: 200
        },
        description: {
          type: String,
          trim: true,
          maxlength: 500
        },
        impact: {
          type: String,
          trim: true,
          enum: ['Alto', 'Medio', 'Bajo', 'No especificado'],
          maxlength: 50
        }
      }],
      barriers: [{
        barrier: {
          type: String,
          trim: true,
          maxlength: 200
        },
        description: {
          type: String,
          trim: true,
          maxlength: 500
        },
        severity: {
          type: String,
          trim: true,
          enum: ['Alto', 'Medio', 'Bajo', 'No especificado'],
          maxlength: 50
        }
      }],
      techTrends: [{
        type: String,
        trim: true,
        maxlength: 300
      }],
      macroFactors: [{
        type: String,
        trim: true,
        maxlength: 300
      }],
      dataSources: [{
        type: String,
        trim: true,
        maxlength: 200
      }],
      createdAt: {
        type: Date,
        default: Date.now
      },
      generatedByAI: {
        type: Boolean,
        default: true
      }
    },
    competencia: {
      id: {
        type: String,
        trim: true
      },
      directCompetitors: [{
        name: {
          type: String,
          trim: true,
          maxlength: 200
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        marketShare: {
          type: String,
          trim: true,
          maxlength: 100
        },
        strengths: [{
          type: String,
          trim: true,
          maxlength: 300
        }],
        weaknesses: [{
          type: String,
          trim: true,
          maxlength: 300
        }],
        pricing: {
          type: String,
          trim: true,
          maxlength: 500
        },
        valueProposition: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      }],
      indirectCompetitors: [{
        name: {
          type: String,
          trim: true,
          maxlength: 200
        },
        description: {
          type: String,
          trim: true,
          maxlength: 1000
        },
        threat: {
          type: String,
          trim: true,
          enum: ['Alto', 'Medio', 'Bajo', 'No especificado'],
          maxlength: 50
        }
      }],
      competitiveMatrix: {
        factors: [{
          type: String,
          trim: true,
          maxlength: 200
        }],
        ourPosition: {
          type: String,
          trim: true,
          maxlength: 1000
        }
      },
      marketGaps: [{
        type: String,
        trim: true,
        maxlength: 500
      }],
      dataSources: [{
        type: String,
        trim: true,
        maxlength: 200
      }],
      createdAt: {
        type: Date,
        default: Date.now
      },
      generatedByAI: {
        type: Boolean,
        default: true
      }
    },
      pricing: {
      type: new mongoose.Schema({
        rangosPrecios: {
          minimo: { type: String, trim: true, maxlength: 50 },
          promedio: { type: String, trim: true, maxlength: 50 },
          maximo: { type: String, trim: true, maxlength: 50 },
          segmentacion: [{ type: String, trim: true, maxlength: 100 }]
        },
        elasticidad: {
          nivel: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          factores: [{ type: String, trim: true, maxlength: 200 }],
          puntosResistencia: [{ type: String, trim: true, maxlength: 200 }]
        },
        competidores: [{
          nombre: { type: String, trim: true, maxlength: 100 },
          precio: { type: String, trim: true, maxlength: 50 },
          estrategia: { type: String, trim: true, maxlength: 500 }
        }],
        disposicionPagar: {
          segmentoAlto: { type: String, trim: true, maxlength: 50 },
          segmentoMedio: { type: String, trim: true, maxlength: 50 },
          segmentoBajo: { type: String, trim: true, maxlength: 50 },
          factoresIncremento: [{ type: String, trim: true, maxlength: 200 }]
        },
        recomendacion: {
          precioInicial: { type: String, trim: true, maxlength: 50 },
          estrategia: { type: String, trim: true, maxlength: 500 },
          justificacion: { type: String, trim: true, maxlength: 1000 }
        },
        id: { type: String, default: () => uuidv4() },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
       canalesDistribucion: {
      type: new mongoose.Schema({
        canalesActuales: [{
          nombre: { type: String, trim: true, maxlength: 100 },
          participacion: { type: String, trim: true, maxlength: 50 },
          tendencia: { type: String, enum: ['creciente', 'estable', 'decreciente'], trim: true }
        }],
        efectividad: {
          mejorROI: { type: String, trim: true, maxlength: 100 },
          menorCAC: { type: String, trim: true, maxlength: 100 },
          mayorConversion: { type: String, trim: true, maxlength: 100 }
        },
        canalesDigitales: [{
          plataforma: { type: String, trim: true, maxlength: 100 },
          relevancia: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          costoIngreso: { type: String, trim: true, maxlength: 200 }
        }],
        canalesTradicionales: [{
          tipo: { type: String, trim: true, maxlength: 100 },
          accesibilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          requisitos: { type: String, trim: true, maxlength: 500 }
        }],
        recomendacion: {
          mixOptimo: [{ type: String, trim: true, maxlength: 100 }],
          priorizacion: {
            fase1: [{ type: String, trim: true, maxlength: 100 }],
            fase2: [{ type: String, trim: true, maxlength: 100 }],
            fase3: [{ type: String, trim: true, maxlength: 100 }]
          },
          metricas: [{ type: String, trim: true, maxlength: 100 }]
        },
        // Campos de metadatos
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
       regulacionBarreras: {
      type: new mongoose.Schema({
        marcoRegulatorio: {
          licencias: [{ type: String, trim: true, maxlength: 200 }],
          normativas: [{ type: String, trim: true, maxlength: 200 }],
          organismos: [{ type: String, trim: true, maxlength: 200 }]
        },
        barrerasEntrada: {
          legales: [{
            barrera: { type: String, trim: true, maxlength: 500 },
            impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            dificultad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
          }],
          economicas: [{ type: String, trim: true, maxlength: 200 }],
          tecnologicas: [{ type: String, trim: true, maxlength: 200 }],
          mercado: [{ type: String, trim: true, maxlength: 200 }]
        },
        riesgosLegales: [{
          riesgo: { type: String, trim: true, maxlength: 500 },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
          mitigacion: { type: String, trim: true, maxlength: 500 }
        }],
        requisitosEntrada: {
          capitalMinimo: { type: String, trim: true, maxlength: 100 },
          certificaciones: [{ type: String, trim: true, maxlength: 200 }],
          tiempoTramitacion: { type: String, trim: true, maxlength: 100 }
        },
        estrategiasMitigacion: {
          planCumplimiento: { type: String, trim: true, maxlength: 1000 },
          estrategiaEntrada: { type: String, trim: true, maxlength: 1000 },
          contingencias: [{ type: String, trim: true, maxlength: 500 }]
        },
        // Campos de metadatos
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
     analisisPESTLE: {
      type: new mongoose.Schema({
        politicos: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        economicos: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        sociales: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        tecnologicos: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        legales: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        ecologicos: [{
          factor: { type: String, trim: true, maxlength: 500 },
          impacto: { type: String, enum: ['positivo', 'negativo', 'neutro'], trim: true },
          intensidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        }],
        resumen: {
          oportunidadesPrincipales: [{ type: String, trim: true, maxlength: 300 }],
          amenazasPrincipales: [{ type: String, trim: true, maxlength: 300 }],
          recomendaciones: [{ type: String, trim: true, maxlength: 500 }]
        },
        // Campos de metadatos
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
        porterSWOT: {
      type: new mongoose.Schema({
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        porter5Fuerzas: {
          poderProveedores: {
            nivel: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            factores: [{ type: String, maxlength: 500, trim: true }],
            impacto: { type: String, maxlength: 1000, trim: true }
          },
          poderClientes: {
            nivel: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            factores: [{ type: String, maxlength: 500, trim: true }],
            impacto: { type: String, maxlength: 1000, trim: true }
          },
          amenazaNuevosEntrantes: {
            nivel: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            factores: [{ type: String, maxlength: 500, trim: true }],
            impacto: { type: String, maxlength: 1000, trim: true }
          },
          amenazaSustitutos: {
            nivel: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            factores: [{ type: String, maxlength: 500, trim: true }],
            impacto: { type: String, maxlength: 1000, trim: true }
          },
          rivalidadCompetidores: {
            nivel: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            factores: [{ type: String, maxlength: 500, trim: true }],
            impacto: { type: String, maxlength: 1000, trim: true }
          }
        },
        swot: {
          fortalezas: [{
            fortaleza: { type: String, maxlength: 500, trim: true },
            impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            aprovechamiento: { type: String, maxlength: 500, trim: true }
          }],
          debilidades: [{
            debilidad: { type: String, maxlength: 500, trim: true },
            impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            mitigacion: { type: String, maxlength: 500, trim: true }
          }],
          oportunidades: [{
            oportunidad: { type: String, maxlength: 500, trim: true },
            potencial: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            estrategia: { type: String, maxlength: 500, trim: true }
          }],
          amenazas: [{
            amenaza: { type: String, maxlength: 500, trim: true },
            probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
            contingencia: { type: String, maxlength: 500, trim: true }
          }]
        },
        estrategiasIntegradas: {
          fortalezasOportunidades: [{ type: String, maxlength: 500, trim: true }],
          debilidadesOportunidades: [{ type: String, maxlength: 500, trim: true }],
          fortalezasAmenazas: [{ type: String, maxlength: 500, trim: true }],
          debilidadesAmenazas: [{ type: String, maxlength: 500, trim: true }]
        },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
    proyeccionDemanda: {
      type: new mongoose.Schema({
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        analisisHistorico: {
          tendenciaGeneral: { type: String, enum: ['creciente', 'estable', 'decreciente'], trim: true },
          tasaCrecimientoAnual: { type: String, maxlength: 50, trim: true },
          patronesEstacionales: [{ type: String, maxlength: 200, trim: true }],
          factoresCrecimiento: [{ type: String, maxlength: 200, trim: true }]
        },
        proyeccion: {
          año1: {
            conservador: { type: String, maxlength: 100, trim: true },
            base: { type: String, maxlength: 100, trim: true },
            optimista: { type: String, maxlength: 100, trim: true }
          },
          año2: {
            conservador: { type: String, maxlength: 100, trim: true },
            base: { type: String, maxlength: 100, trim: true },
            optimista: { type: String, maxlength: 100, trim: true }
          },
          año3: {
            conservador: { type: String, maxlength: 100, trim: true },
            base: { type: String, maxlength: 100, trim: true },
            optimista: { type: String, maxlength: 100, trim: true }
          },
          año4: {
            conservador: { type: String, maxlength: 100, trim: true },
            base: { type: String, maxlength: 100, trim: true },
            optimista: { type: String, maxlength: 100, trim: true }
          },
          año5: {
            conservador: { type: String, maxlength: 100, trim: true },
            base: { type: String, maxlength: 100, trim: true },
            optimista: { type: String, maxlength: 100, trim: true }
          }
        },
        factoresDemanda: {
          driversCrecimiento: [{ type: String, maxlength: 300, trim: true }],
          limitantes: [{ type: String, maxlength: 300, trim: true }],
          variablesExternas: [{ type: String, maxlength: 300, trim: true }]
        },
        segmentacion: {
          porCliente: [{
            segmento: { type: String, maxlength: 200, trim: true },
            participacion: { type: String, maxlength: 50, trim: true },
            crecimientoEsperado: { type: String, maxlength: 50, trim: true }
          }],
          porRegion: [{
            region: { type: String, maxlength: 200, trim: true },
            participacion: { type: String, maxlength: 50, trim: true },
            potencial: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true }
          }],
          porCanal: [{
            canal: { type: String, maxlength: 200, trim: true },
            participacion: { type: String, maxlength: 50, trim: true },
            tendencia: { type: String, enum: ['creciente', 'estable', 'decreciente'], trim: true }
          }]
        },
        metodologia: {
          modelosUtilizados: [{ type: String, maxlength: 200, trim: true }],
          supuestosClave: [{ type: String, maxlength: 300, trim: true }],
          nivelConfianza: { type: String, maxlength: 50, trim: true },
          limitaciones: [{ type: String, maxlength: 300, trim: true }]
        },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    },
    conclusionesRecomendaciones: {
      type: new mongoose.Schema({
        id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        viabilidad: {
          decision: { type: String, enum: ['go', 'no-go', 'condicional'], trim: true },
          puntuacion: { type: String, maxlength: 10, trim: true },
          justificacion: { type: String, maxlength: 1000, trim: true },
          factoresCriticos: [{ type: String, maxlength: 300, trim: true }],
          riesgosPrincipales: [{
            riesgo: { type: String, maxlength: 300, trim: true },
            impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
            probabilidad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
            mitigacion: { type: String, maxlength: 500, trim: true }
          }]
        },
        segmentosPrioritarios: [{
          segmento: { type: String, maxlength: 200, trim: true },
          prioridad: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          potencial: { type: String, maxlength: 500, trim: true },
          estrategiaEntrada: { type: String, maxlength: 500, trim: true },
          recursosNecesarios: [{ type: String, maxlength: 200, trim: true }]
        }],
        estrategiaPricing: {
          precioRecomendado: { type: String, maxlength: 100, trim: true },
          modeloPricing: { type: String, maxlength: 300, trim: true },
          estrategiaPenetracion: { type: String, maxlength: 500, trim: true },
          elasticidadEsperada: { type: String, enum: ['alta', 'media', 'baja'], trim: true },
          competitividadPrecio: { type: String, enum: ['alta', 'media', 'baja'], trim: true }
        },
        planAccion: {
          fase1: {
            duracion: { type: String, maxlength: 100, trim: true },
            objetivos: [{ type: String, maxlength: 300, trim: true }],
            actividades: [{ type: String, maxlength: 300, trim: true }],
            recursos: [{ type: String, maxlength: 200, trim: true }]
          },
          fase2: {
            duracion: { type: String, maxlength: 100, trim: true },
            objetivos: [{ type: String, maxlength: 300, trim: true }],
            actividades: [{ type: String, maxlength: 300, trim: true }],
            recursos: [{ type: String, maxlength: 200, trim: true }]
          },
          fase3: {
            duracion: { type: String, maxlength: 100, trim: true },
            objetivos: [{ type: String, maxlength: 300, trim: true }],
            actividades: [{ type: String, maxlength: 300, trim: true }],
            recursos: [{ type: String, maxlength: 200, trim: true }]
          }
        },
        metricas: {
          kpisPrincipales: [{
            kpi: { type: String, maxlength: 200, trim: true },
            descripcion: { type: String, maxlength: 300, trim: true },
            frecuencia: { type: String, enum: ['diaria', 'semanal', 'mensual'], trim: true },
            umbralAlerta: { type: String, maxlength: 100, trim: true },
            responsable: { type: String, maxlength: 200, trim: true }
          }],
          dashboard: {
            herramientaRecomendada: { type: String, maxlength: 200, trim: true },
            frecuenciaReporte: { type: String, maxlength: 100, trim: true },
            audiencia: [{ type: String, maxlength: 200, trim: true }]
          }
        },
        recomendacionesFinales: {
          accionesInmediatas: [{ type: String, maxlength: 300, trim: true }],
          inversionRequerida: { type: String, maxlength: 200, trim: true },
          tiempoROI: { type: String, maxlength: 100, trim: true },
          factoresExito: [{ type: String, maxlength: 300, trim: true }],
          siguientesPasos: [{ type: String, maxlength: 300, trim: true }]
        },
        createdAt: { type: Date, default: Date.now },
        generatedByAI: { type: Boolean, default: true }
      }, { _id: false }),
      default: null
    }
  },
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