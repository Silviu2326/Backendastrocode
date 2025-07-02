/**
 * temario.controller.js
 * 
 * Este archivo contiene los controladores de Express para gestionar las operaciones
 * relacionadas con la generación y guardado de temarios de cursos.
 * Cada controlador maneja la lógica de la solicitud HTTP, la validación de entrada
 * y la interacción con la capa de servicio (lógica de negocio).
 */

// En una aplicación real, estas funciones de lógica de negocio estarían en un archivo de servicios.
// Ejemplo: import { generar, guardar, obtenerSugerencias } from '../services/temario.service.js';
// Para este ejercicio, asumimos que las funciones del API original actúan como nuestro servicio.
import {
  generateCourseOutline,
  guardarTemario,
  sugerenciasPorNivel
} from '../services/temario.service.js';

/**
 * @description Controlador para generar un nuevo temario a partir de datos de un formulario.
 *              Maneja la solicitud, valida los datos de entrada y llama al servicio de generación.
 * @route POST /api/temarios/generar
 * @access Public
 * @param {object} req - Objeto de solicitud de Express. El body debe contener { tema, nivel, duracion, enfoque, objetivos }.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar al siguiente middleware (manejo de errores).
 */
export const generarTemarioHandler = async (req, res, next) => {
  try {
    const formData = req.body;

    // --- 1. Validación de Datos de Entrada ---
    const { tema, nivel, duracion, objetivos } = formData;
    if (!tema || !nivel || !duracion) {
      // Si faltan campos obligatorios, devuelve un error 400 (Bad Request).
      return res.status(400).json({
        success: false,
        message: 'Los campos "tema", "nivel" y "duracion" son obligatorios.'
      });
    }

    // Validación adicional: 'objetivos' debe ser un array si se proporciona.
    if (objetivos && !Array.isArray(objetivos)) {
      return res.status(400).json({
        success: false,
        message: 'El campo "objetivos" debe ser un arreglo de strings.'
      });
    }

    // --- 2. Lógica de Negocio (Llamada al Servicio) ---
    // Llama a la función de servicio que contiene la lógica de generación del temario.
    const temarioGenerado = await generateCourseOutline(formData);

    // --- 3. Respuesta HTTP Exitosa ---
    // Envía una respuesta 201 (Created) con el temario generado.
    res.status(201).json({
      success: true,
      message: 'Temario generado exitosamente.',
      data: temarioGenerado
    });

  } catch (error) {
    // --- 4. Manejo de Errores ---
    // Si ocurre un error en la lógica de negocio, se captura aquí.
    console.error('Error en generarTemarioHandler:', error.message);
    // Pasa el control al middleware de manejo de errores centralizado de Express.
    next(error);
  }
};

/**
 * @description Controlador para guardar una estructura de temario finalizada.
 *              Maneja la solicitud, valida la estructura y llama al servicio de guardado.
 * @route POST /api/temarios
 * @access Public
 * @param {object} req - Objeto de solicitud de Express. El body debe contener la estructura completa del temario.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar al siguiente middleware.
 */
export const guardarTemarioHandler = async (req, res, next) => {
  try {
    const estructuraTemario = req.body;

    // --- 1. Validación de Datos de Entrada ---
    // Valida que la estructura del temario sea un objeto y contenga campos clave.
    if (!estructuraTemario || typeof estructuraTemario !== 'object' || !estructuraTemario.titulo || !estructuraTemario.bloques || !Array.isArray(estructuraTemario.bloques)) {
      return res.status(400).json({
        success: false,
        message: 'El cuerpo de la solicitud es inválido. Se requiere una estructura de temario válida con "titulo" y "bloques".'
      });
    }

    // --- 2. Lógica de Negocio (Llamada al Servicio) ---
    // Llama al servicio que se encarga de persistir los datos (simulado).
    const resultadoGuardado = await guardarTemario(estructuraTemario);

    // --- 3. Respuesta HTTP Exitosa ---
    // El servicio ya devuelve el formato de respuesta adecuado { success, message, ... }.
    // Se envía una respuesta 201 (Created).
    res.status(201).json(resultadoGuardado);

  } catch (error) {
    // --- 4. Manejo de Errores ---
    console.error('Error en guardarTemarioHandler:', error.message);
    next(error);
  }
};

/**
 * @description Controlador para obtener sugerencias de temas basadas en un nivel.
 *              Maneja la solicitud, valida el parámetro de consulta y llama al servicio.
 * @route GET /api/sugerencias?nivel=principiante
 * @access Public
 * @param {object} req - Objeto de solicitud de Express. Espera un query param 'nivel'.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar al siguiente middleware.
 */
export const obtenerSugerenciasHandler = async (req, res, next) => {
  try {
    const { nivel } = req.query;

    // --- 1. Validación de Datos de Entrada ---
    if (!nivel) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro de consulta "nivel" es obligatorio. Ej: /api/sugerencias?nivel=principiante'
      });
    }
    
    const nivelesValidos = ['principiante', 'intermedio', 'avanzado'];
    if (!nivelesValidos.includes(nivel.toLowerCase())) {
      return res.status(400).json({
          success: false,
          message: `El nivel "${nivel}" no es válido. Los niveles permitidos son: ${nivelesValidos.join(', ')}.`
      });
    }

    // --- 2. Lógica de Negocio (Llamada al Servicio) ---
    const listaSugerencias = await sugerenciasPorNivel(nivel);

    // --- 3. Respuesta HTTP Exitosa ---
    // Envía una respuesta 200 (OK) con la lista de sugerencias.
    res.status(200).json({
      success: true,
      nivel: nivel,
      data: listaSugerencias
    });

  } catch (error) {
    // --- 4. Manejo de Errores ---
    console.error('Error en obtenerSugerenciasHandler:', error.message);
    next(error);
  }
};
