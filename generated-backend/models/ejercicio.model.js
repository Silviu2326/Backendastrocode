const mongoose = require('mongoose');

/**
 * Sub-esquema para los campos de un ejercicio de tipo 'formulario'.
 * No se crea como un modelo separado, sino que se anida dentro del Ejercicio.
 * La opción {_id: false} evita que Mongoose cree un ObjectId para cada campo.
 */
const campoFormularioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  etiqueta: { type: String, required: true },
  tipo: { type: String, required: true, enum: ['select', 'text', 'radio'] },
  opciones: {
    type: [String],
    // Las opciones son requeridas solo si el campo es de tipo 'select' o 'radio'.
    required: function() { return this.tipo === 'select' || this.tipo === 'radio'; }
  },
  respuestaCorrecta: { type: String, required: true }
}, { _id: false });

/**
 * Esquema de Ejercicio (EjercicioSchema)
 * Define la estructura de un ejercicio del laboratorio. Es polimórfico, 
 * cambiando sus campos requeridos según el valor del campo 'tipo'.
 */
const ejercicioSchema = new mongoose.Schema({
  // Referencia a la Lección a la que pertenece este ejercicio.
  leccion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Leccion',
    required: [true, 'El ejercicio debe estar asociado a una lección.'],
    index: true // Se crea un índice para optimizar las búsquedas por lección.
  },
  titulo: { type: String, required: [true, 'El título es obligatorio.'], trim: true },
  descripcion: { type: String, required: [true, 'La descripción es obligatoria.'] },
  // Discriminador: determina si es un ejercicio de código o de formulario.
  tipo: { type: String, required: true, enum: ['codigo', 'formulario'] },
  explicacion: { type: String, required: [true, 'La explicación de la solución es obligatoria.'] },

  // --- Campos específicos para el tipo 'codigo' ---
  plantilla: { type: String, default: '' },
  solucionEsperada: {
    type: String,
    // Este campo es obligatorio solo si el tipo de ejercicio es 'codigo'.
    required: function() { return this.tipo === 'codigo'; }
  },
  testUnitarios: {
    type: [String],
    // Este campo es obligatorio solo si el tipo de ejercicio es 'codigo'.
    required: function() { return this.tipo === 'codigo'; }
  },

  // --- Campos específicos para el tipo 'formulario' ---
  campos: {
    type: [campoFormularioSchema],
    // Este campo es obligatorio solo si el tipo de ejercicio es 'formulario'.
    required: function() { return this.tipo === 'formulario'; }
  }
}, {
  timestamps: true,
  collection: 'ejercicios'
});

const Ejercicio = mongoose.model('Ejercicio', ejercicioSchema);

module.exports = Ejercicio;
