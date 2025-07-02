const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Descripción: Este esquema define la estructura para los documentos de 'Testimonio'.
// Contiene la información y opinión de un usuario sobre la plataforma.

const testimonioSchema = new Schema({
  // Nombre de la persona que da el testimonio. Es un campo de texto obligatorio.
  name: {
    type: String,
    required: [true, 'El nombre de la persona es obligatorio.'],
    trim: true
  },
  // Rol o cargo de la persona. Es un campo de texto obligatorio.
  role: {
    type: String,
    required: [true, 'El rol o cargo de la persona es obligatorio.'],
    trim: true
  },
  // URL de la foto de perfil o avatar. Se valida que sea una URL válida.
  avatar: {
    type: String,
    required: [true, 'La URL del avatar es obligatoria.'],
    match: [/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i, 'Por favor, introduce una URL válida para el avatar.']
  },
  // El texto del testimonio. Es obligatorio y tiene una longitud máxima.
  quote: {
    type: String,
    required: [true, 'El testimonio o cita es obligatorio.'],
    maxlength: [500, 'El testimonio no puede exceder los 500 caracteres.']
  },
  // Calificación en estrellas asociada al testimonio. Debe ser un número entre 1 y 5.
  rating: {
    type: Number,
    required: [true, 'La calificación es obligatoria.'],
    min: [1, 'La calificación mínima es 1.'],
    max: [5, 'La calificación máxima es 5.']
  }
}, {
  // Opciones del esquema: Habilita timestamps automáticos (createdAt, updatedAt).
  timestamps: true 
});

// Se crea el modelo 'Testimonio' a partir del esquema para interactuar con la colección 'testimonios'.
const Testimonio = mongoose.model('Testimonio', testimonioSchema);

module.exports = Testimonio;
