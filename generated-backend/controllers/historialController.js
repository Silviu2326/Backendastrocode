const historialService = require('../services/historialService');

/**
 * @description Obtiene el historial completo de acciones realizadas.
 * @route GET /api/historial
 * @access Private/Admin
 */
const getHistorial = async (req, res) => {
  try {
    // Llama al servicio para obtener todos los registros del historial
    const historial = await historialService.findAll();

    res.status(200).json(historial);
  } catch (error) {
    console.error('Error al obtener el historial de acciones:', error);
    res.status(500).json({ message: 'Error interno del servidor al obtener el historial.' });
  }
};


/**
 * NOTA: La creación de registros en el historial (`POST /historial`) 
 * normalmente no sería un endpoint público, sino una función interna 
 * que se llama desde otros controladores (ej. después de crear o eliminar un curso).
 * Por eso, solo se expone el endpoint para consultar el historial.
 */

module.exports = {
  getHistorial,
};