const mongoose = require('mongoose');

/**
 * Esquema de Envío/Intento (SubmissionSchema)
 * Almacena el registro de cada intento que un usuario realiza en un ejercicio.
 * Asumimos la existencia de un modelo 'User' para vincular el intento al usuario.
 */
const submissionSchema = new mongoose.Schema({
  // Referencia al usuario que realizó el envío.
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Asume un modelo de usuario llamado 'User'
    required: true,
    index: true
  },
  // Referencia al ejercicio que se intentó resolver.
  ejercicio: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ejercicio',
    required: true,
    index: true
  },
  // Referencia a la lección (denormalizado para facilitar consultas y reportes).
  leccion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leccion',
    required: true
  },
  // Indica si la solución enviada fue correcta.
  fueCorrecto: {
    type: Boolean,
    required: true
  },
  // El código que el usuario envió (para ejercicios de tipo 'codigo').
  codigoEnviado: {
    type: String
  },
  // Las respuestas del usuario (para ejercicios de tipo 'formulario').
  // Se usa Mixed para dar flexibilidad, almacenando un objeto como { campo: 'respuesta', ... }
  respuestasEnviadas: {
    type: mongoose.Schema.Types.Mixed
  },
  // Fecha explícita de creación. No usamos 'timestamps' para evitar 'updatedAt',
  // ya que un registro de envío no debería modificarse.
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'submissions'
});

const Submission = mongoose.model('Submission', submissionSchema);

module.exports = Submission;
