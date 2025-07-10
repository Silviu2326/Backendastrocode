const Curso = require('../models/curso.model.js');
const { AppError } = require('../utils/error.handler.js'); // Utilidad para errores personalizados

/**
 * Parsea y construye las opciones de consulta para Mongoose a partir de los query params.
 * @param {object} queryParams - Objeto req.query de Express.
 * @returns {{filters: object, options: object}} - Objeto con filtros y opciones para Mongoose.
 */
const buildQueryOptions = (queryParams) => {
  const { page = 1, limit = 10, sort, ...restOfQuery } = queryParams;

  // 1. Opciones de paginación y ordenación
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 }, // Orden por defecto
    populate: { path: 'autor', select: 'nombre email' } // Poblar datos del autor
  };

  if (sort) {
    const sortFields = sort.split(',').join(' ');
    options.sort = sortFields;
  }

  // 2. Filtros dinámicos
  const filters = { ...restOfQuery, deleted: { $ne: true } }; // Excluir documentos con soft-delete

  // Ejemplo de cómo manejar filtros numéricos o de rangos (si fuera necesario)
  // if (filters.estudiantes_gte) {
  //   filters.estudiantes = { ...filters.estudiantes, $gte: parseInt(filters.estudiantes_gte, 10) };
  //   delete filters.estudiantes_gte;
  // }

  return { filters, options };
};

/**
 * @description Obtiene una lista de analíticas de cursos aplicando filtros, paginación y ordenación.
 * @param {object} queryParams - Parámetros de la consulta (page, limit, sort, etc.).
 * @returns {Promise<{courses: Array, totalItems: number}>} - Un objeto con la lista de cursos y el conteo total.
 */
const getAllAnalytics = async (queryParams) => {
  const { filters, options } = buildQueryOptions(queryParams);

  // En lugar de find() y countDocuments() por separado, usamos el plugin mongoose-paginate-v2
  // que es más eficiente y se asume que está en el modelo `Curso` para este tipo de operaciones.
  // Si no se usa el plugin, se harían dos llamadas: Curso.find(...) y Curso.countDocuments(...)
  
  // Asumimos que el modelo Curso tiene el plugin `mongoose-paginate-v2`
  const result = await Curso.paginate(filters, options);

  return {
    courses: result.docs,
    totalItems: result.totalDocs,
  };
};

/**
 * @description Obtiene las métricas detalladas de un curso específico por su ID.
 * @param {string} cursoId - El ID del curso a buscar.
 * @returns {Promise<object>} - El documento del curso encontrado.
 * @throws {AppError} - Lanza un error si el curso no se encuentra.
 */
const getAnalyticsById = async (cursoId) => {
  // Usamos findById y poblamos el autor para obtener sus datos
  const course = await Curso.findById(cursoId).populate('autor', 'nombre email');

  if (!course || course.deleted) {
    // Lanzamos un error específico que será manejado por el controlador/middleware
    throw new AppError('Curso no encontrado', 404);
  }

  return course;
};

module.exports = {
  getAllAnalytics,
  getAnalyticsById,
};
