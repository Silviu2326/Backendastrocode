const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Descripción: Este esquema define la estructura de los documentos de 'Curso' en la base de datos.
// Se encarga de la validación de datos a nivel de modelo para garantizar la integridad de la información.

const cursoSchema = new Schema({
  // Título del curso. Es un campo de texto obligatorio y con longitud máxima.
  title: {
    type: String,
    required: [true, 'El título del curso es obligatorio.'],
    trim: true,
    maxlength: [150, 'El título no puede exceder los 150 caracteres.']
  },
  // Nombre del instructor. Es un campo de texto obligatorio.
  instructor: {
    type: String,
    required: [true, 'El nombre del instructor es obligatorio.'],
    trim: true
  },
  // Nivel de dificultad del curso. Es un campo enumerado para asegurar que solo se usen valores predefinidos.
  level: {
    type: String,
    required: [true, 'El nivel del curso es obligatorio.'],
    enum: {
      values: ['Principiante', 'Intermedio', 'Avanzado'],
      message: '{VALUE} no es un nivel válido. Los valores permitidos son: Principiante, Intermedio, Avanzado.'
    }
  },
  // Duración del curso, representada como texto (ej: '8 horas').
  duration: {
    type: String,
    required: [true, 'La duración del curso es obligatoria.'],
    trim: true
  },
  // Calificación promedio del curso. Debe estar en un rango de 0 a 5.
  rating: {
    type: Number,
    min: [0, 'La calificación no puede ser menor que 0.'],
    max: [5, 'La calificación no puede ser mayor que 5.'],
    default: 0
  },
  // Número de estudiantes inscritos. Se almacena como número para facilitar cálculos y ordenamiento.
  students: {
    type: Number,
    required: [true, 'El número de estudiantes es obligatorio.'],
    min: [0, 'El número de estudiantes no puede ser negativo.'],
    default: 0
  },
  // URL de la imagen en miniatura. Incluye una validación de formato de URL.
  thumbnail: {
    type: String,
    required: [true, 'La URL de la miniatura es obligatoria.'],
    match: [/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i, 'Por favor, introduce una URL válida para la miniatura.']
  }
}, {
  // Opciones del esquema: Habilita timestamps automáticos (createdAt, updatedAt).
  timestamps: true 
});

// Se crea el modelo 'Curso' a partir del esquema. Mongoose usará este modelo para interactuar 
// con la colección 'cursos' en MongoDB.
const Curso = mongoose.model('Curso', cursoSchema);

module.exports = Curso;
