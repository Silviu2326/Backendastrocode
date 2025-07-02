const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * @desc Sub-esquema para el nivel de conocimiento del usuario en diferentes áreas.
 * @note Se usa _id: false para evitar que Mongoose cree un ObjectId para este subdocumento.
 */
const NivelConocimientoSchema = new Schema({
  programacion: {
    type: String,
    enum: ['principiante', 'intermedio', 'avanzado'],
    default: 'principiante'
  },
  diseño: {
    type: String,
    enum: ['principiante', 'intermedio', 'avanzado'],
    default: 'principiante'
  },
  datascience: {
    type: String,
    enum: ['principiante', 'intermedio', 'avanzado'],
    default: 'principiante'
  }
}, { _id: false });

/**
 * @desc Sub-esquema para las preferencias de aprendizaje del usuario.
 */
const PreferenciasAprendizajeSchema = new Schema({
  tiempoDiario: {
    type: Number,
    min: [0, 'El tiempo diario no puede ser negativo'],
    default: 60
  },
  diasSemana: [{
    type: String,
    enum: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
  }],
  formatoPreferido: {
    type: String,
    enum: ['video', 'texto', 'interactivo', 'audio'],
    default: 'video'
  },
  ritmoAprendizaje: {
    type: String,
    enum: ['lento', 'moderado', 'rápido'],
    default: 'moderado'
  },
  recordatorios: {
    type: Boolean,
    default: true
  },
  idiomaContenido: {
    type: String,
    default: 'español',
    trim: true
  }
}, { _id: false });

/**
 * @desc Sub-esquema para las preferencias de contenido multimedia.
 */
const PreferenciasMultimediaSchema = new Schema({
    audio: { type: Boolean, default: true },
    comics: { type: Boolean, default: false },
    animaciones: { type: Boolean, default: true },
    ejemplosPracticos: { type: Boolean, default: true } // Asumido de 'ejemplosPr'
}, { _id: false });


/**
 * @desc Sub-esquema para la configuración del avatar del usuario.
 */
const AvatarSchema = new Schema({
  tipo: {
    type: String,
    enum: ['predefinido', 'personalizado'],
    default: 'predefinido'
  },
  url: {
    type: String,
    trim: true
  },
  seleccionado: { // ID del avatar predefinido seleccionado
    type: Number,
    default: 1
  }
}, { _id: false });

/**
 * @desc Sub-esquema para la configuración de personalización de la experiencia.
 */
const ConfiguracionPersonalizacionSchema = new Schema({
  avatar: {
    type: AvatarSchema,
    default: () => ({})
  },
  objetivoAprendizaje: {
    type: String,
    trim: true,
    maxlength: [200, 'El objetivo de aprendizaje no puede exceder los 200 caracteres']
  },
  estiloAprendizaje: {
    type: String,
    enum: ['serio', 'divertido', 'referencias'],
    default: 'divertido'
  },
  tonoContenido: { // Alias de estiloAprendizaje para compatibilidad
    type: String,
    enum: ['serio', 'divertido', 'referencias'],
    default: 'divertido'
  },
  nivelActual: {
    type: String,
    enum: ['básico', 'intermedio', 'avanzado'],
    default: 'básico'
  },
  preferenciasMultimedia: {
    type: PreferenciasMultimediaSchema,
    default: () => ({})
  }
}, { _id: false });

/**
 * @desc Esquema principal del Usuario para la base de datos MongoDB.
 * Contiene toda la información del perfil, preferencias y configuración.
 */
const UserSchema = new Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio.'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
    maxlength: [50, 'El nombre no puede exceder los 50 caracteres.']
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio.'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Por favor, introduce un email válido.']
  },
  password: { // Campo esencial para la autenticación, aunque no esté en el API de perfil
    type: String,
    required: [true, 'La contraseña es obligatoria.'],
    select: false // No se devuelve en las consultas por defecto para mayor seguridad
  },
  fotoPerfil: {
    type: String,
    trim: true,
    default: 'https://images.pexels.com/photos/1071162/pexels-photo-1071162.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2' // URL de un avatar por defecto
  },
  biografia: {
    type: String,
    trim: true,
    maxlength: [500, 'La biografía no puede exceder los 500 caracteres.']
  },
  intereses: {
    type: [String],
    default: []
  },
  nivelConocimiento: {
    type: NivelConocimientoSchema,
    default: () => ({}) // Asegura que el objeto se cree por defecto
  },
  preferenciasAprendizaje: {
    type: PreferenciasAprendizajeSchema,
    default: () => ({})
  },
  configuracionPersonalizacion: {
    type: ConfiguracionPersonalizacionSchema,
    default: () => ({})
  }
}, {
  // Opciones del esquema para seguir buenas prácticas
  timestamps: true, // Agrega automáticamente los campos createdAt y updatedAt
  versionKey: false // Desactiva el campo __v de Mongoose
});

// Creación del modelo 'User' a partir del esquema UserSchema
const User = mongoose.model('User', UserSchema);

module.exports = User;
