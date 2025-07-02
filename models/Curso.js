const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- ESQUEMA DE SUBDOCUMENTO: Leccion ---
// Este esquema define la estructura de las analíticas para una lección individual.
// Se utilizará como un subdocumento dentro del modelo principal de Curso.

const LeccionSchema = new Schema({
  titulo: {
    type: String,
    required: [true, 'El título de la lección es obligatorio.'],
    trim: true
  },
  tiempoPromedio: {
    type: Number,
    required: true,
    min: [0, 'El tiempo promedio no puede ser negativo.'],
    default: 0 // Tiempo en minutos
  },
  abandonos: {
    type: Number,
    required: true,
    min: [0, 'El número de abandonos no puede ser negativo.'],
    default: 0
  },
  respuestasCorrectas: {
    type: Number,
    required: true,
    min: [0, 'El número de respuestas correctas no puede ser negativo.'],
    default: 0
  },
  totalRespuestas: {
    type: Number,
    required: true,
    min: [0, 'El número total de respuestas no puede ser negativo.'],
    default: 0
  }
}, {
  // Evita que Mongoose cree un _id para cada subdocumento de lección, 
  // si se prefiere un id numérico simple como en el mock. 
  // Sin embargo, se deja el _id por defecto por ser una mejor práctica en MongoDB.
  // _id: false 
});


// --- ESQUEMA PRINCIPAL: Curso ---
// Este esquema representa un curso y contiene un array de subdocumentos de lecciones.

const CursoSchema = new Schema({
  titulo: {
    type: String,
    required: [true, 'El título del curso es obligatorio.'],
    trim: true,
    unique: true // Asumiendo que no pueden existir dos cursos con el mismo título
  },
  autor: {
    type: String, // En una aplicación real, esto sería: type: Schema.Types.ObjectId, ref: 'Usuario'
    required: [true, 'El autor del curso es obligatorio.']
  },
  fechaCreacion: {
    type: Date,
    default: Date.now
  },
  estudiantes: {
    type: Number,
    required: true,
    min: [0, 'El número de estudiantes no puede ser negativo.'],
    default: 0
  },
  // Array de subdocumentos basados en LeccionSchema
  lecciones: [LeccionSchema]
}, {
  // Opciones del esquema:
  // timestamps: true agrega automáticamente los campos createdAt y updatedAt.
  timestamps: true,
  // versionKey: false elimina el campo __v del documento.
  versionKey: false
});

// Se crea el modelo 'Curso' a partir del esquema definido.
// Mongoose se encargará de la comunicación con la colección 'cursos' en MongoDB.
const Curso = mongoose.model('Curso', CursoSchema);

module.exports = Curso;