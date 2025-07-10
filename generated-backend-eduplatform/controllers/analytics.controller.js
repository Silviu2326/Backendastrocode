const analyticsService = require('../services/analytics.service.js');
const { AppError, handleError } = require('../utils/error.handler.js');

/**
 * @description Controlador para obtener una lista de analíticas de cursos con paginación, filtros y ordenación.
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Middleware para el manejo de errores.
 */
const handleGetAllAnalytics = async (req, res, next) => {
  try {
    // Los parámetros de consulta (filtros, paginación, orden) se pasan directamente al servicio
    const { page = 1, limit = 10 } = req.query;
    
    const { courses, totalItems } = await analyticsService.getAllAnalytics(req.query);

    res.status(200).json({
      data: courses,
      meta: {
        totalItems,
        itemCount: courses.length,
        itemsPerPage: parseInt(limit, 10),
        totalPages: Math.ceil(totalItems / limit),
        currentPage: parseInt(page, 10),
      },
      error: null,
    });
  } catch (error) {
    // Pasa el error al manejador de errores centralizado
    next(error);
  }
};

/**
 * @description Controlador para obtener las métricas detalladas de un curso específico por su ID.
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Middleware para el manejo de errores.
 */
const handleGetAnalyticsById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const course = await analyticsService.getAnalyticsById(id);

    // El servicio lanza un error si no se encuentra, que es capturado por el catch.
    // Esto mantiene el controlador limpio.

    res.status(200).json({
      data: course,
      meta: null,
      error: null,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetAllAnalytics,
  handleGetAnalyticsById,
};
