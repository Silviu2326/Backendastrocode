const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------- ESQUEMA PARA ACTIVIDAD --------------------
// Define la estructura más pequeña del plan: una actividad de aprendizaje.
// Se define como un esquema separado para mayor claridad y reutilización.
const ActividadSchema = new Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre de la actividad es obligatorio.'],
    trim: true
  },
  tipo: {
    type: String,
    required: [true, 'El tipo de actividad es obligatorio.'],
    enum: ['lectura', 'practica', 'proyecto', 'video', 'evaluacion'], // Validación para tipos de actividad permitidos
    default: 'lectura'
  },
  duracion: {
    type: Number, // Duración en minutos
    required: [true, 'La duración es obligatoria.'],
    min: [1, 'La duración debe ser de al menos 1 minuto.']
  },
  completado: {
    type: Boolean,
    default: false
  }
});

// -------------------- ESQUEMA PARA SEMANA --------------------
// Define la estructura de una semana, que agrupa varias actividades.
const SemanaSchema = new Schema({
  numero: {
    type: Number,
    required: [true, 'El número de la semana es obligatorio.'],
    min: [1, 'El número de la semana no puede ser menor a 1.']
  },
  titulo: {
    type: String,
    required: [true, 'El título de la semana es obligatorio.'],
    trim: true
  },
  actividades: {
    type: [ActividadSchema], // Array de sub-documentos de Actividad
    validate: [val => val.length > 0, 'La semana debe tener al menos una actividad.']
  }
});

// -------------------- ESQUEMA PRINCIPAL PARA PLAN DE ESTUDIO --------------------
// Define la estructura completa del plan de estudio.
const PlanEstudioSchema = new Schema({
  titulo: {
    type: String,
    required: [true, 'El título del plan de estudio es obligatorio.'],
    trim: true,
    unique: true // Asegura que no haya planes con el mismo título
  },
  duracion: {
    type: String, // ej: "8 semanas", "3 meses"
    required: [true, 'La duración del plan es obligatoria.']
  },
  semanas: {
    type: [SemanaSchema], // Array de sub-documentos de Semana
    validate: [val => val.length > 0, 'El plan de estudio debe tener al menos una semana.']
  }
}, {
  timestamps: true, // Agrega automáticamente los campos createdAt y updatedAt
  toJSON: { virtuals: true }, // Asegura que los campos virtuales se incluyan en las respuestas JSON
  toObject: { virtuals: true }
});

// -------------------- VIRTUALS --------------------
// Campo virtual para calcular el progreso total del plan dinámicamente.
// Esto evita almacenar datos redundantes y asegura que el progreso siempre esté actualizado.
PlanEstudioSchema.virtual('progreso').get(function() {
  let totalActividades = 0;
  let actividadesCompletadas = 0;

  this.semanas.forEach(semana => {
    totalActividades += semana.actividades.length;
    semana.actividades.forEach(actividad => {
      if (actividad.completado) {
        actividadesCompletadas++;
      }
    });
  });

  if (totalActividades === 0) {
    return 0;
  }

  return Math.round((actividadesCompletadas / totalActividades) * 100);
});

// -------------------- EXPORTACIÓN DEL MODELO --------------------
// Se compila el esquema en un modelo y se exporta.
module.exports = mongoose.model('PlanEstudio', PlanEstudioSchema);
