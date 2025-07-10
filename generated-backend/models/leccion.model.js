const mongoose = require('mongoose');

/**
 * Esquema de Lección (LeccionSchema)
 * Define la estructura de una lección que agrupa un conjunto de ejercicios.
 */
const leccionSchema = new mongoose.Schema({
  // Nombre de la lección, ej: "JavaScript Básico". Debe ser único.
  nombre: {
    type: String,
    required: [true, 'El nombre de la lección es obligatorio.'],
    unique: true,
    trim: true
  },
  // Descripción breve de lo que cubre la lección.
  descripcion: {
    type: String,
    required: [true, 'La descripción de la lección es obligatoria.']
  },
  // Número para ordenar las lecciones en la interfaz de usuario.
  orden: {
    type: Number,
    required: [true, 'El número de orden es obligatorio.'],
    unique: true
  },
  // Campo para indicar si la lección está disponible para los usuarios.
  publicado: {
    type: Boolean,
    default: false
  }
}, {
  // Agrega automáticamente los campos createdAt y updatedAt.
  timestamps: true,
  // Configura el nombre de la colección en la base de datos a 'lecciones'.
  collection: 'lecciones'
});

const Leccion = mongoose.model('Leccion', leccionSchema);

module.exports = Leccion;
