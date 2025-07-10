const mongoose = require('mongoose');

// Definición del esquema para el Historial de Acciones del Usuario.
// Este modelo sirve para registrar logs de actividad en la plataforma.
const historialAccionSchema = new mongoose.Schema({
  // Referencia al usuario que realizó la acción.
  // Se asume que existe un modelo 'Usuario' en la aplicación.
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario', // Esto crea una relación con el modelo Usuario
    required: [true, 'Se requiere el ID del usuario.'],
    index: true // Se añade un índice para búsquedas eficientes por usuario
  },
  // Tipo de acción realizada, restringida a una lista de valores predefinidos.
  accion: {
    type: String,
    required: [true, 'El tipo de acción es obligatorio.'],
    enum: {
      values: ['VISTA_CURSO', 'COMPRA_CURSO', 'BUSQUEDA', 'FILTRO_CATEGORIA', 'FILTRO_GENERAL'],
      message: 'El tipo de acción {VALUE} no es válido.'
    }
  },
  // Referencia opcional al curso relacionado con la acción.
  // No es requerido para acciones generales como una búsqueda global.
  curso: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Curso' // Relación con el modelo Curso
  },
  // Campo flexible para almacenar detalles adicionales de la acción.
  // Ej: { query: 'React' } para una búsqueda, o { categoria: 'Desarrollo Web' } para un filtro.
  detalles: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  // Opciones del esquema
  // Solo se necesita la fecha de creación para un registro de historial.
  // Se deshabilita 'updatedAt' ya que un log no debe ser modificado.
  timestamps: { createdAt: 'fechaAccion', updatedAt: false }
});

// Creación y exportación del modelo 'HistorialAccion'
const HistorialAccion = mongoose.model('HistorialAccion', historialAccionSchema);

module.exports = HistorialAccion;
