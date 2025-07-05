const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  createEstudioDeMercado,
  getEstudiosByProject,
  getEstudioById,
  updateEstudioDeMercado,
  deleteEstudioDeMercado,
  getResumenEstudio,
  updateSeccionEstudio,
  getEstadisticasUsuario,
  generateResumenEjecutivoWithGemini
} = require('../controllers/estudioDeMercadoController');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Validation rules
const createEstudioValidation = [
  body('projectId')
    .notEmpty()
    .isMongoId()
    .withMessage('ID de proyecto válido es requerido'),
  body('resumenEjecutivo.overview')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('La visión general no puede exceder 2000 caracteres'),
  body('resumenEjecutivo.marketSize')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('El tamaño de mercado no puede exceder 500 caracteres'),
  body('resumenEjecutivo.marketGap')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La brecha de mercado no puede exceder 1000 caracteres'),
  body('resumenEjecutivo.opportunity')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La oportunidad no puede exceder 1000 caracteres'),
  body('resumenEjecutivo.keyPoints')
    .optional()
    .isArray()
    .withMessage('Los puntos clave deben ser un array'),
  body('definicionMercado.problemStatement')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La declaración del problema no puede exceder 1000 caracteres'),
  body('definicionMercado.targetAudience')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La audiencia objetivo no puede exceder 500 caracteres'),
  body('definicionMercado.geography')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La geografía no puede exceder 200 caracteres'),
  body('definicionMercado.sector')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('El sector no puede exceder 200 caracteres')
];

const updateEstudioValidation = [
  body('resumenEjecutivo.overview')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('La visión general no puede exceder 2000 caracteres'),
  body('resumenEjecutivo.marketSize')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('El tamaño de mercado no puede exceder 500 caracteres'),
  body('resumenEjecutivo.marketGap')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La brecha de mercado no puede exceder 1000 caracteres'),
  body('resumenEjecutivo.opportunity')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La oportunidad no puede exceder 1000 caracteres'),
  body('resumenEjecutivo.keyPoints')
    .optional()
    .isArray()
    .withMessage('Los puntos clave deben ser un array'),
  body('definicionMercado.problemStatement')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('La declaración del problema no puede exceder 1000 caracteres'),
  body('definicionMercado.targetAudience')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La audiencia objetivo no puede exceder 500 caracteres'),
  body('definicionMercado.geography')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La geografía no puede exceder 200 caracteres'),
  body('definicionMercado.sector')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('El sector no puede exceder 200 caracteres')
];

const mongoIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('ID de estudio de mercado inválido'),
  param('projectId')
    .optional()
    .isMongoId()
    .withMessage('ID de proyecto inválido')
];

const seccionValidation = [
  param('seccion')
    .isIn([
      'resumenEjecutivo', 'definicionMercado', 'segmentacion', 'tamanoMercado',
      'tendencias', 'competencia', 'pricing', 'canalesDistribucion',
      'regulacionBarreras', 'analisisPESTLE', 'porterSWOT', 'proyeccionDemanda'
    ])
    .withMessage('Sección inválida')
];

// Routes

// POST /api/estudios-mercado - Crear nuevo estudio de mercado
router.post('/', createEstudioValidation, createEstudioDeMercado);

// GET /api/estudios-mercado/stats/usuario - Obtener estadísticas del usuario
router.get('/stats/usuario', getEstadisticasUsuario);

// GET /api/estudios-mercado/proyecto/:projectId - Obtener estudios por proyecto
router.get('/proyecto/:projectId', 
  param('projectId').isMongoId().withMessage('ID de proyecto inválido'),
  getEstudiosByProject
);

// GET /api/estudios-mercado/:id - Obtener estudio específico
router.get('/:id', mongoIdValidation, getEstudioById);

// PUT /api/estudios-mercado/:id - Actualizar estudio completo
router.put('/:id', 
  mongoIdValidation.concat(updateEstudioValidation), 
  updateEstudioDeMercado
);

// DELETE /api/estudios-mercado/:id - Eliminar estudio
router.delete('/:id', mongoIdValidation, deleteEstudioDeMercado);

// GET /api/estudios-mercado/:id/resumen - Obtener resumen del estudio
router.get('/:id/resumen', mongoIdValidation, getResumenEstudio);

// PATCH /api/estudios-mercado/:id/:seccion - Actualizar sección específica
router.patch('/:id/:seccion', 
  mongoIdValidation.concat(seccionValidation),
  updateSeccionEstudio
);

// POST /api/estudios-mercado/proyecto/:projectId/generate-resumen-ejecutivo - Generar resumen ejecutivo con Gemini
router.post('/proyecto/:projectId/generate-resumen-ejecutivo', 
  param('projectId').isMongoId().withMessage('ID de proyecto inválido'),
  generateResumenEjecutivoWithGemini
);

module.exports = router;