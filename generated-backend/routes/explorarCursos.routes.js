const { Router } = require('express');
const { param, validationResult } = require('express-validator');

// --- Importación de Controladores ---
// Se asume que la lógica de negocio (consultar la base de datos o los datos mock) 
// está en un archivo de controladores separado para seguir el patrón MVC.
const {
  obtenerTodosLosCursosPublicos,
  obtenerCursoPublicoPorId,
} = require('../controllers/explorarCursos.controller'); // La ruta al controlador es un ejemplo

// --- Middlewares de Utilidad ---

/**
 * Middleware para procesar los errores de validación de express-validator.
 * Si encuentra errores, responde con un código 400 y los detalles.
 * Si no, pasa al siguiente middleware.
 */
const manejarErroresDeValidacion = (req, res, next) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ errors: errores.array() });
  }
  next();
};

/**
 * Wrapper para manejar errores en funciones de controlador asíncronas.
 * Captura cualquier error en la promesa y lo pasa al manejador de errores de Express (next).
 * Esto evita la necesidad de usar bloques try-catch en cada controlador.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// --- Definición de Rutas ---

const router = Router();

/**
 * @route   GET /explorar-cursos/
 * @desc    Obtiene una lista de todos los cursos públicos disponibles.
 * @access  Público
 * @response 200 - OK, con un arreglo de cursos.
 * @response 500 - Error interno del servidor.
 */
router.get(
  '/',
  asyncHandler(obtenerTodosLosCursosPublicos)
);

/**
 * @route   GET /explorar-cursos/:cursoId
 * @desc    Obtiene los detalles de un curso público específico por su ID.
 * @access  Público
 * @param   {String} cursoId - El ID del curso a buscar (ej: 'curso-publico-1').
 * @response 200 - OK, con el objeto del curso encontrado.
 * @response 400 - Bad Request, si el 'cursoId' proporcionado no es válido.
 * @response 404 - Not Found, si no se encuentra un curso con ese ID.
 * @response 500 - Error interno del servidor.
 */
router.get(
  '/:cursoId',
  // Cadena de middlewares para esta ruta:
  [
    // 1. Validar que el parámetro 'cursoId' exista y sea un string no vacío.
    param('cursoId', 'El ID del curso es inválido o no fue proporcionado.')
      .isString()
      .notEmpty()
      .trim(), // Limpia espacios en blanco
  ],
  // 2. Procesar los resultados de la validación.
  manejarErroresDeValidacion,
  // 3. Ejecutar el controlador de forma segura.
  asyncHandler(obtenerCursoPublicoPorId)
);

module.exports = router;
