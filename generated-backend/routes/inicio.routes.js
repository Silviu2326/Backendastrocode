const { Router } = require('express');
const { check, validationResult } = require('express-validator');

// Se asume la existencia de controladores que contienen la lógica de negocio.
const {
  getFeaturedCourses,
  getUserStats,
  createDemoCourse
} = require('../controllers/inicio.controller');

// Middleware de utilidad para manejar los errores de validación de express-validator.
// Centraliza la lógica de validación para mantener las rutas limpias.
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Si hay errores de validación, responde con un código 400 (Bad Request).
    return res.status(400).json({
      ok: false,
      errors: errors.mapped(),
    });
  }
  next();
};

// Middleware de autenticación (simulado).
// En una aplicación real, este middleware verificaría un token (ej. JWT)
// y adjuntaría la información del usuario al objeto `req`.
const authMiddleware = (req, res, next) => {
  console.log('Middleware de autenticación ejecutado (simulación)');
  // Aquí iría la lógica para validar el token y obtener el ID del usuario.
  // Por ejemplo: req.userId = decodedToken.id;
  next();
};

const router = Router();

// --- Definición de Rutas para la sección 'Inicio' ---

/**
 * @route   GET /api/inicio/cursos-destacados
 * @desc    Obtiene la lista de cursos destacados para la página principal.
 * @access  Public
 * @async   Maneja una operación asíncrona en el controlador.
 */
router.get('/cursos-destacados', getFeaturedCourses);

/**
 * @route   GET /api/inicio/estadisticas-usuario
 * @desc    Obtiene las estadísticas del usuario actualmente autenticado.
 * @access  Private (requiere autenticación)
 * @async   Maneja una operación asíncrona en el controlador.
 */
router.get('/estadisticas-usuario', authMiddleware, getUserStats);

/**
 * @route   POST /api/inicio/generar-curso-demo
 * @desc    Crea un curso demo a partir de un tema (topic).
 * @access  Public (o Private, según se requiera)
 * @body    { "topic": "string" }
 * @async   Maneja una operación asíncrona en el controlador.
 */
router.post(
  '/generar-curso-demo',
  [
    // Middleware de validación para el cuerpo de la solicitud (body).
    check('topic', 'El campo \"topic\" es requerido y debe ser un texto.')
      .not().isEmpty()
      .trim()
      .isString(),
  ],
  handleValidationErrors, // Middleware que procesa el resultado de las validaciones.
  createDemoCourse        // Controlador que se ejecuta solo si la validación es exitosa.
);

module.exports = router;
