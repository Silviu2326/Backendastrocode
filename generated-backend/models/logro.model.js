const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Esquema para la entidad Logro/Badge
const LogroSchema = new Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del logro es obligatorio'],
    unique: true,
    trim: true
  },
  descripcion: {
    type: String,
    required: [true, 'La descripción del logro es obligatoria'],
    trim: true
  },
  icono: {
    type: String, // Podría ser una URL a una imagen o un emoji
    required: true
  },
  // Criterios para desbloquear el logro
  criterio: {
    tipo: {
        type: String,
        required: true,
        enum: ['CURSOS_COMPLETADOS', 'RACHA_DIAS', 'LECCIONES_COMPLETADAS']
    },
    valor: {
        type: Number,
        required: true
    }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Logro', LogroSchema);