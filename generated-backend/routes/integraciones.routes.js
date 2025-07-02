const { Router } = require('express');
const { check, param } = require('express-validator');

// --- Importaciones (Asumidas) ---
// Se asume la existencia de controladores que contienen la lógica de negocio.
const {
  getIntegraciones,
  getIntegracionById,
  actualizarConfiguracionIntegracion,
  probarConexionIntegracion,
  sincronizarIntegracion
} = require('../controllers/integraciones.controller'); // La ruta al controlador es un ejemplo

// Se asume la existencia de middlewares personalizados.
const { validarCampos } = require('../middlewares/validar-campos'); // Middleware que revisa los resultados de express-validator
const { validarIdIntegracion } = require('../middlewares/validar-integracion'); // Middleware que verifica si la integración existe
// const { validarJWT } = require('../middlewares/validar-jwt'); // Middleware de autenticación (ejemplo)

// Inicialización del router de Express
const router = Router();

// --- Definición de Rutas para /api/integraciones ---

/**
 * @route   GET /api/integraciones
 * @desc    Obtener todas las integraciones disponibles, su estado y permisos.
 * @access  Privado (requiere autenticación, ej. validarJWT)
 * @returns {JSON} Retorna un arreglo de objetos de integración.
 * @errors  Manejados por el controlador y el middleware de errores central.
 */
router.get('/', [/* validarJWT */], getIntegraciones);

/**
 * @route   GET /api/integraciones/:id
 * @desc    Obtener los detalles de una integración específica por su ID.
 * @access  Privado
 * @returns {JSON} Retorna el objeto de la integración solicitada.
 * @http    200 - OK, 404 - Not Found.
 */
router.get('/:id',
  [
    // validarJWT, // Middleware de autenticación
    param('id', 'El ID de la integración es inválido.').isString().notEmpty(),
    validarCampos, // Revisa las validaciones anteriores
    validarIdIntegracion // Verifica que el ID exista en la base de datos o mock
  ],
  getIntegracionById
);

/**
 * @route   PUT /api/integraciones/:id
 * @desc    Actualiza la configuración y/o el estado de una integración (conectar/desconectar).
 * @access  Privado
 * @body    { estado?: 'conectado'|'desconectado', configuracion?: object }
 * @returns {JSON} Retorna el objeto de la integración actualizada.
 * @http    200 - OK, 400 - Bad Request, 404 - Not Found.
 */
router.put('/:id',
  [
    // validarJWT,
    param('id', 'El ID de la integración es inválido.').isString().notEmpty(),
    check('estado', 'El estado debe ser "conectado" o "desconectado".').optional().isIn(['conectado', 'desconectado']),
    check('configuracion', 'La configuración debe ser un objeto o null.').optional({ nullable: true }).isObject(),
    validarCampos,
    validarIdIntegracion
  ],
  actualizarConfiguracionIntegracion
);

/**
 * @route   POST /api/integraciones/:id/probar
 * @desc    Ejecuta una prueba de conexión para una integración específica.
 *          Esta es una ruta de ACCIÓN, por eso se usa POST.
 * @access  Privado
 * @returns {JSON} Retorna un mensaje de éxito o fracaso de la prueba.
 * @http    200 - OK, 400 - Bad Request, 404 - Not Found, 503 - Service Unavailable (si la prueba falla).
 */
router.post('/:id/probar',
  [
    // validarJWT,
    param('id', 'El ID de la integración es inválido.').isString().notEmpty(),
    validarCampos,
    validarIdIntegracion
  ],
  probarConexionIntegracion
);

/**
 * @route   POST /api/integraciones/:id/sincronizar
 * @desc    Inicia un proceso de sincronización de datos para una integración.
 *          Esta es una ruta de ACCIÓN.
 * @access  Privado
 * @returns {JSON} Retorna un mensaje indicando el inicio de la sincronización.
 * @http    202 - Accepted (la acción se ha iniciado), 404 - Not Found, 409 - Conflict (si ya está sincronizando).
 */
router.post('/:id/sincronizar',
  [
    // validarJWT,
    param('id', 'El ID de la integración es inválido.').isString().notEmpty(),
    validarCampos,
    validarIdIntegracion
  ],
  sincronizarIntegracion
);

/*
 * --- Manejo de Errores Async/Await ---
 * Cada controlador asíncrono debe envolver su lógica en un bloque try/catch.
 * En el bloque catch, se debe llamar a `next(error)` para pasar el control
 * al middleware de manejo de errores centralizado de Express (definido en app.js),
 * el cual se encargará de formatear y enviar una respuesta de error 500.
 * Ejemplo de un controlador:
 * 
 * export const miControlador = async (req, res, next) => {
 *   try {
 *     const data = await servicioAsincrono();
 *     res.status(200).json({ exito: true, data });
 *   } catch (error) {
 *     next(error); // Delegar al manejador de errores central.
 *   }
 * };
 */

module.exports = router;
