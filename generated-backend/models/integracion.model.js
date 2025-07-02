const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * =================================================================
 * ESQUEMA DE INTEGRACIÓN
 * =================================================================
 * Define la estructura de datos para la conexión de un usuario con un
 * servicio externo (ej. Notion, Google Calendar, Slack).
 * 
 * Este modelo es fundamental para la User Story 31: Gestión de integraciones.
 */

const integracionSchema = new Schema({
  /**
   * Identificador único del tipo de conector (ej. 'notion', 'google_calendar').
   * Este campo es clave para diferenciar entre los tipos de integraciones disponibles.
   */
  conectorId: {
    type: String,
    required: [true, 'El ID del conector es obligatorio.'],
    trim: true,
    lowercase: true
  },

  /**
   * Referencia al documento del usuario al que pertenece esta instancia de integración.
   * Esencial para un entorno multi-usuario.
   */
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Asume que existe un modelo 'User' para la referencia.
    required: [true, 'La referencia al usuario es obligatoria.'],
    index: true // Se crea un índice para optimizar las búsquedas por usuario.
  },

  /**
   * Nombre legible de la integración (ej. 'Notion', 'Google Calendar').
   */
  nombre: {
    type: String,
    required: [true, 'El nombre de la integración es obligatorio.'],
    trim: true,
  },

  /**
   * Descripción funcional de lo que hace la integración.
   */
  descripcion: {
    type: String,
    required: [true, 'La descripción es obligatoria.'],
  },

  /**
   * Icono representativo de la integración (puede ser un emoji o una URL a una imagen).
   */
  icono: {
    type: String,
  },

  /**
   * Estado actual de la conexión de la integración.
   * - 'conectado': La autenticación fue exitosa y está activa.
   * - 'desconectado': El usuario no ha conectado o ha revocado el acceso.
   * - 'error': Hubo un problema con la última sincronización o conexión.
   * - 'pendiente': El proceso de autenticación (ej. OAuth) está en curso.
   */
  estado: {
    type: String,
    required: true,
    enum: {
      values: ['conectado', 'desconectado', 'error', 'pendiente'],
      message: 'El estado "{VALUE}" no es válido. Valores permitidos: conectado, desconectado, error, pendiente.'
    },
    default: 'desconectado',
  },

  /**
   * Categoría a la que pertenece la integración para facilitar su organización en la UI.
   */
  categoria: {
    type: String,
    required: [true, 'La categoría es obligatoria.'],
    trim: true
  },

  /**
   * Objeto flexible para almacenar la configuración específica del usuario para esta integración.
   * Ej: { calendarioId: 'primary', notificaciones: ['logros'] }
   */
  configuracion: {
    type: Schema.Types.Mixed,
    default: null,
  },

  /**
   * Almacena credenciales sensibles como tokens de acceso, tokens de refresco, o claves de API.
   * `select: false` previene que este campo sea devuelto en las consultas por defecto por seguridad.
   */
  credenciales: {
    type: Schema.Types.Mixed,
    select: false,
  },

  /**
   * Fecha y hora de la última sincronización o conexión exitosa.
   */
  ultimaConexion: {
    type: Date,
    default: null,
  },

  /**
   * Lista de permisos (scopes) que el usuario ha otorgado a la aplicación para esta integración.
   */
  permisos: {
    type: [String],
    default: [],
  },

  /**
   * Lista de acciones que esta integración puede realizar (ej. 'exportar_curso').
   */
  acciones: {
    type: [String],
    default: [],
  },

  /**
   * Indica si la autenticación de esta integración requiere un flujo OAuth.
   */
  requiereOAuth: {
    type: Boolean,
    default: false,
  },

  /**
   * URL a la documentación oficial de la API de la integración.
   * Incluye una validación de formato de URL.
   */
  urlDocumentacion: {
    type: String,
    match: [/^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i, 'Por favor, introduce una URL válida.']
  },
}, {
  /**
   * Opciones del esquema:
   * - timestamps: true -> Agrega automáticamente los campos `createdAt` y `updatedAt`.
   * - versionKey: false -> Desactiva el campo `__v` de versionado de Mongoose.
   */
  timestamps: true,
  versionKey: false,
});

/**
 * =================================================================
 * ÍNDICES
 * =================================================================
 * Para optimizar el rendimiento de la base de datos y asegurar la integridad de los datos.
 */

// Se crea un índice compuesto para garantizar que un usuario no pueda tener
// más de una conexión para el mismo tipo de conector (ej. un solo 'notion' por usuario).
// Esto previene duplicados y mejora la eficiencia de las búsquedas.
integracionSchema.index({ usuario: 1, conectorId: 1 }, { unique: true });


/**
 * =================================================================
 * EXPORTACIÓN DEL MODELO
 * =================================================================
 */

const Integracion = mongoose.model('Integracion', integracionSchema);

module.exports = Integracion;
