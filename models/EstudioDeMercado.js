const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const estudioDeMercadoSchema = new mongoose.Schema({
  // ID único del estudio de mercado
  id: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  
  // Referencia al proyecto
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'El ID del proyecto es requerido']
  },
  
  // Resumen Ejecutivo
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
  
  // Definición de Mercado
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
  
  // Segmentación
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
  
  // Tamaño de Mercado
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
  
  // Tendencias
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
  
  // Competencia
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
  
  // Pricing
  pricing: {
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
  },
  
  // Canales de Distribución
  canalesDistribucion: {
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
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    createdAt: { type: Date, default: Date.now },
    generatedByAI: { type: Boolean, default: true }
  },
  
  // Regulación y Barreras
  regulacionBarreras: {
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
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    createdAt: { type: Date, default: Date.now },
    generatedByAI: { type: Boolean, default: true }
  },
  
  // Análisis PESTLE
  analisisPESTLE: {
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
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    createdAt: { type: Date, default: Date.now },
    generatedByAI: { type: Boolean, default: true }
  },
  
  // Porter y SWOT
  porterSWOT: {
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
  },
  
  // Proyección de Demanda
  proyeccionDemanda: {
    id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    metodologia: {
      enfoque: { type: String, enum: ['topDown', 'bottomUp', 'hibrido'], trim: true },
      fuentes: [{ type: String, trim: true, maxlength: 200 }],
      supuestos: [{ type: String, trim: true, maxlength: 500 }]
    },
    proyecciones: [{
      año: { type: Number, min: 2020, max: 2050 },
      demandaTotal: { type: String, trim: true, maxlength: 100 },
      crecimiento: { type: String, trim: true, maxlength: 50 },
      factoresInfluencia: [{ type: String, trim: true, maxlength: 200 }]
    }],
    escenarios: {
      optimista: {
        crecimiento: { type: String, trim: true, maxlength: 50 },
        factores: [{ type: String, trim: true, maxlength: 200 }],
        probabilidad: { type: String, trim: true, maxlength: 50 }
      },
      base: {
        crecimiento: { type: String, trim: true, maxlength: 50 },
        factores: [{ type: String, trim: true, maxlength: 200 }],
        probabilidad: { type: String, trim: true, maxlength: 50 }
      },
      pesimista: {
        crecimiento: { type: String, trim: true, maxlength: 50 },
        factores: [{ type: String, trim: true, maxlength: 200 }],
        probabilidad: { type: String, trim: true, maxlength: 50 }
      }
    },
    sensibilidad: [{
      variable: { type: String, trim: true, maxlength: 100 },
      impacto: { type: String, enum: ['alto', 'medio', 'bajo'], trim: true },
      elasticidad: { type: String, trim: true, maxlength: 100 }
    }],
    recomendaciones: [{ type: String, trim: true, maxlength: 500 }],
    createdAt: { type: Date, default: Date.now },
    generatedByAI: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices para mejorar el rendimiento
estudioDeMercadoSchema.index({ projectId: 1 });
estudioDeMercadoSchema.index({ id: 1 });
estudioDeMercadoSchema.index({ createdAt: -1 });

// Método para obtener un resumen del estudio
estudioDeMercadoSchema.methods.getResumen = function() {
  return {
    id: this.id,
    projectId: this.projectId,
    resumenEjecutivo: this.resumenEjecutivo?.overview || 'No disponible',
    tamanoMercado: this.tamanoMercado?.tam?.value || 'No calculado',
    competidoresPrincipales: this.competencia?.directCompetitors?.length || 0,
    fechaCreacion: this.createdAt
  };
};

module.exports = mongoose.model('EstudioDeMercado', estudioDeMercadoSchema);