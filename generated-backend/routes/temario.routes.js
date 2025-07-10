/**
 * temario.routes.js
 * 
 * Este archivo define las rutas de la API relacionadas con la generación y gestión de temarios.
 * Utiliza Express.Router para modularizar las rutas y express-validator para la validación
 * de los datos de entrada, asegurando que las solicitudes cumplan con el formato esperado
 * antes de ser procesadas por los controladores.
 */

import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';

// Se asume la existencia de controladores que encapsulan la lógica de negocio.
// Estos controladores serían responsables de llamar a las funciones del servicio como 'generateCourseOutline'.
import {
  crearTemarioController,
  obtenerSugerenciasController
} from '../controllers/temario.controller.js'; // Ruta hipotética del controlador

const router = Router();

/**
 * Middleware para centralizar el manejo de errores de validación.
 * Si express-validator encuentra errores en la solicitud, este middleware responde
 * con un código de estado 400 (Bad Request) y el detalle de los errores.
 * Si no hay errores, cede el control al siguiente middleware en la cadena (el controlador).
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Error de validación en los datos de entrada.',
      errors: errors.array()
    });
  }
  next();
};

// --- Definición de Rutas para la API de Temarios ---

/**
 * @route   POST /api/temarios
 * @desc    Crea un nuevo temario a partir de los datos proporcionados.
 *          Corresponde a las funciones 'generateCourseOutline' y 'guardarTemario'.
 *          El cuerpo de la solicitud (body) debe contener los parámetros para generar el temario.
 * @access  Public
 */
router.post(
  '/',
  [
    // Cadena de middlewares de validación para el cuerpo de la solicitud
    body('tema', 'El campo `tema` es requerido y debe ser un texto.').isString().notEmpty().trim(),
    body('nivel', 'El campo `nivel` es requerido y debe ser uno de: principiante, intermedio, avanzado.').isIn(['principiante', 'intermedio', 'avanzado']),
    body('duracion', 'El campo `duracion` es requerido y debe ser uno de: corto, medio, largo.').isIn(['corto', 'medio', 'largo']),
    body('enfoque', 'El campo `enfoque` es requerido y debe ser un texto.').isString().notEmpty().trim(),
    body('objetivos', 'El campo `objetivos` debe ser un arreglo de textos.').isArray(),
    body('objetivos.*', 'Cada objetivo dentro del arreglo debe ser un texto.').optional().isString(),
  ],
  handleValidationErrors, // Middleware para procesar los resultados de la validación
  crearTemarioController  // Controlador que se ejecuta si la validación es exitosa
);

/**
 * @route   GET /api/temarios/sugerencias
 * @desc    Obtiene datos de sugerencia, por ejemplo, para rellenar campos del formulario.
 *          Corresponde a la función 'sugerenciasPorNivel' del mock.
 *          Puede filtrar las sugerencias por un nivel específico a través de un query param.
 * @access  Public
 */
router.get(
  '/sugerencias',
  [
    // Validación opcional para el parámetro de consulta 'nivel'
    query('nivel', 'Si se provee, el `nivel` debe ser uno de: principiante, intermedio, avanzado.')
      .optional()
      .isIn(['principiante', 'intermedio', 'avanzado']),
  ],
  handleValidationErrors,
  obtenerSugerenciasController
);

// Ejemplo de cómo se podría manejar un error genérico para rutas no encontradas en este enrutador
router.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Ruta no encontrada dentro del módulo de temarios.' 
    });
});

// Ejemplo de un manejador de errores específico para este router (si un controlador lanza un error)
router.use((err, req, res, next) => {
  console.error('Error en el router de temarios:', err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Ocurrió un error inesperado en el servidor al procesar la solicitud del temario.' 
  });
});

export default router;