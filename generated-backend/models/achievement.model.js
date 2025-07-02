const mongoose = require('mongoose');

/**
 * Esquema del Modelo de Logro (Achievement)
 * Define los logros que un usuario puede desbloquear en la plataforma.
 */
const achievementSchema = new mongoose.Schema({
  // Nombre del logro. Debe ser único para evitar duplicados.
  name: {
    type: String,
    required: [true, 'El nombre del logro es obligatorio.'],
    unique: true,
    trim: true
  },
  // Descripción del logro o el requisito para desbloquearlo.
  description: {
    type: String,
    required: [true, 'La descripción del logro es obligatoria.']
  },
  // Icono representativo del logro (puede ser un emoji o una URL a una imagen).
  icon: {
    type: String,
    required: [true, 'El icono es obligatorio.']
  }
}, {
  // Agrega automáticamente los campos createdAt y updatedAt.
  timestamps: true
});

// Crea y exporta el modelo 'Achievement' basado en el esquema definido.
const Achievement = mongoose.model('Achievement', achievementSchema);

module.exports = Achievement;
