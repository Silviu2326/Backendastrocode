const { mockTemarioData } = require('../data/mockDataTemario'); // Asumimos que los datos están en esta ruta

/**
 * Función helper interna para buscar datos de un temario.
 * Realiza una búsqueda case-insensitive y por coincidencia parcial.
 * @param {string} tema - El nombre del tema a buscar.
 * @returns {object|null} El objeto de datos del temario o null si no se encuentra.
 */
const findTemarioData = (tema) => {
  if (!tema) return null;

  const temaNormalizado = tema.toLowerCase().trim();

  // Búsqueda por coincidencia exacta (más eficiente)
  if (mockTemarioData[temaNormalizado]) {
    return mockTemarioData[temaNormalizado];
  }

  // Búsqueda por coincidencia parcial si la exacta falla
  const matchingKey = Object.keys(mockTemarioData).find(
    (key) => temaNormalizado.includes(key) || key.includes(temaNormalizado)
  );

  return matchingKey ? mockTemarioData[matchingKey] : null;
};

/**
 * @desc    Obtener la lista de todos los temas disponibles.
 * @route   GET /api/temarios
 * @access  Público
 */
const getAllTemas = async (req, res, next) => {
  try {
    const temas = Object.keys(mockTemarioData);

    if (!temas || temas.length === 0) {
      // Aunque es improbable con mock data, es una buena práctica manejar este caso
      return res.status(404).json({
        success: false,
        message: 'No se encontraron temas disponibles.'
      });
    }

    res.status(200).json({
      success: true,
      count: temas.length,
      data: temas
    });
  } catch (error) {
    // Pasa el error al middleware de manejo de errores de Express
    next(error);
  }
};

/**
 * @desc    Obtener todos los detalles de un tema específico.
 * @route   GET /api/temarios/:tema
 * @access  Público
 */
const getTemarioByTema = async (req, res, next) => {
  try {
    // Validación del parámetro de entrada
    const { tema } = req.params;
    if (!tema) {
      return res.status(400).json({ 
        success: false, 
        message: 'El parámetro \"tema\" es requerido en la URL.' 
      });
    }

    const data = findTemarioData(tema);

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        message: `No se encontró información para el tema: '${tema}'` 
      });
    }

    res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener solo los prerrequisitos de un tema específico.
 * @route   GET /api/temarios/:tema/prerrequisitos
 * @access  Público
 */
const getPrerrequisitosByTema = async (req, res, next) => {
  try {
    const data = findTemarioData(req.params.tema);

    if (!data || !data.prerrequisitos) {
      return res.status(404).json({ 
        success: false, 
        message: `No se encontraron prerrequisitos para el tema: '${req.params.tema}'`
      });
    }

    res.status(200).json({ 
      success: true, 
      data: data.prerrequisitos 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener solo las sugerencias de un tema específico.
 * @route   GET /api/temarios/:tema/sugerencias
 * @access  Público
 */
const getSugerenciasByTema = async (req, res, next) => {
  try {
    const data = findTemarioData(req.params.tema);

    if (!data || !data.sugerencias) {
      return res.status(404).json({ 
        success: false, 
        message: `No se encontraron sugerencias para el tema: '${req.params.tema}'`
      });
    }

    res.status(200).json({ 
      success: true, 
      data: data.sugerencias 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Obtener solo los bloques adicionales de un tema específico.
 * @route   GET /api/temarios/:tema/bloques
 * @access  Público
 */
const getBloquesAdicionalesByTema = async (req, res, next) => {
  try {
    const data = findTemarioData(req.params.tema);

    if (!data || !data.bloquesAdicionales) {
      return res.status(404).json({ 
        success: false, 
        message: `No se encontraron bloques adicionales para el tema: '${req.params.tema}'`
      });
    }

    res.status(200).json({ 
      success: true, 
      data: data.bloquesAdicionales 
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  getAllTemas,
  getTemarioByTema,
  getPrerrequisitosByTema,
  getSugerenciasByTema,
  getBloquesAdicionalesByTema
};