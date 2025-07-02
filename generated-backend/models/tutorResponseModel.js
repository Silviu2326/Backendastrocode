const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Esquema de TutorResponse (Respuesta del Tutor)
 * 
 * Este modelo almacena la base de conocimiento del tutor de IA. Contiene las posibles respuestas
 * que el sistema puede ofrecer, categorizadas por un 'leccionId'.
 * Esto reemplaza el objeto `respuestasSimuladas` codificado en el frontend,
 * permitiendo una gestión dinámica del contenido desde el backend/base de datos.
 */
const tutorResponseSchema = new Schema({
  /**
   * Identificador de la lección o tema al que pertenece esta respuesta.
   * Actúa como una clave de categorización para buscar respuestas relevantes.
   * Ejemplo: 'javascript', 'html', 'css'.
   * Es requerido e indexado para búsquedas eficientes.
   */
  leccionId: {
    type: String,
    required: [true, 'El ID de la lección es obligatorio para categorizar la respuesta.'],
    trim: true,
    index: true,
  },

  /**
   * El contenido textual de la respuesta del tutor.
   */
  texto: {
    type: String,
    required: [true, 'El texto de la respuesta no puede estar vacío.'],
    trim: true,
  },

  /**
   * URL opcional del archivo de audio que acompaña a la respuesta textual.
   */
  audio: {
    type: String,
    trim: true,
    default: null,
  },

  /**
   * Palabras clave o 'triggers' que podrían ayudar al motor de IA a seleccionar esta respuesta (opcional).
   * Esto puede mejorar la lógica de coincidencia de preguntas.
   */
  keywords: {
    type: [String],
    default: [],
  },
}, {
  /**
   * Opciones del esquema:
   * - timestamps: true, para saber cuándo se agregó o actualizó una respuesta en la base de conocimiento.
   */
  timestamps: true,
});

const TutorResponse = mongoose.model('TutorResponse', tutorResponseSchema);

module.exports = TutorResponse;
