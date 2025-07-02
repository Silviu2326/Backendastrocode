const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Esquema para la inscripción y progreso en un curso
const InscripcionSchema = new Schema({
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario', // Referencia al modelo de Usuario
    required: true
  },
  curso: {
    type: Schema.Types.ObjectId,
    ref: 'Curso', // Referencia al modelo de Curso
    required: true
  },
  progreso: {
    type: Number,
    required: true,
    min: [0, 'El progreso no puede ser menor que 0'],
    max: [100, 'El progreso no puede ser mayor que 100'],
    default: 0
  },
  siguienteLeccion: {
    type: String,
    trim: true
  },
  estado: {
    type: String,
    required: true,
    enum: ['en-progreso', 'completado', 'no-iniciado'],
    default: 'no-iniciado'
  }
}, {
  // El campo updatedAt puede funcionar como 'ultimaActividad'
  timestamps: true
});

// Se crea un índice compuesto para asegurar que un usuario solo pueda inscribirse una vez por curso
InscripcionSchema.index({ usuario: 1, curso: 1 }, { unique: true });

module.exports = mongoose.model('Inscripcion', InscripcionSchema);