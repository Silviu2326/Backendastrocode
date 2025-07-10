const Configuracion = require('../models/configuracionModel'); // Se asume un modelo de Mongoose

/**
 * @desc    Obtiene la configuración global del usuario autenticado.
 * @route   GET /api/configuracion
 * @access  Privado (requiere autenticación)
 * @summary Reemplaza la lógica de 'getConfiguracionGlobal' del archivo original.
 *          Busca la configuración en la base de datos asociada al usuario.
 *          Si no existe, crea una configuración por defecto para ese usuario.
 */
const getConfiguracion = async (req, res) => {
  try {
    // El ID del usuario se obtiene del middleware de autenticación (ej: req.user.id)
    // que se ejecuta antes que este controlador.
    const userId = req.user.id;

    let configuracion = await Configuracion.findOne({ userId });

    // Si no existe configuración para el usuario, se crea una por defecto.
    // El modelo de Mongoose debe tener definidos los valores por defecto.
    if (!configuracion) {
      configuracion = await Configuracion.create({ userId });
      return res.status(201).json({
        exito: true,
        origen: 'default_created',
        configuracion,
      });
    }

    // Si la configuración ya existía, se devuelve con un estado 200 OK.
    res.status(200).json({
      exito: true,
      origen: 'database',
      configuracion,
    });

  } catch (error) {
    console.error('Error al obtener la configuración:', error);
    res.status(500).json({
      error: true,
      mensaje: 'Error del servidor al obtener la configuración global.',
      codigo: 'GET_CONFIG_ERROR',
      detalles: error.message,
    });
  }
};

/**
 * @desc    Actualiza la configuración global del usuario autenticado.
 * @route   PATCH /api/configuracion
 * @access  Privado (requiere autenticación)
 * @summary Reemplaza la lógica de 'guardarConfiguracionGlobal'.
 *          Valida los datos de entrada y actualiza el documento en la BD.
 *          El uso de PATCH es ideal para actualizaciones parciales.
 */
const updateConfiguracion = async (req, res) => {
  const data = req.body;

  // 1. Validación de Datos de Entrada
  if (!data || Object.keys(data).length === 0) {
    return res.status(400).json({
      error: true,
      mensaje: 'No se proporcionaron datos para actualizar.',
      codigo: 'INVALID_DATA',
    });
  }

  // Validaciones específicas replicadas del código original.
  const erroresValidacion = [];
  if (data.idioma && !['es', 'en', 'pt', 'fr'].includes(data.idioma)) {
    erroresValidacion.push('Idioma no válido. Valores permitidos: es, en, pt, fr.');
  }
  if (data.profundidad && !['basica', 'media', 'avanzada', 'experta'].includes(data.profundidad)) {
    erroresValidacion.push('Profundidad no válida. Valores permitidos: basica, media, avanzada, experta.');
  }
  if (data.ttsVelocidad && (data.ttsVelocidad < 0.5 || data.ttsVelocidad > 2.0)) {
    erroresValidacion.push('Velocidad TTS fuera de rango (debe ser entre 0.5 y 2.0).');
  }

  if (erroresValidacion.length > 0) {
    return res.status(400).json({
      error: true,
      mensaje: 'Errores de validación en los datos proporcionados.',
      codigo: 'VALIDATION_ERROR',
      errores: erroresValidacion,
    });
  }

  try {
    // 2. Lógica de Negocio: Actualización en la Base de Datos
    const userId = req.user.id;

    // Preparamos los datos a actualizar, incluyendo la fecha para mantener un registro.
    const updateData = {
      ...data,
      fechaActualizacion: new Date(),
    };

    // Usamos findOneAndUpdate para buscar por userId y actualizar.
    // 'upsert: true' crea el documento si no existe (robusto).
    // 'new: true' devuelve el documento ya modificado.
    // 'runValidators: true' ejecuta las validaciones definidas en el Schema de Mongoose.
    const configuracionActualizada = await Configuracion.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    // 3. Respuesta HTTP Exitosa
    res.status(200).json({
      exito: true,
      mensaje: 'Configuración guardada exitosamente.',
      configuracion: configuracionActualizada,
    });

  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    // Manejo de errores de validación de Mongoose, si se usan en el modelo.
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: true,
        mensaje: 'Error de validación en la base de datos.',
        codigo: 'DB_VALIDATION_ERROR',
        detalles: error.message
      });
    }

    res.status(500).json({
      error: true,
      mensaje: 'Error del servidor al guardar la configuración.',
      codigo: 'SAVE_CONFIG_ERROR',
      detalles: error.message,
    });
  }
};

module.exports = {
  getConfiguracion,
  updateConfiguracion,
};
