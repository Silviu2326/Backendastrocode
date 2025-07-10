const { Router } = require('express');
const { check, validationResult } = require('express-validator');

// Importamos los controladores (simulados para este ejemplo)
// En una aplicación real, estos archivos contendrían la lógica de negocio.
const {
  getCursos,
  getCursoById,
  createCurso,
  updateCurso,
  deleteCurso,
  getHistorial
} = require('../controllers/marketplace.controller');

const router = Router();

// Middleware para manejar los errores de validación de express-validator
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// --- Definición de Rutas para Cursos ---

/**
 * @route   GET /api/marketplace/cursos
 * @desc    Obtener todos los cursos con opción de filtrado y paginación
 * @access  Public
 * @query   categoria, nivel, esGratis, esPremium, sortBy, order, page, limit
 */
router.get('/cursos', getCursos);

/**
 * @route   GET /api/marketplace/cursos/:id
 * @desc    Obtener un curso por su ID
 * @access  Public
 */
router.get('/cursos/:id', getCursoById);

/**
 * @route   POST /api/marketplace/cursos
 * @desc    Crear un nuevo curso
 * @access  Private (requeriría autenticación en un caso real)
 */
router.post('/cursos', 
  [
    // --- Middleware de Validación ---
    check('titulo', 'El título es obligatorio').not().isEmpty(),
    check('autor', 'El autor es obligatorio').not().isEmpty(),
    check('categoria', 'La categoría es obligatoria').not().isEmpty(),
    check('descripcion', 'La descripción es obligatoria').not().isEmpty(),
    check('precio', 'El precio debe ser un valor numérico').isNumeric(),
    check('esPremium', 'esPremium debe ser un valor booleano').isBoolean(),
    check('esGratis', 'esGratis debe ser un valor booleano').isBoolean(),
    check('nivel', 'El nivel es obligatorio (Principiante, Intermedio, Avanzado)').isIn(['Principiante', 'Intermedio', 'Avanzado'])
  ],
  handleValidationErrors, // Manejador de errores de validación
  createCurso
);

/**
 * @route   PUT /api/marketplace/cursos/:id
 * @desc    Actualizar un curso existente
 * @access  Private (requeriría autenticación)
 */
router.put('/cursos/:id', 
  [
    // --- Middleware de Validación (similar a POST) ---
    check('titulo', 'El título es obligatorio').not().isEmpty(),
    check('autor', 'El autor es obligatorio').not().isEmpty(),
    check('categoria', 'La categoría es obligatoria').not().isEmpty(),
    check('descripcion', 'La descripción es obligatoria').not().isEmpty(),
    check('precio', 'El precio debe ser un valor numérico').isNumeric(),
    check('esPremium', 'esPremium debe ser un valor booleano').isBoolean(),
    check('esGratis', 'esGratis debe ser un valor booleano').isBoolean(),
    check('nivel', 'El nivel es obligatorio').isIn(['Principiante', 'Intermedio', 'Avanzado'])
  ],
  handleValidationErrors, // Reutilizamos el manejador
  updateCurso
);

/**
 * @route   DELETE /api/marketplace/cursos/:id
 * @desc    Eliminar un curso por su ID
 * @access  Private (requeriría autenticación y autorización)
 */
router.delete('/cursos/:id', deleteCurso);


// --- Definición de Rutas para Historial ---

/**
 * @route   GET /api/marketplace/historial
 * @desc    Obtener el historial de acciones
 * @access  Private (solo para administradores)
 */
router.get('/historial', getHistorial);


// --- Middleware de Manejo de Errores Global para estas rutas ---
// Este middleware se colocaría al final de la carga de rutas en el archivo principal (app.js o server.js)
// Se añade aquí como referencia conceptual.
/*
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send({
      status: 'error',
      message: 'Ha ocurrido un error inesperado en el servidor.'
    });
  });
*/

module.exports = router;
