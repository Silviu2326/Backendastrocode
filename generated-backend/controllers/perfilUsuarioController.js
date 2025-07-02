/**
 * @fileoverview Controlador para manejar las operaciones relacionadas con el perfil del usuario.
 * @module controllers/perfilUsuarioController
 */

// En una aplicación real, se importaría un servicio que encapsula la lógica de negocio
// y la interacción con la base de datos. Este servicio contendría las funciones como
// `getPerfilUsuario` del archivo original.
// const PerfilUsuarioService = require('../services/perfilUsuarioService');

/**
 * Obtiene el perfil completo de un usuario por su ID.
 * Esta función se basa en la lógica de `getPerfilUsuario`.
 * Sigue el patrón RESTful para GET /api/perfil/:id.
 * 
 * @async
 * @function getPerfilCompleto
 * @param {object} req - Objeto de solicitud de Express. Se espera `req.params.id`.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const getPerfilCompleto = async (req, res, next) => {
  try {
    // Extraer el ID del usuario de los parámetros de la ruta.
    // En un escenario real con autenticación (JWT), podría ser `req.user.id` para el perfil propio (`/api/perfil/me`).
    const { id } = req.params;

    // --- Validación de Datos Básica ---
    // Aquí se podrían usar librerías más robustas como express-validator o Joi.
    if (!id) {
      // Respuesta HTTP 400 (Bad Request) si falta el ID.
      return res.status(400).json({
        success: false,
        message: 'El ID del usuario es requerido en los parámetros de la ruta.',
      });
    }

    // --- Lógica de Negocio (simulada) ---
    // Se simula la llamada a un servicio que obtiene los datos.
    // const perfilUsuario = await PerfilUsuarioService.getPerfilById(id);
    // Para este ejemplo, usamos directamente la lógica mock del archivo original.
    const perfilUsuario = await mockGetPerfilUsuario(id); 

    // Si el servicio no encuentra al usuario, devolver un error 404 (Not Found).
    if (!perfilUsuario) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un perfil para el usuario con ID: ${id}`,
      });
    }

    // --- Respuesta HTTP Apropiada ---
    // Si se encuentra el perfil, responder con un código 200 (OK) y los datos.
    res.status(200).json({
      success: true,
      data: perfilUsuario,
    });
  } catch (error) {
    // --- Manejo de Errores Completo ---
    // Si ocurre cualquier error en el bloque try, se pasa al siguiente middleware
    // de manejo de errores para una gestión centralizada y consistente.
    console.error('Error en getPerfilCompleto:', error);
    next(error); // Pasa el error al manejador de errores global de Express.
  }
};

/**
 * Actualiza la información del perfil de un usuario.
 * Sigue el patrón RESTful para PUT /api/perfil/:id.
 * 
 * @async
 * @function updatePerfil
 * @param {object} req - Objeto de solicitud de Express. `req.params.id` y `req.body` con los datos a actualizar.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función middleware para el manejo de errores.
 * @returns {Promise<void>}
 */
const updatePerfil = async (req, res, next) => {
  try {
    const { id } = req.params;
    const datosActualizar = req.body;

    // --- Validación de Datos ---
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'El ID del usuario es requerido en los parámetros de la ruta.',
      });
    }

    // Validar que el cuerpo de la solicitud no esté vacío.
    if (Object.keys(datosActualizar).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se proporcionaron datos para actualizar en el cuerpo de la solicitud.',
      });
    }
    // Se podrían añadir más validaciones (ej. formato de email, longitud de biografía, etc.)

    // --- Lógica de Negocio (simulada) ---
    // const perfilActualizado = await PerfilUsuarioService.updatePerfil(id, datosActualizar);
    const perfilActualizado = await mockUpdatePerfil(id, datosActualizar);

    if (!perfilActualizado) {
      return res.status(404).json({
        success: false,
        message: `No se encontró un perfil para el usuario con ID: ${id} para actualizar.`,
      });
    }

    // --- Respuesta HTTP Apropiada ---
    // Responder con 200 (OK) y los datos del perfil actualizado.
    res.status(200).json({
      success: true,
      message: 'Perfil actualizado exitosamente.',
      data: perfilActualizado,
    });
  } catch (error) {
    // --- Manejo de Errores Completo ---
    console.error('Error en updatePerfil:', error);
    next(error);
  }
};


// --- Funciones de Simulación (reemplazarían al servicio en un caso real) ---

const mockData = {
  nombre: 'Ana García',
  email: 'ana.garcia@email.com',
  plan: 'Premium',
  fotoPerfil: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2',
  biografia: 'Desarrolladora web con interés en aprender nuevas tecnologías y mejorar mis habilidades.',
  fechaRegistro: 'Miembro desde Junio 2024',
  // ... resto de los datos del archivo original
};

const mockGetPerfilUsuario = (userId) => {
  console.log(`Buscando perfil para el usuario: ${userId}`);
  // Simula que solo el usuario '123' existe
  if (userId !== '123') return Promise.resolve(null);
  return Promise.resolve(mockData);
}

const mockUpdatePerfil = (userId, updates) => {
  console.log(`Actualizando perfil para el usuario: ${userId}`);
  if (userId !== '123') return Promise.resolve(null);
  // Simula la actualización en memoria
  const updatedData = { ...mockData, ...updates };
  return Promise.resolve(updatedData);
}


// Se exportan los controladores para ser usados en el archivo de rutas (ej. `perfilRoutes.js`)
module.exports = {
  getPerfilCompleto,
  updatePerfil,
};