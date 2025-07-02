/**
 * lessonController.js
 * 
 * Este archivo contiene los controladores para gestionar las operaciones
 * relacionadas con las lecciones de un curso.
 */

// Asumimos que la lógica de negocio está en una capa de servicio/API.
import { updateLessonStatus as updateStatusService, fetchLessonContent as fetchContentService } from '../services/api.js';

/**
 * @description Actualiza el estado de completado de una lección específica.
 *              Corresponde a la función `updateLessonStatus` del API.
 * @route PATCH /api/lessons/:lessonId/status
 * @access Private
 * 
 * @param {object} req - El objeto de solicitud de Express.
 * @param {object} res - El objeto de respuesta de Express.
 */
export const updateLessonStatus = async (req, res) => {
  try {
    // 1. Extraer ID de la lección de los parámetros y estado del cuerpo de la petición.
    const { lessonId } = req.params;
    const { completed } = req.body;

    // 2. Validación de datos de entrada.
    if (!lessonId) {
      return res.status(400).json({ 
        success: false, 
        message: 'El ID de la lección es requerido en los parámetros.' 
      });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'El campo "completed" es requerido y debe ser un valor booleano (true o false).' 
      });
    }

    // 3. Invocar al servicio para actualizar la lección.
    // Se asume que el servicio devolverá `null` o lanzará un error si la lección no existe.
    const result = await updateStatusService(lessonId, completed);

    if (!result) {
      return res.status(404).json({ success: false, message: 'Lección no encontrada.' });
    }

    // 4. Enviar respuesta HTTP exitosa con el resultado de la operación.
    res.status(200).json({ 
      success: true, 
      message: result.message, 
      data: { newProgress: result.newProgress }
    });

  } catch (error) {
    // 5. Manejo de errores.
    console.error(`Error en updateLessonStatus: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al actualizar la lección.' 
    });
  }
};

/**
 * @description Obtiene el contenido detallado de una lección específica.
 *              Corresponde a la función `fetchLessonContent` del API.
 * @route GET /api/lessons/:lessonId
 * @access Private
 * 
 * @param {object} req - El objeto de solicitud de Express.
 * @param {object} res - El objeto de respuesta de Express.
 */
export const getLessonContent = async (req, res) => {
  try {
    // 1. Extraer ID de la lección de los parámetros.
    const { lessonId } = req.params;

    // 2. Validación de entrada.
    if (!lessonId) {
      return res.status(400).json({ 
        success: false, 
        message: 'El ID de la lección es requerido.' 
      });
    }

    // 3. Invocar al servicio para obtener el contenido.
    const lessonContent = await fetchContentService(lessonId);

    // 4. Manejar el caso en que la lección no se encuentra.
    if (!lessonContent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Contenido de la lección no encontrado.' 
      });
    }

    // 5. Enviar respuesta HTTP exitosa.
    res.status(200).json({ 
      success: true, 
      data: lessonContent 
    });

  } catch (error) {
    // 6. Manejo de errores.
    console.error(`Error en getLessonContent: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al obtener el contenido de la lección.' 
    });
  }
};
