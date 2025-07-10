const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Esquema de Conversation (Conversación)
 * 
 * Este modelo representa una única interacción (pregunta y respuesta) entre un usuario y el tutor de IA.
 * Almacena el historial de conversaciones para seguimiento, análisis y para que los usuarios puedan revisar sus preguntas anteriores.
 */
const conversationSchema = new Schema({
  /**
   * ID del usuario que realiza la pregunta.
   * Es una referencia al modelo 'User' para mantener la integridad de los datos.
   * Es requerido e indexado para optimizar las búsquedas de conversaciones por usuario.
   */
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Asume que tienes un modelo de usuario llamado 'User'
    required: [true, 'El ID del usuario es obligatorio.'],
    index: true,
  },

  /**
   * Identificador de la lección o tema para dar contexto a la pregunta.
   * Ejemplo: 'javascript', 'react', 'css-flexbox'.
   * Es requerido e indexado para poder filtrar conversaciones por tema.
   */
  leccionId: {
    type: String,
    required: [true, 'El ID de la lección es obligatorio.'],
    trim: true,
    index: true,
  },

  /**
   * La pregunta textual enviada por el usuario.
   * Se aplica una validación de longitud máxima para coincidir con la lógica del frontend.
   */
  pregunta: {
    type: String,
    required: [true, 'El texto de la pregunta no puede estar vacío.'],
    trim: true,
    maxlength: [500, 'La pregunta no puede exceder los 500 caracteres.'],
  },

  /**
   * La respuesta textual generada por el tutor de IA.
   */
  respuesta: {
    type: String,
    required: [true, 'El texto de la respuesta es obligatorio.'],
    trim: true,
  },

  /**
   * URL opcional del archivo de audio asociado a la respuesta del tutor.
   */
  audioUrl: {
    type: String,
    trim: true,
    default: null,
  },
}, {
  /**
   * Opciones del esquema:
   * - timestamps: true, agrega automáticamente los campos `createdAt` y `updatedAt`,
   *   lo cual es una mejor práctica para registrar cuándo se crearon y modificaron los documentos.
   */
  timestamps: true,
});

// Prevenir la duplicación de la misma pregunta por el mismo usuario en la misma lección en un corto período de tiempo (opcional).
// Se podría crear un índice compuesto si fuera necesario para lógicas de negocio más complejas.
// conversationSchema.index({ userId: 1, leccionId: 1, pregunta: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
