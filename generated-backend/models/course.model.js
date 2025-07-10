const mongoose = require('mongoose');

/**
 * Esquema del Modelo de Curso (Course)
 * Define la estructura de los documentos de cursos en la colección de MongoDB.
 */
const courseSchema = new mongoose.Schema({
  // Título del curso. Es obligatorio, único y se limpia de espacios al inicio/final.
  title: {
    type: String,
    required: [true, 'El título del curso es obligatorio.'],
    unique: true,
    trim: true
  },
  // Nombre del instructor.
  instructor: {
    type: String,
    required: [true, 'El nombre del instructor es obligatorio.'],
    trim: true
  },
  // Nivel de dificultad del curso. Solo puede ser uno de los valores definidos.
  level: {
    type: String,
    required: [true, 'El nivel del curso es obligatorio.'],
    enum: {
      values: ['Principiante', 'Intermedio', 'Avanzado'],
      message: 'El nivel debe ser Principiante, Intermedio o Avanzado.'
    }
  },
  // Duración estimada del curso (ej: "8 horas").
  duration: {
    type: String,
    required: [true, 'La duración es obligatoria.']
  },
  // Calificación promedio del curso, de 0 a 5.
  rating: {
    type: Number,
    default: 0,
    min: [0, 'La calificación no puede ser menor que 0.'],
    max: [5, 'La calificación no puede ser mayor que 5.']
  },
  // Número de estudiantes inscritos.
  students: {
    type: Number,
    default: 0,
    min: [0, 'El número de estudiantes no puede ser negativo.']
  },
  // URL de la imagen de miniatura del curso.
  thumbnail: {
    type: String,
    required: [true, 'La URL de la miniatura es obligatoria.']
  },
  // Resumen o descripción corta del curso.
  summary: {
    type: String,
    trim: true
  },
  // Número de módulos o lecciones que componen el curso.
  modules: {
    type: Number,
    min: [0, 'El número de módulos no puede ser negativo.']
  }
}, {
  // Agrega automáticamente los campos createdAt y updatedAt.
  timestamps: true
});

// Crea y exporta el modelo 'Course' basado en el esquema definido.
const Course = mongoose.model('Course', courseSchema);

module.exports = Course;
