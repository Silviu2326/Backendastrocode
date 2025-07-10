const { Router } = require('express');
const { body, param } = require('express-validator');

// --- Importaciones Hipotéticas ---
// Se asume la existencia de los siguientes archivos y sus funciones.
// Los controladores contienen la lógica de negocio y las respuestas HTTP.
const {
  getStudyPlanById,
  updateActivityStatus,
  generateCalendarForPlan
} = require('../controllers/planEstudio.controller');

// Middleware que centraliza la captura de errores de validación.
const { validateFields } = require('../middlewares/validateFields');

// --- Inicialización del Router ---
const router = Router();

// =============================================
//         RUTAS PARA PLANES DE ESTUDIO
// =============================================

/**
 * @route   GET /api/plan-estudio/:id
 * @desc    Obtener los detalles de un plan de estudio por su ID.
 * @access  Public
 * @async
 * 
 * Esta ruta es idempotente y se utiliza para recuperar un recurso específico.
 * Responde con el objeto del plan de estudio si se encuentra (200 OK) o con un error si no (404 Not Found).
 */
router.get(
  '/:id',
  [
    // 1. Middleware de Validación: asegura que el ID sea un entero válido.
    param('id', 'El ID del plan de estudio debe ser un número entero.').isInt({ min: 1 }),
    
    // 2. Middleware de Resultado de Validación: maneja los errores encontrados por express-validator.
    validateFields
  ],
  getStudyPlanById // 3. Controlador: ejecuta la lógica de negocio.
);

/**
 * @route   PATCH /api/plan-estudio/actividad/:activityId
 * @desc    Actualizar el estado (completado/pendiente) de una actividad específica.
 * @access  Private (se asume que el usuario debe estar autenticado)
 * @async
 * 
 * Se utiliza PATCH porque es una actualización parcial de un recurso (el estado de la actividad).
 * El cuerpo de la solicitud debe contener `{"completed": boolean}`.
 * Responde con un mensaje de éxito (200 OK) o errores de validación (400 Bad Request) o si no se encuentra (404 Not Found).
 */
router.patch(
  '/actividad/:activityId',
  [
    // 1. Middleware de Validación de Parámetros
    param('activityId', 'El ID de la actividad debe ser un número entero.').isInt({ min: 1 }),
    
    // 2. Middleware de Validación del Cuerpo de la Solicitud
    body('completed', 'El campo \"completed\" es requerido y debe ser un valor booleano.').isBoolean(),
    
    // 3. Middleware de Resultado de Validación
    validateFields
  ],
  updateActivityStatus // 4. Controlador
);

/**
 * @route   POST /api/plan-estudio/:id/calendario
 * @desc    Genera un calendario de estudio personalizado para un plan, basado en la disponibilidad del usuario.
 * @access  Private (se asume que el usuario debe estar autenticado)
 * @async
 * 
 * Se utiliza POST porque esta operación no es idempotente y resulta en la creación de un nuevo recurso (el calendario).
 * El cuerpo de la solicitud debe contener el arreglo `disponibilidad`.
 * Responde con el calendario generado (201 Created) o errores de validación (400 Bad Request).
 */
router.post(
  '/:id/calendario',
  [
    // 1. Middleware de Validación de Parámetros
    param('id', 'El ID del plan de estudio debe ser un número entero.').isInt({ min: 1 }),
    
    // 2. Middleware de Validación del Cuerpo de la Solicitud
    body('disponibilidad', 'La disponibilidad es requerida y debe ser un arreglo no vacío.').isArray({ min: 1 }),
    body('disponibilidad.*.dia',
      'El día en la disponibilidad debe ser uno de: domingo, lunes, martes, miercoles, jueves, viernes, sabado.'
    ).isString().isIn(['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']),
    body('disponibilidad.*.horas', 'Las horas de disponibilidad deben ser un valor numérico mayor o igual a 0.').isFloat({ min: 0 }),
    
    // 3. Middleware de Resultado de Validación
    validateFields
  ],
  generateCalendarForPlan // 4. Controlador
);

module.exports = router;