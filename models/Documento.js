const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: [true, 'El tipo de documento es requerido'],
    enum: ['documento', 'csv'],
    trim: true
  },
  contenido: {
    type: String,
    required: [true, 'El contenido del documento es requerido']
  },
  nombre: {
    type: String,
    required: [true, 'El nombre del documento es requerido'],
    trim: true,
    maxlength: [255, 'El nombre no puede exceder 255 caracteres']
  },
  tamaño: {
    type: Number,
    min: [0, 'El tamaño no puede ser negativo']
  },
  mimeType: {
    type: String,
    trim: true
  },
  // Relación con Project
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'El ID del proyecto es requerido']
  },
  // Campos adicionales útiles
  descripcion: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  estado: {
    type: String,
    enum: ['activo', 'archivado', 'eliminado'],
    default: 'activo'
  },
  version: {
    type: Number,
    default: 1,
    min: [1, 'La versión debe ser al menos 1']
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Índices para mejor rendimiento
documentoSchema.index({ projectId: 1, createdAt: -1 });
documentoSchema.index({ tipo: 1 });
documentoSchema.index({ estado: 1 });
documentoSchema.index({ nombre: 'text', descripcion: 'text' });

// Virtual para obtener el tamaño formateado
documentoSchema.virtual('tamañoFormateado').get(function() {
  if (!this.tamaño) return 'N/A';
  
  const bytes = this.tamaño;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  if (bytes === 0) return '0 Bytes';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
});

// Método para verificar si es un CSV
documentoSchema.methods.esCsv = function() {
  return this.tipo === 'csv';
};

// Método para verificar si es un documento
documentoSchema.methods.esDocumento = function() {
  return this.tipo === 'documento';
};

// Middleware pre-save para validaciones adicionales
documentoSchema.pre('save', function(next) {
  // Validar que el contenido no esté vacío
  if (!this.contenido || this.contenido.trim().length === 0) {
    return next(new Error('El contenido del documento no puede estar vacío'));
  }
  
  // Establecer el tamaño basado en el contenido si no se proporciona
  if (!this.tamaño && this.contenido) {
    this.tamaño = Buffer.byteLength(this.contenido, 'utf8');
  }
  
  next();
});

module.exports = mongoose.model('Documento', documentoSchema);