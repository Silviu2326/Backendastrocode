const { Router } = require('express');
const { param, body, validationResult } = require('express-validator');

// --- Controladores (simulados para el propósito de este archivo de rutas) ---
// En una aplicación real, estos se importarían desde '../controllers/curso.controller.js'
const { 
  getCourseById, 
  getLessonDetails, 
  updateLessonStatus 
} = require('../controllers/curso.controller');

const router = Router();

// --- Middleware de Validación ---
// Middleware para manejar los errores de validación de express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Si hay errores de validación, responde con un código 400 y los errores.
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// --- Definición de Rutas ---

/**
 * @route   GET /api/cursos/:id
 * @desc    Obtener la información detallada de un curso específico.
 * @access  Public
 */
router.get(
  '/:id',
  [
    // Middleware de validación para el parámetro 'id'
    param('id', 'El ID del curso proporcionado no es un ID válido.').isMongoId() // Se asume formato MongoID, puede cambiarse a isInt() si se usan IDs numéricos.
  ],
  handleValidationErrors, // Manejador de errores de validación
  getCourseById // Llama al controlador correspondiente
);

/**
 * @route   GET /api/cursos/:cursoId/lecciones/:leccionId
 * @desc    Obtener el contenido detallado de una lección específica dentro de un curso.
 * @access  Public
 */

/**
 * @route   PATCH /api/cursos/:cursoId/lecciones/:leccionId
 * @desc    Actualizar el estado de una lección (completada o no).
 * @access  Private (requiere autenticación del usuario)
 */
router.route('/:cursoId/lecciones/:leccionId')
  .get(
    [
      // Validaciones para los parámetros de la URL
      param('cursoId', 'El ID del curso no es válido.').isMongoId(),
      param('leccionId', 'El ID de la lección no es válido.').isMongoId()
    ],
    handleValidationErrors,
    getLessonDetails // Controlador para obtener detalles de la lección
  )
  .patch(
    [
      // Validaciones para los parámetros de la URL
      param('cursoId', 'El ID del curso no es válido.').isMongoId(),
      param('leccionId', 'El ID de la lección no es válido.').isMongoId(),
      // Validación para el cuerpo (body) de la solicitud
      body('completado', 'El campo \"completado\" debe ser un valor booleano.').isBoolean()
    ],
    handleValidationErrors,
    updateLessonStatus // Controlador para actualizar el estado de la lección
  );

// Se exporta el router para ser utilizado en el archivo principal del servidor (app.js o server.js)
module.exports = router;
