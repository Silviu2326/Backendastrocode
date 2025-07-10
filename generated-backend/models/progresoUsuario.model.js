const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-esquema para la actividad diaria/semanal
const ActividadDiariaSchema = new Schema({
  dia: {
    type: String,
    required: true,
    enum: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] // Valida los días de la semana
  },
  horas: {
    type: Number,
    required: true,
    min: [0, 'Las horas no pueden ser negativas']
  }
}, { _id: false });

// Sub-esquema para los logros obtenidos por el usuario
const LogroObtenidoSchema = new Schema({
  logro: {
    type: Schema.Types.ObjectId,
    ref: 'Logro', // Referencia al modelo de Logro
    required: true
  },
  fechaObtencion: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { _id: false });

// Esquema principal para el Progreso del Usuario
const ProgresoUsuarioSchema = new Schema({
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario', // Asumiendo que existe un modelo 'Usuario'
    required: true,
    unique: true // Cada usuario solo debe tener un documento de progreso
  },
  resumen: {
    horasEstudio: {
      type: Number,
      default: 0,
      min: 0
    },
    minutosEstudiados: { // Más granular que horasEstudio
        type: Number,
        default: 0,
        min: 0
    },
    rachaActual: {
      type: Number,
      default: 0,
      min: 0
    },
    leccionesCompletadas: {
      type: Number,
      default: 0,
      min: 0
    },
    puntosTotales: {
      type: Number,
      default: 0,
      min: 0
    },
    nivelActual: {
      type: Number,
      default: 1,
      min: 1
    }
  },
  actividadSemanal: [ActividadDiariaSchema],
  logros: [LogroObtenidoSchema]
}, {
  // Agrega automáticamente los campos createdAt y updatedAt
  timestamps: true
});

module.exports = mongoose.model('ProgresoUsuario', ProgresoUsuarioSchema);