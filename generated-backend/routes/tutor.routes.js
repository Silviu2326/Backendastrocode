const { Router } = require('express');
const { body, validationResult } = require('express-validator');

// --- Importaciones de Controladores y Middlewares ---
// Se asume que estos archivos existen en la estructura del proyecto.

// Importar el controlador que manejará la lógica de la pregunta al tutor.
// Este controlador contendrá la función async que procesa la pregunta y devuelve una respuesta.
const { askTutorController } = require('../controllers/tutor.controller');

// Importar middlewares personalizados.
const { verifyToken } = require('../middlewares/auth.middleware'); // Middleware para verificar el token JWT.
const { tutorRateLimiter } = require('../middlewares/rateLimiter.middleware'); // Middleware para limitar la tasa de solicitudes.

// Inicializar el router de Express.
const router = Router();

// --- Definición de Middlewares de Validación ---
// Usamos express-validator para sanear y validar el cuerpo de la petición.
// Esto asegura que los datos que llegan al controlador son seguros y tienen el formato esperado.
const validateQuestionRequest = [
  body('leccionId')
    .trim()
    .notEmpty().withMessage('El ID de la lección (leccionId) no puede estar vacío.')
    .isString().withMessage('El ID de la lección debe ser una cadena de texto.'),

  body('pregunta')
    .trim()
    .notEmpty().withMessage('La pregunta no puede estar vacía.')
    .isLength({ min: 1, max: 500 }).withMessage('La pregunta debe tener entre 1 y 500 caracteres.'),

  // Middleware para manejar los errores de validación.
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Si hay errores de validación, se responde con un código 400 (Bad Request)
      // y un array con los errores encontrados.
      return res.status(400).json({ errors: errors.array() });
    }
    next(); // Si no hay errores, se continúa con el siguiente middleware o el controlador.
  }
];

// --- Definición de Rutas ---

/**
 * @route   POST /api/tutor/preguntar
 * @desc    Recibe una pregunta del usuario para el tutor IA, la procesa y devuelve una respuesta.
 * @access  Private (requiere autenticación por token)
 */
router.post(
  '/preguntar',
  [
    // 1. Middleware de Autenticación: Verifica si el token JWT en la cabecera 'Authorization' es válido.
    // Si no es válido, la petición se rechaza con un 401 Unauthorized y no continúa.
    verifyToken,

    // 2. Middleware de Rate Limiting: Limita el número de peticiones que un usuario puede hacer
    // en un periodo de tiempo para prevenir abusos. Si se excede, devuelve 429 Too Many Requests.
    tutorRateLimiter,

    // 3. Cadena de Middlewares de Validación: Ejecuta las validaciones definidas arriba para
    // el cuerpo de la petición. Si falla, devuelve un 400 Bad Request.
    ...validateQuestionRequest
  ],
  // 4. Controlador: Si todos los middlewares anteriores pasan, la petición finalmente llega
  // al controlador `askTutorController`, que contiene la lógica de negocio principal.
  // Se usa async/await dentro del controlador para manejar operaciones asíncronas.
  askTutorController
);

// Exportar el router para ser utilizado en el archivo principal de la aplicación (ej. app.js o server.js)
module.exports = router;
