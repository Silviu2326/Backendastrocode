const express = require('express');
const { body, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  getDocumentosByProject,
  getDocumento,
  createDocumento,
  updateDocumento,
  deleteDocumento,
  archiveDocumento,
  getDocumentosByTipo,
  getDocumentosStats
} = require('../controllers/documentoController');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Validation rules
const documentoValidation = [
  body('nombre')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('El nombre debe tener entre 1 y 255 caracteres'),
  body('tipo')
    .isIn(['documento', 'csv'])
    .withMessage('El tipo debe ser "documento" o "csv"'),
  body('contenido')
    .notEmpty()
    .withMessage('El contenido es requerido'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  body('mimeType')
    .optional()
    .isString()
    .withMessage('El tipo MIME debe ser una cadena válida')
];

const documentoUpdateValidation = [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('El nombre debe tener entre 1 y 255 caracteres'),
  body('tipo')
    .optional()
    .isIn(['documento', 'csv'])
    .withMessage('El tipo debe ser "documento" o "csv"'),
  body('contenido')
    .optional()
    .notEmpty()
    .withMessage('El contenido no puede estar vacío si se proporciona'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  body('mimeType')
    .optional()
    .isString()
    .withMessage('El tipo MIME debe ser una cadena válida'),
  body('estado')
    .optional()
    .isIn(['activo', 'archivado', 'eliminado'])
    .withMessage('El estado debe ser "activo", "archivado" o "eliminado"')
];

const projectIdValidation = [
  param('projectId')
    .isMongoId()
    .withMessage('El ID del proyecto debe ser un ObjectId válido')
];

const documentoIdValidation = [
  param('id')
    .isMongoId()
    .withMessage('El ID del documento debe ser un ObjectId válido')
];

const tipoValidation = [
  param('tipo')
    .isIn(['documento', 'csv'])
    .withMessage('El tipo debe ser "documento" o "csv"')
];

// Routes

// GET /api/projects/:projectId/documentos - Obtener todos los documentos de un proyecto
router.get('/projects/:projectId/documentos', projectIdValidation, getDocumentosByProject);

// GET /api/documentos/:id - Obtener un documento específico
router.get('/:id', documentoIdValidation, getDocumento);

// POST /api/projects/:projectId/documentos - Crear nuevo documento
router.post('/projects/:projectId/documentos', 
  [...projectIdValidation, ...documentoValidation], 
  createDocumento
);

// PUT /api/documentos/:id - Actualizar documento
router.put('/:id', 
  [...documentoIdValidation, ...documentoUpdateValidation], 
  updateDocumento
);

// DELETE /api/documentos/:id - Eliminar documento (soft delete)
router.delete('/:id', documentoIdValidation, deleteDocumento);

// PUT /api/documentos/:id/archive - Archivar documento
router.put('/:id/archive', documentoIdValidation, archiveDocumento);

// GET /api/projects/:projectId/documentos/tipo/:tipo - Obtener documentos por tipo
router.get('/projects/:projectId/documentos/tipo/:tipo', 
  [...projectIdValidation, ...tipoValidation], 
  getDocumentosByTipo
);

// GET /api/projects/:projectId/documentos/stats - Obtener estadísticas de documentos
router.get('/projects/:projectId/documentos/stats', projectIdValidation, getDocumentosStats);

module.exports = router;