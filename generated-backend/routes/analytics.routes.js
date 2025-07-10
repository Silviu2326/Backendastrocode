const { Router } = require('express');
const { param, validationResult } = require('express-validator');

// Importación hipotética de los controladores que contendrían la lógica de negocio.
const { 
  getCursosCreados,
  getMetricasCurso
} = require('../controllers/analytics.controller');

const router = Router();

// Middleware para manejar los errores de validación de express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Si hay errores, responde con un estado 400 (Bad Request) y la lista de errores.
    return res.status(400).json({ 
      ok: false,
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route   GET /api/analytics/cursos-creados
 * @desc    Obtener la lista completa de cursos con sus analíticas generales.
 * @access  Public (o Private si se implementa autenticación)
 */
router.get('/cursos-creados', getCursosCreados);

/**
 * @route   GET /api/analytics/cursos-creados/:cursoId
 * @desc    Obtener las métricas detalladas de un curso específico por su ID.
 * @access  Public (o Private si se implementa autenticación)
 * @param   {number} cursoId - El ID numérico del curso a consultar.
 */
router.get('/cursos-creados/:cursoId', 
  // --- Middleware de Validación ---
  [
    // 1. Valida que el 'cursoId' proporcionado en la URL sea un número.
    param('cursoId', 'El ID del curso debe ser un valor numérico.').isNumeric(),
    
    // 2. Middleware que procesa el resultado de las validaciones anteriores.
    handleValidationErrors
  ],
  // --- Controlador ---
  // Si la validación es exitosa, se ejecuta el controlador para obtener los datos.
  getMetricasCurso
);


module.exports = router;
