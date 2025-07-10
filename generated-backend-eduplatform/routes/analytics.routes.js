const express = require('express');
const router = express.Router();
const { z } = require('zod');

// Importar el controlador existente
const AnalyticsController = require('../controllers/analytics.controller.js');

// --- Middlewares Requeridos (simulados para el ejemplo) ---

// Middleware de autenticación y autorización con roles (JWT)
// NOTA: Se asume que 'authMiddleware' decodifica el JWT, adjunta el usuario a 'req.user' y valida los roles.
const authMiddleware = require('../middlewares/auth.middleware.js');

// Middleware de validación de esquemas usando zod-express-middleware o similar
const validate = require('../middlewares/validate.middleware.js');

// Middleware de Rate Limiting
const rateLimiter = require('../middlewares/rateLimiter.middleware.js'); // Configurado para 10 req/min

// Middleware de Logging
const requestLogger = require('../middlewares/logger.middleware.js');

// --- Esquemas de Validación con Zod ---

const getCursosAnalyticsSchema = {
  query: z.object({
    page: z.string().regex(/^\d+$/).transform(Number).optional().describe('Número de página para paginación'),
    limit: z.string().regex(/^\d+$/).transform(Number).optional().describe('Resultados por página'),
    sortBy: z.enum(['fechaCreacion', 'estudiantes', 'titulo']).optional().describe('Campo para ordenar los resultados'),
    order: z.enum(['asc', 'desc']).optional().describe('Orden ascendente o descendente'),
    autor: z.string().optional().describe('Filtrar cursos por ID o nombre de autor')
  })
};

const getCursoAnalyticsByIdSchema = {
  params: z.object({
    cursoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'El ID del curso debe ser un ObjectId válido.').describe('ID único del curso (ObjectId)')
  })
};


// --- Definición de Rutas de Analíticas ---

/**
 * @openapi
 * tags:
 *   name: Analytics
 *   description: Endpoints para obtener analíticas de cursos.
 */
router.use(requestLogger); // Aplicar logger a todas las rutas de analíticas

/**
 * @openapi
 * /api/v1/analytics/cursos:
 *   get:
 *     summary: Obtiene una lista de analíticas de cursos con paginación y filtros.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Cantidad de resultados por página.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [fechaCreacion, estudiantes, titulo]
 *         description: Campo por el cual ordenar.
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Orden de los resultados.
 *     responses:
 *       '200':
 *         description: Lista de analíticas de cursos obtenida exitosamente.
 *       '401':
 *         description: No autorizado (token no válido o ausente).
 *       '403':
 *         description: Prohibido (rol insuficiente).
 *       '429':
 *         description: Demasiadas solicitudes.
 */
router.get(
  '/cursos',
  rateLimiter, // 1. Rate Limiter por IP
  authMiddleware(['admin', 'instructor']), // 2. JWT Auth con roles (solo admins e instructores)
  validate(getCursosAnalyticsSchema), // 3. Validación robusta de query params
  AnalyticsController.getCursosAnalytics // 4. Llama al método correcto del controlador
);

/**
 * @openapi
 * /api/v1/analytics/cursos/{cursoId}:
 *   get:
 *     summary: Obtiene las métricas y analíticas detalladas de un curso específico.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cursoId
 *         required: true
 *         schema:
 *           type: string
 *         description: El ID del curso.
 *     responses:
 *       '200':
 *         description: Analíticas del curso obtenidas exitosamente.
 *       '401':
 *         description: No autorizado.
 *       '403':
 *         description: Prohibido. El usuario podría no ser el creador del curso.
 *       '404':
 *         description: Curso no encontrado.
 *       '429':
 *         description: Demasiadas solicitudes.
 */
router.get(
  '/cursos/:cursoId',
  rateLimiter, // 1. Rate Limiter
  authMiddleware(['admin', 'instructor']), // 2. JWT Auth con roles
  validate(getCursoAnalyticsByIdSchema), // 3. Validación del ID en los parámetros de la ruta
  AnalyticsController.getCursoAnalyticsById // 4. Llama al método del controlador que espera el ID
);

module.exports = router;
