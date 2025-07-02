const mongoose = require('mongoose');
const slugify = require('slugify'); // Dependencia recomendada: npm i slugify

// ESQUEMA EMBEBIDO PARA LECCIONES
// No es un modelo separado, sino la estructura de los datos dentro de un curso.
const leccionSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título de la lección es obligatorio.'],
    trim: true,
    maxlength: [120, 'El título de la lección no puede exceder los 120 caracteres.']
  },
  tiempoPromedio: {
    type: Number,
    required: [true, 'El tiempo promedio en minutos es obligatorio.'],
    min: [1, 'El tiempo promedio debe ser de al menos 1 minuto.']
  },
  abandonos: {
    type: Number,
    default: 0,
    min: [0, 'El número de abandonos no puede ser negativo.']
  },
  respuestasCorrectas: {
    type: Number,
    default: 0,
    min: [0, 'El número de respuestas correctas no puede ser negativo.']
  },
  totalRespuestas: {
    type: Number,
    default: 0,
    min: [0, 'El número total de respuestas no puede ser negativo.'],
    validate: {
        validator: function(value) {
            // Asegura que el total de respuestas sea mayor o igual a las correctas
            return value >= this.respuestasCorrectas;
        },
        message: 'El total de respuestas no puede ser menor que el número de respuestas correctas.'
    }
  }
});

// ESQUEMA PRINCIPAL DEL CURSO
const cursoSchema = new mongoose.Schema({
  titulo: {
    type: String,
    required: [true, 'El título del curso es obligatorio.'],
    unique: true,
    trim: true,
    maxlength: [150, 'El título del curso no puede exceder los 150 caracteres.']
  },
  slug: {
    type: String,
    unique: true
  },
  autor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Relación con un modelo de Usuario/Instructor
    required: [true, 'El curso debe tener un autor.']
  },
  estudiantes: {
    type: Number,
    default: 0,
    min: [0, 'El número de estudiantes no puede ser negativo.']
  },
  lecciones: {
    type: [leccionSchema],
    validate: [val => val.length > 0, 'Un curso debe tener al menos una lección.']
  },
  deletedAt: { // Campo para Soft Delete
    type: Date,
    default: null
  }
}, {
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
  toJSON: { virtuals: true }, // Asegura que los virtuals se incluyan en la salida JSON
  toObject: { virtuals: true }
});

// --- ÍNDICES ---
// Para optimizar consultas comunes
cursoSchema.index({ titulo: 'text', slug: 1 }); // Búsqueda por texto y slug
cursoSchema.index({ autor: 1 }); // Búsqueda de cursos por autor
cursoSchema.index({ estudiantes: -1 }); // Ordenar por popularidad
cursoSchema.index({ deletedAt: 1 }); // Optimizar consultas que excluyen eliminados


// --- VIRTUALS ---
// Propiedades computadas que no se persisten en la base de datos
cursoSchema.virtual('totalLecciones').get(function() {
  return this.lecciones.length;
});

cursoSchema.virtual('metricasGenerales').get(function() {
    if (this.lecciones.length === 0) {
        return {
            tiempoTotalEstimado: 0,
            abandonosTotales: 0,
            tasaDeExitoPromedio: 0
        };
    }
    const totales = this.lecciones.reduce((acc, leccion) => {
        acc.tiempoTotalEstimado += leccion.tiempoPromedio;
        acc.abandonosTotales += leccion.abandonos;
        acc.totalCorrectas += leccion.respuestasCorrectas;
        acc.totalGlobal += leccion.totalRespuestas;
        return acc;
    }, { tiempoTotalEstimado: 0, abandonosTotales: 0, totalCorrectas: 0, totalGlobal: 0 });

    const tasaDeExito = totales.totalGlobal > 0 
        ? (totales.totalCorrectas / totales.totalGlobal) * 100 
        : 0;

    return {
        tiempoTotalEstimado: totales.tiempoTotalEstimado,
        abandonosTotales: totales.abandonosTotales,
        tasaDeExitoPromedio: parseFloat(tasaDeExito.toFixed(2))
    };
});


// --- MIDDLEWARE (HOOKS) ---
// Lógica que se ejecuta antes o después de ciertas operaciones

// Hook para generar el 'slug' a partir del título antes de guardar
cursoSchema.pre('save', function(next) {
  if (this.isModified('titulo') || this.isNew) {
    this.slug = slugify(this.titulo, { lower: true, strict: true, remove: /[*+~.()_!'#:@]/g });
  }
  next();
});

// Hook para implementar soft delete: Oculta documentos eliminados por defecto
cursoSchema.pre(/^find/, function(next) {
  if (this.getOptions().withDeleted !== true) {
      this.where({ deletedAt: null });
  }
  next();
});


// --- MÉTODOS DE INSTANCIA ---
// Métodos disponibles en cada documento del modelo

// Marca un curso como eliminado (soft delete)
cursoSchema.methods.softDelete = function() {
  this.deletedAt = new Date();
  return this.save();
};

// Restaura un curso eliminado
cursoSchema.methods.restore = function() {
  this.deletedAt = null;
  return this.save();
};

// --- MÉTODOS ESTÁTICOS ---
// Métodos que se ejecutan sobre el modelo completo

// Busca cursos que han sido eliminados (soft deleted)
cursoSchema.statics.findWithDeleted = function() {
  return this.find({ deletedAt: { $ne: null } });
};

// Encuentra los cursos más populares por número de estudiantes
cursoSchema.statics.findCursosPopulares = function(limit = 5) {
  return this.find({}).sort({ estudiantes: -1 }).limit(limit);
};

const Curso = mongoose.model('Curso', cursoSchema);

module.exports = Curso;
