const CourseAnalyticsModel = require('../models/courseAnalyticsModel');

/**
 * @description Obtiene un resumen de analíticas para todos los cursos.
 *              Responde a una petición GET a la ruta designada.
 * @route       GET /api/analytics/cursos-creados
 * @access      Private (requiere autenticación)
 * @param {object} req Objeto de solicitud de Express.
 * @param {object} res Objeto de respuesta de Express.
 * @param {function} next Función para pasar al siguiente middleware de errores.
 */
const getCreatedCoursesAnalytics = async (req, res, next) => {
  try {
    // 1. Lógica de negocio: Interactuar con el modelo para obtener los datos.
    //    Se asume que el modelo/servicio `CourseAnalyticsModel.findAll()`
    //    devuelve todos los cursos con sus analíticas desde la base de datos.
    const courses = await CourseAnalyticsModel.findAll();

    // 2. Respuesta exitosa: Enviar los datos con estado 200 OK.
    //    Si `courses` es un array vacío, la respuesta seguirá siendo correcta,
    //    indicando que no hay recursos que mostrar.
    res.status(200).json({
      exito: true,
      cursos: courses,
      mensaje: 'Cursos obtenidos exitosamente.'
    });

  } catch (error) {
    // 3. Manejo de errores: Capturar cualquier error (ej. de base de datos)
    //    y pasarlo al middleware de errores centralizado de Express.
    console.error('Error al obtener la lista de cursos creados:', error);
    next(error); // Delega el manejo del error.
  }
};

/**
 * @description Obtiene las métricas detalladas de un curso específico por su ID.
 *              Responde a una petición GET a la ruta designada.
 * @route       GET /api/analytics/cursos-creados/:id
 * @access      Private (requiere autenticación)
 * @param {object} req Objeto de solicitud de Express.
 * @param {object} res Objeto de respuesta de Express.
 * @param {function} next Función para pasar al siguiente middleware de errores.
 */
const getCourseMetricsById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Validación de datos: Asegurar que el ID es un número válido.
    //    Una expresión regular simple para verificar si es un entero positivo.
    if (!/^[1-9]\\d*$/.test(id)) {
      return res.status(400).json({ // 400 Bad Request
        exito: false,
        mensaje: 'El ID del curso proporcionado no es válido. Debe ser un número entero positivo.'
      });
    }

    // 2. Lógica de negocio: Interactuar con el modelo para buscar por ID.
    //    Se asume que `CourseAnalyticsModel.findById(id)` busca el curso en la BD.
    const courseId = parseInt(id, 10);
    const course = await CourseAnalyticsModel.findById(courseId);

    // 3. Manejo de respuesta: Si el curso no se encuentra, devolver 404 Not Found.
    if (!course) {
      return res.status(404).json({ 
        exito: false,
        mensaje: `No se encontró un curso con el ID ${courseId}.`
      });
    }

    // 4. Respuesta exitosa: Enviar los datos del curso encontrado.
    res.status(200).json({
      exito: true,
      // El frontend espera un objeto `curso`, no `data`.
      curso: course,
      mensaje: 'Métricas del curso obtenidas exitosamente.'
    });

  } catch (error) {
    // 5. Manejo de errores: Capturar y delegar errores inesperados.
    console.error(`Error al obtener métricas para el curso ID ${req.params.id}:`, error);
    next(error);
  }
};

// Exportar los controladores para ser usados en el archivo de rutas (e.g., analyticsRoutes.js).
module.exports = {
  getCreatedCoursesAnalytics,
  getCourseMetricsById,
};