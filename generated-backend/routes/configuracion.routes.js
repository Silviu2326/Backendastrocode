const { Router } = require('express');
const { body, validationResult } = require('express-validator');

// Se asume que los controladores están en un archivo separado
// y manejan la lógica de negocio, incluyendo la interacción con la base de datos o localStorage.
const {
  obtenerConfiguracionGlobal,
  actualizarConfiguracionGlobal
} = require('../controllers/configuracion.controller');

// Middleware de autenticación (simulado). En una app real, este verificaría
// el token del usuario y adjuntaría su información al objeto 'req'.
const { validarJWT } = require('../middlewares/validar-jwt');

const router = Router();

// Middleware para manejar los errores de validación de express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: true,
      mensaje: 'Errores de validación en los datos de entrada.',
      codigo: 'VALIDATION_ERROR',
      errores: errors.array(),
    });
  }
  next();
};

// --- Definición de Rutas para Configuración ---

/**
 * @route   GET /api/configuracion
 * @desc    Obtener la configuración global del usuario autenticado (US 29).
 * @access  Privado
 * @comment Esta ruta se basa en la función 'getConfiguracionGlobal'.
 *          Se espera que el middleware 'validarJWT' se ejecute primero para asegurar
 *          que la solicitud provenga de un usuario autenticado.
 *          El controlador 'obtenerConfiguracionGlobal' será una función async/await
 *          que devolverá la configuración con un estado HTTP 200 o un error 500.
 */
router.get('/', [validarJWT], obtenerConfiguracionGlobal);

/**
 * @route   PATCH /api/configuracion
 * @desc    Actualizar parcialmente la configuración global del usuario (US 29).
 * @access  Privado
 * @comment Esta ruta se basa en la función 'guardarConfiguracionGlobal'.
 *          - Se utiliza PATCH porque es una actualización parcial.
 *          - Incluye un array de middlewares de validación con express-validator,
 *            basados en las reglas del archivo original.
 *          - El controlador 'actualizarConfiguracionGlobal' será una función async/await
 *            que aplicará los cambios y responderá con la nueva configuración (HTTP 200)
 *            o un error (HTTP 400, 401, 500).
 */
router.patch(
  '/',
  [
    validarJWT, // 1. Primero, asegurar que el usuario esté autenticado
    // 2. Validaciones basadas en la lógica del archivo de mock
    body('idioma', 'El idioma no es válido. Valores permitidos: es, en, pt, fr.')
      .optional()
      .isIn(['es', 'en', 'pt', 'fr']),
    body('profundidad', 'La profundidad no es válida. Valores permitidos: basica, media, avanzada, experta.')
      .optional()
      .isIn(['basica', 'media', 'avanzada', 'experta']),
    body('ttsVelocidad', 'La velocidad TTS debe ser un número entre 0.5 y 2.0.')
      .optional()
      .isFloat({ min: 0.5, max: 2.0 }),
    body('accesibilidad', 'El campo de accesibilidad debe ser un objeto.')
      .optional()
      .isObject(),
    body('notificaciones', 'El campo de notificaciones debe ser un objeto.')
      .optional()
      .isObject(),
    body('formatosExportacion', 'El campo formatosExportacion debe ser un array.')
      .optional()
      .isArray(),
    handleValidationErrors, // 3. Procesar los resultados de la validación
  ],
  actualizarConfiguracionGlobal // 4. Si todo es válido, ejecutar el controlador
);

module.exports = router;
