/**
 * progressController.js
 * 
 * Este controlador maneja toda la lógica de negocio relacionada con el progreso del usuario,
 * incluyendo la obtención de datos del dashboard, actualización de tiempo de estudio,
 * estadísticas detalladas, logros y recomendaciones de IA.
 */

// En una aplicación real, estos servicios se importarían desde una capa de servicio,
// la cual se encargaría de la lógica de base de datos o llamadas a otras APIs.
// const progressService = require('../services/progressService');

// Para este ejemplo, simularemos que las funciones del archivo API están en un servicio importado.
const progressService = require('../services/progressService.js');

/**
 * @desc    Obtiene el dashboard de progreso general de un usuario.
 * @route   GET /api/v1/progress/:userId/dashboard
 * @access  Private (se asume que el usuario está autenticado y autorizado)
 */
exports.getProgressDashboard = async (req, res) => {
  try {
    const { userId } = req.params;

    // Llama al servicio para obtener los datos de progreso.
    const progressData = await progressService.fetchProgressData(userId);

    if (!progressData) {
      return res.status(404).json({ 
        success: false, 
        message: `No se encontraron datos de progreso para el usuario con ID ${userId}` 
      });
    }

    // Envía una respuesta exitosa con los datos.
    res.status(200).json({
      success: true,
      data: progressData
    });

  } catch (error) {
    console.error('Error en getProgressDashboard:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al obtener el progreso.' 
    });
  }
};

/**
 * @desc    Registra nuevo tiempo de estudio para un usuario.
 * @route   POST /api/v1/progress/:userId/study-time
 * @access  Private
 */
exports.addStudyTime = async (req, res) => {
  try {
    const { userId } = req.params;
    const { minutes } = req.body;

    // Validación de datos de entrada
    if (minutes === undefined || typeof minutes !== 'number' || minutes <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'El campo \"minutes\" es requerido y debe ser un número positivo.' 
      });
    }

    // Llama al servicio para actualizar el tiempo. En una app real, se pasaría el userId.
    const updateResult = await progressService.updateStudyTime(minutes /*, userId */);

    // Envía una respuesta exitosa.
    res.status(200).json(updateResult);

  } catch (error) {
    console.error('Error en addStudyTime:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al actualizar el tiempo de estudio.' 
    });
  }
};

/**
 * @desc    Obtiene las estadísticas detalladas de progreso de un usuario.
 * @route   GET /api/v1/progress/:userId/statistics
 * @access  Private
 */
exports.getProgressStatistics = async (req, res) => {
  try {
    const { userId } = req.params;

    // Llama al servicio. Se asume que el servicio usaría el userId para filtrar.
    const statistics = await progressService.obtenerEstadisticasProgreso(/* userId */);

    if (!statistics) {
        return res.status(404).json({ 
          success: false, 
          message: `No se encontraron estadísticas para el usuario con ID ${userId}` 
        });
    }

    // Envía una respuesta exitosa con los datos.
    res.status(200).json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Error en getProgressStatistics:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al obtener las estadísticas.' 
    });
  }
};

/**
 * @desc    Obtiene la lista de badges y logros de un usuario.
 * @route   GET /api/v1/progress/:userId/achievements
 * @access  Private
 */
exports.getAchievements = async (req, res) => {
  try {
    const { userId } = req.params;

    // Llama al servicio. Se asume que el servicio usaría el userId.
    const achievements = await progressService.obtenerBadgesLogros(/* userId */);

    // Envía una respuesta exitosa con la lista de logros.
    res.status(200).json({
      success: true,
      count: achievements.length,
      data: achievements
    });

  } catch (error) {
    console.error('Error en getAchievements:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al obtener los logros.' 
    });
  }
};

/**
 * @desc    Genera y obtiene una recomendación de estudio basada en IA.
 * @route   GET /api/v1/progress/:userId/recommendation
 * @access  Private
 */
exports.getAiRecommendation = async (req, res) => {
  try {
    const { userId } = req.params;

    // Llama al servicio de IA para generar la recomendación para el usuario.
    const recommendation = await progressService.generarRecomendacionIA(/* userId */);

    // Envía una respuesta exitosa.
    res.status(200).json({
      success: true,
      data: recommendation
    });

  } catch (error) {
    console.error('Error en getAiRecommendation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al generar la recomendación.' 
    });
  }
};