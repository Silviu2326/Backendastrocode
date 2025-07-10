/**
 * courseController.js
 * 
 * Este archivo contiene los controladores para gestionar las operaciones
 * relacionadas con los cursos. Se encarga de recibir las peticiones HTTP,
 * validar los datos de entrada, invocar a la capa de servicio correspondiente
 * y enviar una respuesta al cliente.
 */

// Se asume que existe una capa de servicio que maneja la lógica de negocio
// y la interacción con la base de datos (o la simulación de API en este caso).
// Ejemplo: import { fetchCourse } from '../services/courseService.js';

// Para este ejercicio, asumimos que importamos la función del archivo de API/servicio.
// En una aplicación real, esta función se conectaría a una base de datos.
import { fetchCourse } from '../services/api.js'; 

/**
 * @description Obtiene los detalles completos de un curso por su ID.
 *              Corresponde a la función `fetchCourse` del API.
 * @route GET /api/courses/:id
 * @access Private (se asume que el usuario debe estar autenticado para ver un curso)
 * 
 * @param {object} req - El objeto de solicitud de Express.
 * @param {object} res - El objeto de respuesta de Express.
 */
export const getCourseById = async (req, res) => {
  try {
    // 1. Extraer el ID del curso de los parámetros de la URL.
    const { id } = req.params;

    // 2. Validación de entrada (básica).
    // En una aplicación real, se usaría una librería como express-validator para validaciones más complejas.
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: 'El ID del curso es requerido en los parámetros de la URL.' 
      });
    }

    // 3. Invocar a la capa de servicio para buscar el curso.
    // La capa de servicio se encarga de la lógica de buscar en la BD o en otra fuente.
    const course = await fetchCourse(id);

    // 4. Manejar el caso en que el curso no se encuentra (el servicio podría devolver null).
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: 'Curso no encontrado.' 
      });
    }

    // 5. Enviar respuesta HTTP exitosa con los datos del curso.
    res.status(200).json({ 
      success: true, 
      data: course 
    });

  } catch (error) {
    // 6. Manejo de errores inesperados del servidor.
    console.error(`Error en getCourseById: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor al intentar obtener el curso.' 
    });
  }
};
