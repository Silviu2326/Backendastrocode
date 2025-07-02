const { Router } = require('express');
const { check } = require('express-validator');

// --- Importación de Controladores ---
// Estos controladores contendrían la lógica de negocio y llamarían a las funciones del archivo original.
// (ej: /src/controllers/perfilUsuario.controller.js)
const {
  getAuthenticatedUserProfile,
  getUserProfileById,
} = require('../controllers/perfilUsuario.controller');

// --- Importación de Middlewares ---
// Middleware para verificar la autenticación (ej: /src/middlewares/auth.middleware.js)
const { isAuthenticated } = require('../middlewares/auth.middleware');
// Middleware para manejar los resultados de la validación (ej: /src/middlewares/validation.middleware.js)
const { handleValidationErrors } = require('../middlewares/validation.middleware');

// Inicialización del router de Express
const router = Router();

/**
 * @route   GET /api/perfil/me
 * @desc    Obtener el perfil completo del usuario autenticado.
 * @access  Privado (requiere token de autenticación)
 * @returns {object} 200 - Objeto con los datos del perfil del usuario.
 * @returns {object} 401 - Error de no autorizado si el token no es válido o no se proporciona.
 * @returns {object} 500 - Error interno del servidor.
 */
router.get(
  '/me',
  isAuthenticated, // 1. Middleware: Asegura que el usuario esté autenticado antes de continuar.
  getAuthenticatedUserProfile // 2. Controlador: Procesa la solicitud y devuelve el perfil.
);

/**
 * @route   GET /api/perfil/:userId
 * @desc    Obtener el perfil público de un usuario por su ID.
 * @access  Privado (requiere que el solicitante esté autenticado para ver otros perfiles)
 * @param   {string} userId - El ID del usuario a buscar (ej: un MongoID o UUID).
 * @returns {object} 200 - Objeto con los datos del perfil del usuario solicitado.
 * @returns {object} 400 - Error de validación si el userId no es válido.
 * @returns {object} 401 - Error de no autorizado si el solicitante no está autenticado.
 * @returns {object} 404 - Error si no se encuentra un usuario con ese ID.
 * @returns {object} 500 - Error interno del servidor.
 */
router.get(
  '/:userId',
  [
    // 1. Middleware de Autenticación
    isAuthenticated,
    // 2. Middleware de Validación de Datos de Entrada
    check('userId', 'El ID de usuario proporcionado no es válido.').isMongoId(), // Asumiendo que usamos MongoDB IDs
    // 3. Middleware para manejar errores de validación
    handleValidationErrors,
  ],
  getUserProfileById // 4. Controlador: Busca y devuelve el perfil del usuario por ID.
);

module.exports = router;
