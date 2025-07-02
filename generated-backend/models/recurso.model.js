const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema de Recurso
 * Define la estructura para los recursos descargables o enlazables de un curso (PDF, ZIP, etc.).
 */
const recursoSchema = new Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre del recurso es obligatorio.'],
    trim: true,
  },
  tipo: {
    type: String,
    required: [true, 'El tipo de archivo (ej. PDF, ZIP) es obligatorio.'],
    uppercase: true,
    trim: true,
  },
  url: {
    type: String,
    required: [true, 'La URL del recurso es obligatoria.'],
    // Validación de formato de URL usando una expresión regular
    match: [/^(https|http):\/\/[^\s$.?#].[^\s]*$/, 'Por favor, introduce una URL válida.']
  },
  // Referencia obligatoria al curso padre
  curso: {
    type: Schema.Types.ObjectId,
    ref: 'Curso',
    required: true,
  }
}, {
  timestamps: true,
});

const Recurso = mongoose.model('Recurso', recursoSchema);

module.exports = Recurso;
