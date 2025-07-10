import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';

// NOTA: Se asume que las funciones del controlador están en '../controllers/laboratorio.controller.js'
// y que manejan la lógica de negocio (consultar datos, validar soluciones, etc.) y los errores asíncronos.
import {
  obtenerEjerciciosPorLeccion,
  obtenerEjercicioEspecifico,
  enviarSolucionEjercicio,
  obtenerHistorialIntentos
} from '../controllers/laboratorio.controller.js';

const router = Router();

// Middleware reutilizable para manejar errores de validación de express-validator
const manejarErroresValidacion = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Si hay errores de validación, responde con un código 400 (Bad Request)
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// ------------------ Definición de Rutas para el Laboratorio ------------------

/**
 * @route   GET /api/laboratorio/ejercicios
 * @desc    Obtiene la lista de ejercicios para una lección específica.
 * @access  Public
 * @query   leccion - El ID numérico de la lección es obligatorio.
 */
router.get(
  '/ejercicios',
  [
    // Regla de validación: el query param 'leccion' debe existir y ser un número.
    query('leccion', 'El parámetro de consulta \"leccion\" es requerido y debe ser numérico')
      .exists()
      .isNumeric(),
  ],
  manejarErroresValidacion,
  obtenerEjerciciosPorLeccion // El controlador se encarga de la lógica y la respuesta
);

/**
 * @route   GET /api/laboratorio/ejercicios/:leccionId/:ejercicioId
 * @desc    Obtiene un ejercicio específico por su ID y el de su lección.
 * @access  Public
 * @param   leccionId - El ID numérico de la lección.
 * @param   ejercicioId - El ID alfanumérico del ejercicio (ej. "ej1").
 */
router.get(
  '/ejercicios/:leccionId/:ejercicioId',
  [
    // Reglas de validación para los parámetros de la URL
    param('leccionId', 'El ID de la lección en la URL debe ser numérico').isNumeric(),
    param('ejercicioId', 'El ID del ejercicio en la URL es requerido').not().isEmpty().isString(),
  ],
  manejarErroresValidacion,
  obtenerEjercicioEspecifico
);

/**
 * @route   POST /api/laboratorio/ejercicios/:leccionId/:ejercicioId/submit
 * @desc    Envía una solución para un ejercicio y recibe el resultado de la validación.
 * @access  Public
 * @body    { "solucion": { ... } } - Objeto que contiene la respuesta del usuario.
 */
router.post(
  '/ejercicios/:leccionId/:ejercicioId/submit',
  [
    // Validación de parámetros de URL
    param('leccionId', 'El ID de la lección en la URL debe ser numérico').isNumeric(),
    param('ejercicioId', 'El ID del ejercicio en la URL es requerido').not().isEmpty().isString(),
    // Validación del cuerpo de la solicitud
    body('solucion', 'El objeto \"solucion\" en el cuerpo es requerido y no debe estar vacío').isObject({ strict: false }).notEmpty(),
  ],
  manejarErroresValidacion,
  enviarSolucionEjercicio
);

/**
 * @route   GET /api/laboratorio/historial
 * @desc    Obtiene el historial de todos los intentos de solución.
 * @access  Public (en un caso real, debería ser privado y por usuario).
 */
router.get(
  '/historial',
  obtenerHistorialIntentos
);

export default router;
