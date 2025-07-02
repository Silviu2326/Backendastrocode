const mongoose = require('mongoose');
const { Schema } = mongoose;

// -------------------- ESQUEMA PARA DISPONIBILIDAD --------------------
// Define la disponibilidad horaria de un usuario para un día de la semana.
const DisponibilidadSchema = new Schema({
  dia: {
    type: String,
    required: true,
    enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
    lowercase: true
  },
  horas: {
    type: Number,
    required: true,
    min: 0,
    max: 24,
    default: 0
  }
}, { _id: false }); // No se necesita un ID único para cada entrada de disponibilidad

// -------------------- ESQUEMA PRINCIPAL PARA USUARIO --------------------
// Modela un usuario del sistema, incluyendo su plan de estudio activo y su disponibilidad semanal.
const UsuarioSchema = new Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del usuario es obligatorio.'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio.'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Por favor, introduce un email válido.']
  },
  // Se guarda una referencia al PlanEstudio que el usuario está cursando actualmente.
  // Esto es más eficiente que anidar el plan completo en cada usuario.
  planEstudioActivo: {
    type: Schema.Types.ObjectId,
    ref: 'PlanEstudio', // Referencia al modelo 'PlanEstudio'
    default: null
  },
  // Array de sub-documentos para almacenar la disponibilidad del usuario.
  disponibilidad: {
    type: [DisponibilidadSchema],
    default: []
  }
}, {
  timestamps: true // Agrega createdAt y updatedAt
});

// -------------------- EXPORTACIÓN DEL MODELO --------------------
module.exports = mongoose.model('Usuario', UsuarioSchema);
