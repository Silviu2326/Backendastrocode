const mongoose = require('mongoose');
const { Schema } = mongoose;

// --- Sub-esquemas para organizar la configuración --- 

/**
 * @description Esquema para las configuraciones de accesibilidad del usuario.
 * Se define como un esquema separado para mayor claridad y reutilización.
 */
const AccesibilidadSchema = new Schema({
  modoOscuro: {
    type: Boolean,
    default: false
  },
  altoContraste: {
    type: Boolean,
    default: false
  },
  tamañoFuente: {
    type: String,
    enum: {
      values: ['pequeño', 'normal', 'grande'],
      message: 'El tamaño de fuente "{VALUE}" no es válido.'
    },
    default: 'normal'
  },
  reducirAnimaciones: {
    type: Boolean,
    default: false
  },
  lecturaAutomatica: {
    type: Boolean,
    default: true
  }
}, { _id: false }); // _id: false para evitar que Mongoose cree un ObjectId para este sub-documento.

/**
 * @description Esquema para las preferencias de notificación del usuario.
 */
const NotificacionesSchema = new Schema({
  email: {
    type: Boolean,
    default: true
  },
  push: {
    type: Boolean,
    default: true
  },
  frecuencia: {
    type: String,
    enum: {
      values: ['nunca', 'diario', 'semanal'],
      message: 'La frecuencia de notificación "{VALUE}" no es válida.'
    },
    default: 'diario'
  }
}, { _id: false });


// --- Esquema Principal de Configuración ---

/**
 * @description Modelo de datos para la configuración de un usuario en la plataforma.
 * Este esquema define la estructura, validaciones y valores por defecto para las preferencias del usuario.
 */
const ConfiguracionSchema = new Schema({
  // Relación con el usuario. Cada configuración pertenece a un único usuario.
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Asume que existe un modelo llamado 'User'
    required: [true, 'El ID del usuario es obligatorio.'],
    unique: true // Asegura que cada usuario solo tenga un documento de configuración.
  },
  idioma: {
    type: String,
    enum: {
        values: ['es', 'en', 'pt', 'fr'],
        message: 'El idioma "{VALUE}" no es soportado.'
    },
    default: 'es'
  },
  profundidad: {
    type: String,
    enum: {
        values: ['basica', 'media', 'avanzada', 'experta'],
        message: 'El nivel de profundidad "{VALUE}" no es válido.'
    },
    default: 'media'
  },
  ttsVelocidad: {
    type: Number,
    min: [0.5, 'La velocidad de TTS no puede ser menor a 0.5.'],
    max: [2.0, 'La velocidad de TTS no puede ser mayor a 2.0.'],
    default: 1.0
  },
  formatosExportacion: {
    type: [String],
    default: ['pdf', 'notion']
  },
  // Integración de los sub-esquemas
  accesibilidad: {
    type: AccesibilidadSchema,
    default: () => ({}) // Usa una función para obtener el objeto con los defaults del sub-esquema.
  },
  conectores: {
    type: [String],
    default: ['notion', 'calendar']
  },
  notificaciones: {
    type: NotificacionesSchema,
    default: () => ({}) 
  }
}, {
  // Opciones del esquema
  timestamps: true, // Agrega automáticamente los campos createdAt y updatedAt
  versionKey: false // Deshabilita el campo de versión __v
});

// Creación del índice para asegurar la unicidad de la configuración por usuario
ConfiguracionSchema.index({ usuarioId: 1 }, { unique: true });

/**
 * Los modelos de Mongoose son la principal herramienta para interactuar con la base de datos.
 * Este modelo 'Configuracion' permitirá realizar operaciones CRUD (Crear, Leer, Actualizar, Eliminar)
 * sobre los documentos de configuración en la colección 'configuraciones' de MongoDB.
 * El uso de async/await se aplicará en los controladores o servicios que utilicen este modelo,
 * por ejemplo: `async function getConfig(userId) { return await Configuracion.findOne({ userId }); }`
 */
const Configuracion = mongoose.model('Configuracion', ConfiguracionSchema);

module.exports = Configuracion;
