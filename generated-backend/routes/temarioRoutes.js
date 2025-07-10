import { Router } from 'express';
import { param, validationResult } from 'express-validator';

// En una aplicación real, esta lógica estaría en una capa de servicio o controlador.
// Para este ejemplo, la importamos directamente para interactuar con los datos mock.
// NOTA: Se asume que el archivo mockDataTemario.js está en una ruta como '../data/mockDataTemario.js'
// y que la función se llama 'getTemarioDataByTema'.
import { getTemarioDataByTema } from '../data/mockDataTemario.js';

const router = Router();

/**
 * @route   GET /api/temario/:tema
 * @desc    Obtiene los datos de un temario (prerrequisitos, sugerencias, etc.) para un tema específico.
 *          La búsqueda no distingue mayúsculas/minúsculas e intenta coincidencias parciales.
 * @access  Public
 */
router.get(
  '/:tema',
  // 1. Middleware de Validación: Se asegura que el parámetro 'tema' sea válido.
  [
    param('tema', 'El parámetro "tema" es requerido y debe ser una cadena de texto.')
      .isString()
      .trim()
      .notEmpty(),
  ],
  // 2. Controlador de la ruta con manejo de operaciones asíncronas.
  async (req, res, next) => {
    // Comprobar si los middlewares de validación encontraron errores.
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 3. Respuesta HTTP para datos inválidos (Bad Request).
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Se extrae el parámetro 'tema' de la URL ya validado y sanitizado.
      const { tema } = req.params;

      // 4. Lógica de Negocio: Se llama a la función que obtiene los datos.
      // Se envuelve en Promise.resolve para simular asincronía, una buena práctica si la fuente
      // de datos cambiara a una base de datos en el futuro.
      const temarioData = await Promise.resolve(getTemarioDataByTema(tema));

      // 5. Respuestas HTTP apropiadas según el resultado.
      if (temarioData) {
        // Si se encuentran los datos, se responde con 200 (OK) y el payload.
        res.status(200).json(temarioData);
      } else {
        // Si la función no devuelve datos, el recurso no existe: 404 (Not Found).
        res.status(404).json({ message: `No se encontraron datos para el tema: "${tema}"` });
      }
    } catch (error) {
      // 6. Manejo de Errores Completo: Captura cualquier error inesperado.
      console.error(`Error en la ruta GET /api/temario/:tema - Tema: "${req.params.tema}"`, error);
      // Pasa el error al middleware de manejo de errores de Express para una respuesta 500.
      next(error);
    }
  }
);

export default router;
