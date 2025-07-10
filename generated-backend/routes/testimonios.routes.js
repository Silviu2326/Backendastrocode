import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';

// --- Importación de Controladores (Asumidos) ---
// import {
//   obtenerTestimonios,
//   obtenerTestimonioPorId,
//   crearTestimonio,
//   actualizarTestimonio,
//   eliminarTestimonio
// } from '../controllers/testimonios.controller.js';

const router = Router();

// --- Middlewares de Validación Específicos para Testimonios ---

// Valida que el ID en el parámetro sea un entero.
const validarIdEnParametro = [
  param('id').isInt({ min: 1 }).withMessage('El ID del testimonio debe ser un número entero positivo.')
];

// Valida los datos del cuerpo al crear o actualizar un testimonio.
const validarDatosTestimonio = [
  body('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio.'),
  body('role')
    .trim()
    .notEmpty().withMessage('El rol es obligatorio.'),
  body('quote')
    .trim()
    .notEmpty().withMessage('La cita (quote) es obligatoria.')
    .isLength({ min: 20 }).withMessage('La cita debe tener al menos 20 caracteres.'),
  body('rating')
    .notEmpty().withMessage('La calificación es obligatoria.')
    .isInt({ min: 1, max: 5 }).withMessage('La calificación debe ser un número entero entre 1 y 5.'),
  body('avatar')
    .optional()
    .isURL().withMessage('El avatar debe ser una URL válida.')
];

// --- Middleware para Manejar Errores de Validación ---

const manejarErroresValidacion = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// --- Wrapper para Rutas Asíncronas (Manejo de Errores) ---

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- Definición de Rutas para el Recurso 'Testimonios' ---

/**
 * @route   GET /api/testimonios
 * @desc    Obtener todos los testimonios.
 * @access  Public
 */
router.get('/', asyncHandler(/* obtenerTestimonios */ (req, res) => {
  res.status(200).json({ message: 'Controlador obtenerTestimonios ejecutado' });
}));

/**
 * @route   GET /api/testimonios/:id
 * @desc    Obtener un testimonio por su ID.
 * @access  Public
 */
router.get('/:id',
  validarIdEnParametro,
  manejarErroresValidacion,
  asyncHandler(/* obtenerTestimonioPorId */ (req, res) => {
    res.status(200).json({ message: `Controlador obtenerTestimonioPorId ejecutado para id: ${req.params.id}` });
  })
);

/**
 * @route   POST /api/testimonios
 * @desc    Crear un nuevo testimonio.
 * @access  Private
 */
router.post('/',
  validarDatosTestimonio,
  manejarErroresValidacion,
  asyncHandler(/* crearTestimonio */ (req, res) => {
    res.status(201).json({ message: 'Controlador crearTestimonio ejecutado', data: req.body });
  })
);

/**
 * @route   PUT /api/testimonios/:id
 * @desc    Actualizar un testimonio existente.
 * @access  Private
 */
router.put('/:id',
  [
    ...validarIdEnParametro,
    ...validarDatosTestimonio
  ],
  manejarErroresValidacion,
  asyncHandler(/* actualizarTestimonio */ (req, res) => {
    res.status(200).json({ message: `Controlador actualizarTestimonio ejecutado para id: ${req.params.id}`, data: req.body });
  })
);

/**
 * @route   DELETE /api/testimonios/:id
 * @desc    Eliminar un testimonio.
 * @access  Private
 */
router.delete('/:id',
  validarIdEnParametro,
  manejarErroresValidacion,
  asyncHandler(/* eliminarTestimonio */ (req, res) => {
    res.status(204).send();
  })
);

export default router;
