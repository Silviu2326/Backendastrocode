const mongoose = require('mongoose');
const { Schema } = mongoose;

// Esquema para el historial de actividades del usuario
const HistorialSchema = new Schema({
  usuario: {
    type: Schema.Types.ObjectId, // Referencia al usuario que realizó la acción
    ref: 'Usuario',
    required: true,
    index: true // Crear un índice en este campo acelera las consultas por usuario
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  actividad: {
    type: String,
    required: [true, 'La descripción de la actividad es obligatoria.']
  },
  tipo: {
    type: String,
    required: [true, 'El tipo de actividad es obligatorio.'],
    enum: [
      'curso_completado',
      'leccion_completada',
      'practica',
      'suscripcion_iniciada',
      'perfil_actualizado'
    ]
  },
  // Duración de la actividad en minutos para facilitar cálculos
  duracion_min: {
    type: Number,
    default: 0
  },
  puntos: {
    type: Number,
    default: 0
  },
  referencia: {
    // Campo opcional para vincular la actividad a un recurso específico (e.g., ID del curso)
    type: Schema.Types.ObjectId
  }
}, {
  timestamps: { createdAt: 'fecha', updatedAt: false }, // Usar el campo 'fecha' como timestamp de creación
  versionKey: false
});

// Exportar el modelo
module.exports = mongoose.model('Historial', HistorialSchema);
