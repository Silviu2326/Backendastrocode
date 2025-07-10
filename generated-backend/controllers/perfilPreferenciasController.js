const perfilApiService = require('../services/perfilPreferencias.service');

/**
 * @description Obtiene el perfil completo de un usuario.
 * @route GET /api/perfil/:userId
 * @access Private
 * @param {object} req - Objeto de solicitud de Express. El `userId` se extrae de `req.params`.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con los datos del perfil del usuario.
 * @returns {object} 404 - Si el perfil del usuario no es encontrado.
 * @returns {object} 500 - Si ocurre un error interno en el servidor.
 */
const getUserProfile = async (req, res) => {
  try {
    // En una aplicación real, el userId podría venir del token de autenticación (req.user.id)
    // o de los parámetros de la ruta para perfiles públicos.
    const { userId } = req.params;

    // Llama al servicio/API para obtener los datos del perfil
    const userProfile = await perfilApiService.fetchUserProfile(userId);

    if (!userProfile) {
      return res.status(404).json({ message: 'Perfil de usuario no encontrado.' });
    }

    // Envía la respuesta con el perfil encontrado
    res.status(200).json(userProfile);

  } catch (error) {
    console.error('Error en getUserProfile:', error);
    res.status(500).json({ message: 'Error interno del servidor al obtener el perfil.' });
  }
};

/**
 * @description Actualiza los datos principales del perfil de un usuario.
 * @route PUT /api/perfil/:userId
 * @access Private
 * @param {object} req - Objeto de solicitud de Express. Los datos a actualizar están en `req.body`.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con mensaje de éxito y el perfil actualizado.
 * @returns {object} 400 - Si los datos enviados en el body son inválidos o están vacíos.
 * @returns {object} 500 - Si ocurre un error interno en el servidor.
 */
const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const profileData = req.body;

    // Validación básica de los datos de entrada
    if (!profileData || Object.keys(profileData).length === 0) {
      return res.status(400).json({ message: 'Los datos del perfil no pueden estar vacíos.' });
    }

    // Llama al servicio para actualizar el perfil
    const result = await perfilApiService.updateUserProfile(profileData);

    res.status(200).json(result);

  } catch (error) {
    console.error('Error en updateUserProfile:', error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar el perfil.' });
  }
};

/**
 * @description Actualiza los intereses de un usuario.
 * @route PUT /api/perfil/:userId/intereses
 * @access Private
 * @param {object} req - Objeto de solicitud de Express. Se espera { intereses: [...] } en `req.body`.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con mensaje de éxito y los intereses actualizados.
 * @returns {object} 400 - Si el formato de los intereses no es un array.
 * @returns {object} 500 - Si ocurre un error interno en el servidor.
 */
const updateUserInterests = async (req, res) => {
  try {
    const { userId } = req.params;
    const { intereses } = req.body; // Se espera un objeto como { intereses: [...] }

    // Validación: los intereses deben ser un array.
    if (!intereses || !Array.isArray(intereses)) {
      return res.status(400).json({ message: 'El campo "intereses" es requerido y debe ser un array.' });
    }

    const result = await perfilApiService.updateUserInterests(intereses);

    res.status(200).json(result);

  } catch (error) {
    console.error('Error en updateUserInterests:', error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar los intereses.' });
  }
};

/**
 * @description Actualiza las preferencias de aprendizaje de un usuario.
 * @route PUT /api/perfil/:userId/preferencias-aprendizaje
 * @access Private
 * @param {object} req - Objeto de solicitud de Express. Las preferencias están en `req.body`.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con mensaje de éxito y preferencias actualizadas.
 * @returns {object} 400 - Si los datos enviados están vacíos.
 * @returns {object} 500 - Si ocurre un error interno en el servidor.
 */
const updateLearningPreferences = async (req, res) => {
  try {
    const { userId } = req.params;
    const preferencesData = req.body;

    if (!preferencesData || Object.keys(preferencesData).length === 0) {
      return res.status(400).json({ message: 'Los datos de preferencias no pueden estar vacíos.' });
    }

    const result = await perfilApiService.updateLearningPreferences(preferencesData);

    res.status(200).json(result);

  } catch (error) {
    console.error('Error en updateLearningPreferences:', error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar las preferencias.' });
  }
};

/**
 * @description Obtiene la configuración de personalización de un usuario.
 * @route GET /api/perfil/:userId/personalizacion
 * @access Private
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con los datos de personalización.
 * @returns {object} 500 - Si ocurre un error (la API simulada puede fallar).
 */
const getPersonalizationConfig = async (req, res) => {
  try {
    const { userId } = req.params;
    const config = await perfilApiService.getConfiguracionPersonalizacion(userId);

    res.status(200).json(config);

  } catch (error) {
    // El catch aquí es importante porque la promesa de la API puede ser rechazada.
    console.error('Error en getPersonalizationConfig:', error.message);
    res.status(500).json({ message: error.message || 'Error al obtener la configuración de personalización.' });
  }
};

/**
 * @description (Función Inferida) Actualiza la configuración de personalización de un usuario.
 * @route PUT /api/perfil/:userId/personalizacion
 * @access Private
 * @param {object} req - Objeto de solicitud de Express. La configuración está en `req.body`.
 * @param {object} res - Objeto de respuesta de Express.
 * @returns {object} 200 - JSON con mensaje de éxito.
 * @returns {object} 400 - Si los datos enviados están vacíos.
 * @returns {object} 500 - Si ocurre un error interno en el servidor.
 */
const updatePersonalizationConfig = async (req, res) => {
    try {
        const { userId } = req.params;
        const configData = req.body;

        if (!configData || Object.keys(configData).length === 0) {
            return res.status(400).json({ message: 'Los datos de configuración no pueden estar vacíos.' });
        }

        // Se asume la existencia de un servicio 'updateConfiguracionPersonalizacion' para completar el endpoint.
        const result = await perfilApiService.updateConfiguracionPersonalizacion(configData);

        res.status(200).json(result);

    } catch (error) {
        console.error('Error en updatePersonalizationConfig:', error);
        res.status(500).json({ message: 'Error al actualizar la configuración de personalización.' });
    }
};


module.exports = {
  getUserProfile,
  updateUserProfile,
  updateUserInterests,
  updateLearningPreferences,
  getPersonalizationConfig,
  updatePersonalizationConfig
};