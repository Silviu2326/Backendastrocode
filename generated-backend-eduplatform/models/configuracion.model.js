const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Sub-esquema para las opciones de accesibilidad
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
    enum: ['pequeño', 'normal', 'grande', 'muy-grande'],
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
}, { _id: false });

// Sub-esquema para las opciones de notificaciones
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
    enum: ['inmediato', 'diario', 'semanal', 'nunca'],
    default: 'diario'
  }
}, { _id: false });

// Esquema principal de Configuración
const ConfiguracionSchema = new Schema({
  usuario: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario', // Clave foránea al modelo de Usuario
    required: [true, 'El ID de usuario es obligatorio.'],
    unique: true, // Asegura una relación 1 a 1 entre Usuario y Configuración
    index: true
  },
  idioma: {
    type: String,
    enum: ['es', 'en', 'pt', 'fr'],
    default: 'es',
    required: true
  },
  profundidad: {
    type: String,
    enum: ['basica', 'media', 'avanzada', 'experta'],
    default: 'media',
    required: true
  },
  ttsVelocidad: {
    type: Number,
    min: [0.5, 'La velocidad TTS no puede ser menor a 0.5x'],
    max: [2.0, 'La velocidad TTS no puede ser mayor a 2.0x'],
    default: 1.0
  },
  formatosExportacion: {
    type: [String],
    default: ['pdf', 'notion']
  },
  conectores: {
    type: [String],
    default: ['notion', 'calendar']
  },
  accesibilidad: {
    type: AccesibilidadSchema,
    default: () => ({})
  },
  notificaciones: {
    type: NotificacionesSchema,
    default: () => ({})
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true // Añade createdAt y updatedAt automáticamente
});

// --- ÍNDICES ---
// Índice compuesto para buscar eficientemente configuraciones activas por usuario.
ConfiguracionSchema.index({ usuario: 1, deletedAt: 1 });

// --- MIDDLEWARE (HOOKS) ---

// Hook pre-save para lógica de negocio.
// Si las notificaciones por email se desactivan, la frecuencia se establece a 'nunca'.
ConfiguracionSchema.pre('save', function(next) {
  if (this.isModified('notificaciones.email') && this.notificaciones.email === false) {
    this.notificaciones.frecuencia = 'nunca';
  }
  next();
});

// Hook para implementar Soft-Delete: Excluye documentos 'borrados' de las búsquedas 'find'.
ConfiguracionSchema.pre(/^find/, function(next) {
  // `this` es el objeto Query
  if (this.getFilter().deletedAt === undefined) {
      this.where({ deletedAt: null });
  }
  next();
});


// --- MÉTODOS ESTÁTICOS ---

/**
 * Busca la configuración de un usuario. Si no existe, la crea con valores por defecto.
 * @param {string} usuarioId - El ObjectId del usuario.
 * @returns {Promise<Document>} La configuración del usuario.
 */
ConfiguracionSchema.statics.findOrCreateByUsuario = async function(usuarioId) {
  let configuracion = await this.findOne({ usuario: usuarioId });
  if (!configuracion) {
    configuracion = await this.create({ usuario: usuarioId });
  }
  return configuracion;
};

/**
 * Realiza un borrado lógico de la configuración de un usuario.
 * @param {string} usuarioId - El ObjectId del usuario.
 * @returns {Promise<object>} El resultado de la operación de actualización.
 */
ConfiguracionSchema.statics.softDeleteByUsuario = function(usuarioId) {
  return this.updateOne({ usuario: usuarioId }, { deletedAt: new Date() });
};

// --- MÉTODOS DE INSTANCIA ---

/**
 * Restablece la configuración a sus valores por defecto.
 * @returns {Promise<Document>} La instancia del documento guardado con valores por defecto.
 */
ConfiguracionSchema.methods.resetearADefaults = function() {
  this.idioma = 'es';
  this.profundidad = 'media';
  this.ttsVelocidad = 1.0;
  this.formatosExportacion = ['pdf', 'notion'];
  this.conectores = ['notion', 'calendar'];
  this.accesibilidad = { modoOscuro: false, altoContraste: false, tamañoFuente: 'normal', reducirAnimaciones: false, lecturaAutomatica: true };
  this.notificaciones = { email: true, push: true, frecuencia: 'diario' };
  return this.save();
};


module.exports = mongoose.model('Configuracion', ConfiguracionSchema);