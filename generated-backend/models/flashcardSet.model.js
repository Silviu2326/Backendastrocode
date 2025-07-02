const mongoose = require('mongoose');

/**
 * @schema CardSchema
 * @description Define la estructura de una única flashcard.
 * Este es un sub-documento que será embebido dentro del FlashcardSet.
 * No se creará una colección separada para 'Cards' en MongoDB, lo que mejora el rendimiento para este caso de uso.
 */
const cardSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'La pregunta de la tarjeta es obligatoria.'],
    trim: true, // Elimina espacios en blanco al inicio y al final
  },
  answer: {
    type: String,
    required: [true, 'La respuesta de la tarjeta es obligatoria.'],
    trim: true,
  },
});

/**
 * @schema FlashcardSetSchema
 * @description Define la estructura para un conjunto de flashcards.
 * Cada conjunto contiene metadatos y una lista de tarjetas (cards) embebidas.
 */
const flashcardSetSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'El título del set es obligatorio.'],
      trim: true,
      unique: true, // Asegura que no haya sets con títulos duplicados para mantener la integridad de los datos.
    },
    description: {
      type: String,
      trim: true,
      default: '', // Valor por defecto si no se provee descripción.
    },
    // Embebiendo el esquema de cards. Cada FlashcardSet tendrá su propio array de cards.
    cards: {
      type: [cardSchema],
      // Validación personalizada para asegurar que el set tenga al menos una tarjeta al ser creado.
      validate: {
        validator: function (v) {
          // 'v' es el array de cards.
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Un set debe contener al menos una flashcard.',
      },
    },
    lastStudied: {
      type: Date,
      default: null, // El valor es null por defecto y se puede actualizar cuando el usuario estudie el set.
    },
  },
  {
    // Opciones del esquema:
    timestamps: true, // Agrega automáticamente los campos createdAt y updatedAt para el seguimiento de registros.
    toJSON: { virtuals: true }, // Asegura que los campos virtuales se incluyan en las respuestas JSON.
    toObject: { virtuals: true }, // Asegura que los campos virtuales se incluyan al convertir a objeto JS.
  }
);

/**
 * @virtual totalCards
 * @description Campo virtual que calcula el número total de tarjetas en el set.
 * No se almacena en la base de datos, se calcula dinámicamente al momento de la consulta.
 * Esto evita la redundancia y posibles inconsistencias de datos.
 */
flashcardSetSchema.virtual('totalCards').get(function () {
  return this.cards.length;
});

// Crear el modelo a partir del esquema.
// El primer argumento 'FlashcardSet' es el nombre singular del modelo.
// Mongoose automáticamente buscará la colección en plural ('flashcardsets') en la base de datos.
const FlashcardSet = mongoose.model('FlashcardSet', flashcardSetSchema);

// Exportar el modelo para ser utilizado en otras partes de la aplicación (e.g., controllers).
module.exports = FlashcardSet;
