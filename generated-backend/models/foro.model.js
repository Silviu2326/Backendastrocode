const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Esquema de Foro
 * Define la estructura para una publicación o hilo en el foro de un curso.
 */
const foroSchema = new Schema({
  // NOTA: En una aplicación real, 'autor' debería ser una referencia a un modelo 'Usuario'.
  // Se usa String para reflejar la simplicidad de la API proporcionada.
  autor: {
    type: String,
    required: [true, 'El autor es obligatorio.'],
    trim: true,
  },
  titulo: {
    type: String,
    required: [true, 'El título de la publicación es obligatorio.'],
    trim: true,
  },
  respuestas: {
    type: Number,
    default: 0,
    min: [0, 'El número de respuestas no puede ser negativo.'],
  },
  // Referencia obligatoria al curso padre
  curso: {
    type: Schema.Types.ObjectId,
    ref: 'Curso',
    required: true,
  }
}, {
  // Los timestamps automáticos (createdAt, updatedAt) manejan la 'fecha' de publicación de forma robusta.
  timestamps: true,
});

const Foro = mongoose.model('Foro', foroSchema);

module.exports = Foro;
