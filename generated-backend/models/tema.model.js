const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Esquema para un subdocumento que representa un bloque de contenido adicional.
 * No se crea como un modelo separado, sino que se integra directamente en el esquema principal 'Tema'.
 * Esto se debe a que un 'bloque' solo existe en el contexto de un 'tema'.
 */
const bloqueAdicionalSchema = new Schema({
  titulo: {
    type: String,
    required: [true, 'El título del bloque es obligatorio.'],
    trim: true,
  },
  lecciones: {
    type: [String], // Array de strings
    required: true,
    default: [], // Por defecto, es un array vacío si no se proveen lecciones.
  },
}, {
  // Evita que Mongoose cree un _id para cada subdocumento de bloque.
  _id: false 
});

/**
 * Esquema principal para la entidad 'Tema'.
 * Este modelo representa la estructura completa de un temario para un tema específico,
 * incluyendo sus prerrequisitos, sugerencias y contenido adicional estructurado.
 */
const temaSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del tema es obligatorio.'],
      unique: true, // Asegura que no haya temas con el mismo nombre.
      trim: true,
      lowercase: true, // Almacena el nombre en minúsculas para facilitar búsquedas consistentes.
    },
    prerrequisitos: {
      type: [String],
      required: true,
      default: [],
    },
    sugerencias: {
      type: [String],
      required: true,
      default: [],
    },
    bloquesAdicionales: {
      type: [bloqueAdicionalSchema], // Se utiliza el esquema de subdocumento definido arriba.
      required: true,
      default: [],
    },
  },
  {
    // Opciones del esquema para seguir las mejores prácticas.
    timestamps: true, // Añade automáticamente los campos createdAt y updatedAt.
    versionKey: false, // Desactiva el campo de versión (__v) que Mongoose añade por defecto.
  }
);

// Se crea el modelo 'Tema' a partir del esquema 'temaSchema'.
// Este modelo será utilizado por los controladores para interactuar con la colección 'temas' en MongoDB.
const Tema = mongoose.model('Tema', temaSchema);

module.exports = Tema;
