/*
 * ==================================================================
 * | CONTROLLER - GESTIÓN DE INTEGRACIONES                        |
 * ==================================================================
 * 
 * Responsabilidades:
 * - Orquestar la lógica de negocio para las integraciones externas.
 * - Validar los datos de entrada de las solicitudes (requests).
 * - Invocar los servicios o modelos correspondientes para acceder a los datos.
 * - Manejar errores de forma centralizada y responder con códigos HTTP apropiados.
 * - Formatear las respuestas (responses) que se envían al cliente.
 */

// En una aplicación real, estas funciones estarían en un archivo separado 
// (ej: /services/integracionService.js) y se conectarían a una base de datos.
// Para este ejercicio, simulamos el servicio aquí mismo.
const IntegracionService = require('../services/integracionService');

/**
 * @description Obtiene la lista completa de integraciones disponibles.
 * @route GET /api/integraciones
 * @access Privado
 */
const getIntegraciones = async (req, res, next) => {
  try {
    // Llama al servicio para obtener todas las integraciones
    const integraciones = await IntegracionService.findAll();
    
    res.status(200).json({
      exito: true,
      cantidad: integraciones.length,
      datos: integraciones,
    });
  } catch (error) {
    // Pasa el error al middleware de manejo de errores de Express
    console.error('Error al obtener integraciones:', error);
    next(error);
  }
};

/**
 * @description Obtiene una integración específica por su ID.
 * @route GET /api/integraciones/:id
 * @access Privado
 */
const getIntegracionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const integracion = await IntegracionService.findById(id);

    // Validación: Si no se encuentra la integración, devolver 404
    if (!integracion) {
      const error = new Error('Integración no encontrada');
      error.statusCode = 404;
      return next(error);
    }

    res.status(200).json({
      exito: true,
      datos: integracion,
    });
  } catch (error) {
    console.error(`Error al obtener la integración ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * @description Activa o conecta una integración.
 * @route POST /api/integraciones/:id/conectar
 * @access Privado
 */
const conectarIntegracion = async (req, res, next) => {
  try {
    const { id } = req.params;
    // En un caso real, el body podría traer tokens de OAuth, etc.
    const { configuracionInicial } = req.body;

    const integracion = await IntegracionService.findById(id);

    if (!integracion) {
      const error = new Error('Integración no encontrada');
      error.statusCode = 404;
      return next(error);
    }

    if (integracion.estado === 'conectado') {
        const error = new Error('La integración ya se encuentra conectada');
        error.statusCode = 409; // 409 Conflict
        return next(error);
    }

    // Lógica de conexión (simulada)
    const datosActualizados = {
      estado: 'conectado',
      ultimaConexion: new Date().toISOString(),
      // La configuración podría venir del body o ser una por defecto
      configuracion: configuracionInicial || integracion.configuracion || {},
      permisos: ['leer', 'escribir'], // Permisos simulados al conectar
    };

    const integracionActualizada = await IntegracionService.update(id, datosActualizados);

    res.status(200).json({
      exito: true,
      mensaje: `Integración '${integracion.nombre}' conectada exitosamente.`,
      datos: integracionActualizada,
    });
  } catch (error) {
    console.error(`Error al conectar la integración ${req.params.id}:`, error);
    next(error);
  }
};

/**
 * @description Desconecta una integración activa.
 * @route POST /api/integraciones/:id/desconectar
 * @access Privado
 */
const desconectarIntegracion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const integracion = await IntegracionService.findById(id);

        if (!integracion) {
            const error = new Error('Integración no encontrada');
            error.statusCode = 404;
            return next(error);
        }

        if (integracion.estado === 'desconectado') {
            const error = new Error('La integración ya se encuentra desconectada');
            error.statusCode = 400; // Bad Request
            return next(error);
        }

        // Lógica de desconexión
        const datosActualizados = {
            estado: 'desconectado',
            ultimaConexion: null,
            configuracion: null,
            permisos: [],
        };

        const integracionActualizada = await IntegracionService.update(id, datosActualizados);

        res.status(200).json({
            exito: true,
            mensaje: `Integración '${integracion.nombre}' desconectada.`,
            datos: integracionActualizada,
        });
    } catch (error) {
        console.error(`Error al desconectar la integración ${req.params.id}:`, error);
        next(error);
    }
};

/**
 * @description Prueba la conexión de una integración activa.
 * @route POST /api/integraciones/:id/probar
 * @access Privado
 */
const probarConexion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const integracion = await IntegracionService.findById(id);

        if (!integracion) {
            const error = new Error('Integración no encontrada');
            error.statusCode = 404;
            return next(error);
        }

        if (integracion.estado !== 'conectado') {
            const error = new Error('Solo se pueden probar integraciones conectadas');
            error.statusCode = 400; // Bad Request
            return next(error);
        }

        // Simulación de una llamada de prueba a la API externa
        await new Promise(resolve => setTimeout(resolve, 500));

        res.status(200).json({
            exito: true,
            mensaje: `La conexión con '${integracion.nombre}' funciona correctamente.`,
        });

    } catch (error) {
        console.error(`Error al probar la integración ${req.params.id}:`, error);
        next(error);
    }
};

/**
 * @description Sincroniza datos con una integración activa.
 * @route POST /api/integraciones/:id/sincronizar
 * @access Privado
 */
const sincronizarDatos = async (req, res, next) => {
    try {
        const { id } = req.params;
        const integracion = await IntegracionService.findById(id);

        if (!integracion) {
            const error = new Error('Integración no encontrada');
            error.statusCode = 404;
            return next(error);
        }

        if (integracion.estado !== 'conectado') {
            const error = new Error('La integración debe estar conectada para sincronizar.');
            error.statusCode = 400;
            return next(error);
        }

        // Validación de permisos
        if (!integracion.acciones.includes('sincronizar')) {
            const error = new Error('Esta integración no soporta la acción de sincronizar.');
            error.statusCode = 403; // Forbidden
            return next(error);
        }

        // Simulación de un proceso de sincronización que toma tiempo
        console.log(`[SYNC] Iniciando sincronización con ${integracion.nombre}...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log(`[SYNC] Sincronización con ${integracion.nombre} completada.`);
        
        // Actualizamos la fecha de última conexión/sincronización
        const datosActualizados = { ultimaConexion: new Date().toISOString() };
        await IntegracionService.update(id, datosActualizados);

        res.status(200).json({
            exito: true,
            mensaje: `Datos sincronizados con '${integracion.nombre}' exitosamente.`,
            ultimaSincronizacion: datosActualizados.ultimaConexion,
        });

    } catch (error) {
        console.error(`Error al sincronizar con la integración ${req.params.id}:`, error);
        next(error);
    }
}

module.exports = {
  getIntegraciones,
  getIntegracionById,
  conectarIntegracion,
  desconectarIntegracion,
  probarConexion,
  sincronizarDatos,
};