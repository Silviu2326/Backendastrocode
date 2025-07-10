import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

// --- Importación de Controladores (Asumidos) ---
// Estos controladores contendrían la lógica para interactuar con la base de datos o los datos mock.
// import {
//   obtenerCursos,
//   obtenerCursoPorId,
//   crearCurso,
//   actualizarCurso,
//   eliminarCurso
// } from '../controllers/cursos.controller.js';

const router = Router();

// --- Middlewares de Validación Específicos para Cursos ---

// Middleware para validar que el ID en el parámetro sea un entero válido
const validarIdEnParametro = [
  param('id').isInt({ min: 1 }).withMessage('El ID del curso debe ser un número entero positivo.')
];

// Middleware para validar los datos del cuerpo (body) al crear o actualizar un curso
const validarDatosCurso = [
  body('title')
    .trim()
    .notEmpty().withMessage('El título es obligatorio.')
    .isLength({ min: 5 }).withMessage('El título debe tener al menos 5 caracteres.'),
  body('instructor')
    .trim()
    .notEmpty().withMessage('El nombre del instructor es obligatorio.'),
  body('level')
    .isIn(['Principiante', 'Intermedio', 'Avanzado']).withMessage('El nivel debe ser Principiante, Intermedio o Avanzado.'),
  body('duration')
    .notEmpty().withMessage('La duración es obligatoria.'),
  body('rating')
    .optional()
    .isFloat({ min: 0, max: 5 }).withMessage('La calificación debe ser un número entre 0 y 5.'),
  body('thumbnail')
    .optional()
    .isURL().withMessage('El thumbnail debe ser una URL válida.')
];

// --- Middleware para Manejar Errores de Validación ---

// Este middleware centraliza el manejo de errores de express-validator
// Si hay errores, responde con un 400 Bad Request; de lo contrario, pasa al siguiente middleware (el controlador).
const manejarErroresValidacion = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// --- Wrapper para Rutas Asíncronas (Manejo de Errores) ---

// Utilidad para evitar bloques try-catch repetitivos en los controladores asíncronos.
// Captura cualquier error en operaciones asíncronas y lo pasa al middleware de error de Express.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


// --- Definición de Rutas para el Recurso 'Cursos' ---

/**
 * @route   GET /api/cursos
 * @desc    Obtener una lista de todos los cursos populares.
 * @access  Public
 */
router.get('/', asyncHandler(/* obtenerCursos */ (req, res) => {
  res.status(200).json({ message: 'Controlador obtenerCursos ejecutado' });
}));

/**
 * @route   GET /api/cursos/:id
 * @desc    Obtener un curso específico por su ID.
 * @access  Public
 */
router.get('/:id',
  validarIdEnParametro,
  manejarErroresValidacion,
  asyncHandler(/* obtenerCursoPorId */ (req, res) => {
    res.status(200).json({ message: `Controlador obtenerCursoPorId ejecutado para id: ${req.params.id}` });
  })
);

/**
 * @route   POST /api/cursos
 * @desc    Crear un nuevo curso.
 * @access  Private (requeriría autenticación en una app real)
 */
router.post('/',
  validarDatosCurso,
  manejarErroresValidacion,
  asyncHandler(/* crearCurso */ (req, res) => {
    // El controlador crearía el curso y devolvería el nuevo recurso.
    res.status(201).json({ message: 'Controlador crearCurso ejecutado', data: req.body });
  })
);

/**
 * @route   PUT /api/cursos/:id
 * @desc    Actualizar un curso existente por su ID.
 * @access  Private
 */
router.put('/:id',
  [
    ...validarIdEnParametro,
    ...validarDatosCurso
  ],
  manejarErroresValidacion,
  asyncHandler(/* actualizarCurso */ (req, res) => {
    res.status(200).json({ message: `Controlador actualizarCurso ejecutado para id: ${req.params.id}`, data: req.body });
  })
);

/**
 * @route   DELETE /api/cursos/:id
 * @desc    Eliminar un curso por su ID.
 * @access  Private
 */
router.delete('/:id',
  validarIdEnParametro,
  manejarErroresValidacion,
  asyncHandler(/* eliminarCurso */ (req, res) => {
    // Una respuesta exitosa para DELETE no suele tener contenido.
    res.status(204).send();
  })
);

export default router;
