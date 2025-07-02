const { Router } = require('express');
const { param, body, validationResult } = require('express-validator');

// --- Controladores (Placeholder) ---
// En una aplicación real, estos controladores contendrían la lógica de negocio
// y llamarían a las funciones de servicio (como fetchProgressData).
// Aquí se asume que existen en '../controllers/progreso.controller'.
const { 
  getProgresoData, 
  updateTiempoEstudio, 
  getEstadisticas, 
  getLogros, 
  generarRecomendacion 
} = require('../controllers/progreso.controller');

// --- Middleware de Autenticación (Placeholder) ---
// Middleware para proteger rutas y adjuntar el ID de usuario al objeto `req`.
const isAuthenticated = (req, res, next) => {
  // Lógica de autenticación (ej. verificar JWT)
  // Si es exitosa, se adjunta el usuario: req.user = { id: 'some-user-id' };
  // Por ahora, simulamos un usuario autenticado para la ruta que lo requiere.
  req.user = { id: 123 }; 
  next();
};

// --- Middleware para manejar errores de validación ---
// Centraliza el manejo de errores de express-validator para mantener las rutas limpias.
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Si hay errores de validación, responde con un estado 400 y los errores.
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Inicialización del router de Express
const router = Router();

/**
 * @route   GET /api/progreso/:userId
 * @desc    Obtiene el panel de progreso principal para un usuario específico.
 * @access  Privado (requiere autenticación del usuario solicitado o rol de admin)
 */
router.get(
  '/:userId',
  [
    // 1. Middleware de Validación: asegura que 'userId' sea un entero numérico.
    param('userId', 'El ID de usuario debe ser un número entero válido.').isInt(),
    // 2. Middleware para procesar el resultado de la validación.
    handleValidationErrors
  ],
  // 3. Controlador: se ejecuta si la validación es exitosa.
  // El controlador internamente usará async/await y un bloque try/catch para manejar la lógica y los errores.
  getProgresoData 
);

/**
 * @route   POST /api/progreso/tiempo-estudio
 * @desc    Registra una nueva sesión de estudio para el usuario autenticado.
 * @access  Privado
 */
router.post(
  '/tiempo-estudio',
  [
    // 1. Middleware de Autenticación: Verifica que el usuario esté logueado.
    // El ID del usuario se obtendrá de `req.user.id` en lugar de un parámetro de URL.
    isAuthenticated,
    // 2. Middleware de Validación: asegura que 'minutes' sea un número mayor que cero.
    body('minutes', 'Los minutos deben ser un valor numérico mayor que 0.').isFloat({ gt: 0 }),
    // 3. Middleware para procesar el resultado de la validación.
    handleValidationErrors
  ],
  // 4. Controlador: Llama a la función para actualizar el tiempo de estudio.
  updateTiempoEstudio
);

/**
 * @route   GET /api/progreso/:userId/estadisticas
 * @desc    Obtiene las estadísticas detalladas de progreso de un usuario.
 * @access  Privado
 */
router.get(
  '/:userId/estadisticas',
  [
    param('userId', 'El ID de usuario debe ser un número entero válido.').isInt(),
    handleValidationErrors
  ],
  getEstadisticas
);

/**
 * @route   GET /api/progreso/:userId/logros
 * @desc    Obtiene la lista de badges y logros de un usuario.
 * @access  Privado
 */
router.get(
  '/:userId/logros',
  [
    param('userId', 'El ID de usuario debe ser un número entero válido.').isInt(),
    handleValidationErrors
  ],
  getLogros
);

/**
 * @route   POST /api/progreso/:userId/recomendaciones
 * @desc    Genera y devuelve una nueva recomendación de estudio basada en IA.
 * @access  Privado
 */
router.post(
  '/:userId/recomendaciones',
  [
    param('userId', 'El ID de usuario debe ser un número entero válido.').isInt(),
    handleValidationErrors
  ],
  // El controlador se encargaría de llamar al servicio `generarRecomendacionIA`
  // y de manejar la respuesta o posibles errores.
  generarRecomendacion
);


module.exports = router;
