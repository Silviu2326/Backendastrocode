const express = require('express');
const { body, param, validationResult } = require('express-validator');

// En una aplicación real, los controladores y validadores estarían en archivos separados
// (ej: 'controllers/profileController.js' y 'middlewares/profileValidator.js')
// Para este ejemplo, se incluyen aquí para mayor claridad y contexto.

// --- SIMULACIÓN DE CONTROLADORES ---
// Estos controladores usarían las funciones de la API que proporcionaste.

const { 
  fetchUserProfile, 
  updateUserProfile, 
  updateUserInterests, 
  updateLearningPreferences, 
  getConfiguracionPersonalizacion 
} = require('../api/PerfilPreferencias'); // La ruta al API es una suposición

// Se asume que existe una función para actualizar la personalización
const updateConfiguracionPersonalizacion = async (data) => Promise.resolve({
  success: true,
  message: 'Configuración de personalización actualizada.',
  updatedPersonalization: data
});

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const profileController = {
  getUserProfile: async (req, res, next) => {
    try {
      const userProfile = await fetchUserProfile(req.params.userId);
      if (!userProfile) {
        return res.status(404).json({ success: false, message: 'Perfil de usuario no encontrado.' });
      }
      res.status(200).json({ success: true, data: userProfile });
    } catch (error) {
      next(error); // Pasa al manejador de errores central
    }
  },

  putUserProfile: async (req, res, next) => {
    try {
      const result = await updateUserProfile(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  patchUserInterests: async (req, res, next) => {
    try {
      const result = await updateUserInterests(req.body.intereses);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  patchLearningPreferences: async (req, res, next) => {
    try {
      const result = await updateLearningPreferences(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },

  getPersonalizationConfig: async (req, res, next) => {
    try {
      const config = await getConfiguracionPersonalizacion(req.params.userId);
      res.status(200).json({ success: true, data: config });
    } catch (error) {
      // La API simulada puede fallar, este catch lo maneja.
      console.error('Error al obtener la configuración de personalización:', error.message);
      res.status(500).json({ success: false, message: 'Error interno al cargar la configuración.' });
    }
  },
  
  putPersonalizationConfig: async (req, res, next) => {
    try {
      const result = await updateConfiguracionPersonalizacion(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
};

// --- MIDDLEWARE DE VALIDACIÓN ---
const validate = {
  userId: [
    param('userId').notEmpty().withMessage('El ID de usuario es requerido.'),
  ],

  profile: [
    body('nombre').notEmpty().isString().withMessage('El nombre es requerido y debe ser texto.'),
    body('email').isEmail().withMessage('Debe proporcionar un email válido.'),
    body('fotoPerfil').optional({ checkFalsy: true }).isURL().withMessage('La URL de la foto de perfil no es válida.'),
    body('biografia').optional().isString().withMessage('La biografía debe ser texto.'),
    body('intereses').isArray().withMessage('Los intereses deben ser un arreglo.'),
    body('intereses.*').isString().withMessage('Cada interés debe ser texto.'),
    body('nivelConocimiento').isObject().withMessage('El nivel de conocimiento debe ser un objeto.'),
    body('preferenciasAprendizaje').isObject().withMessage('Las preferencias de aprendizaje deben ser un objeto.'),
  ],

  interests: [
    body('intereses').isArray({ min: 1 }).withMessage('Debe proporcionar un arreglo de intereses.'),
    body('intereses.*').notEmpty().isString().withMessage('Cada interés debe ser texto no vacío.'),
  ],

  learningPreferences: [
    body('tiempoDiario').isNumeric().withMessage('El tiempo diario debe ser un número.'),
    body('diasSemana').isArray().withMessage('Los días de la semana deben ser un arreglo.'),
    body('diasSemana.*').isIn(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']).withMessage('Día de la semana no válido.'),
    body('formatoPreferido').isString().notEmpty().withMessage('El formato preferido es requerido.'),
    body('ritmoAprendizaje').isIn(['lento', 'moderado', 'rápido']).withMessage('Ritmo de aprendizaje no válido.'),
    body('recordatorios').isBoolean().withMessage('Recordatorios debe ser un valor booleano.'),
  ],

  personalization: [
      body('avatar').isObject().withMessage('El avatar debe ser un objeto.'),
      body('avatar.tipo').isIn(['predefinido', 'personalizado']).withMessage('Tipo de avatar no válido.'),
      body('avatar.url').isURL().withMessage('La URL del avatar no es válida.'),
      body('objetivoAprendizaje').notEmpty().isString().withMessage('El objetivo de aprendizaje es requerido.'),
      body('estiloAprendizaje').isIn(['serio', 'divertido', 'referencias']).withMessage('Estilo de aprendizaje no válido.'),
      body('nivelActual').isIn(['básico', 'intermedio', 'avanzado']).withMessage('Nivel actual no válido.'),
      // Nota: El archivo original tenía 'ejemplosPr', se asume 'ejemplosPracticos'.
      body('preferenciasMultimedia.ejemplosPracticos').isBoolean(),
  ]
};

// --- DEFINICIÓN DE RUTAS CON EXPRESS ROUTER ---
const router = express.Router();

// Ruta base: /api/profiles

/**
 * @route   GET /api/profiles/:userId
 * @desc    Obtener el perfil completo de un usuario
 * @access  Private (se asume autenticación previa)
 */
router.get(
  '/:userId',
  validate.userId,
  handleValidationErrors,
  profileController.getUserProfile
);

/**
 * @route   PUT /api/profiles/:userId
 * @desc    Actualizar el perfil completo de un usuario
 * @access  Private
 */
router.put(
  '/:userId',
  validate.userId,
  validate.profile,
  handleValidationErrors,
  profileController.putUserProfile
);

/**
 * @route   PATCH /api/profiles/:userId/interests
 * @desc    Actualizar solo los intereses del usuario
 * @access  Private
 */
router.patch(
  '/:userId/interests',
  validate.userId,
  validate.interests,
  handleValidationErrors,
  profileController.patchUserInterests
);

/**
 * @route   PATCH /api/profiles/:userId/preferences/learning
 * @desc    Actualizar solo las preferencias de aprendizaje
 * @access  Private
 */
router.patch(
  '/:userId/preferences/learning',
  validate.userId,
  validate.learningPreferences,
  handleValidationErrors,
  profileController.patchLearningPreferences
);

// --- Rutas para Configuración de Personalización ---

/**
 * @route   GET /api/profiles/:userId/personalization
 * @desc    Obtener la configuración de personalización del usuario
 * @access  Private
 */
router.get(
  '/:userId/personalization',
  validate.userId,
  handleValidationErrors,
  profileController.getPersonalizationConfig
);

/**
 * @route   PUT /api/profiles/:userId/personalization
 * @desc    Actualizar la configuración de personalización del usuario
 * @access  Private
 */
router.put(
  '/:userId/personalization',
  validate.userId,
  validate.personalization,
  handleValidationErrors,
  profileController.putPersonalizationConfig
);

module.exports = router;