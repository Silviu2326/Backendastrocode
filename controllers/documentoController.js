const { validationResult } = require('express-validator');
const Documento = require('../models/Documento');
const Project = require('../models/Project');

// @desc    Get all documents for a specific project
// @route   GET /api/projects/:projectId/documentos
// @access  Private
const getDocumentosByProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verificar que el proyecto existe y pertenece al usuario
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para verlo'
      });
    }

    const documentos = await Documento.find({ 
      projectId: projectId,
      estado: { $ne: 'eliminado' }
    })
    .populate('creadoPor', 'name email')
    .sort({ createdAt: -1 });

    res.json({
      documentos: documentos.map(doc => ({
        id: doc._id,
        nombre: doc.nombre,
        tipo: doc.tipo,
        descripcion: doc.descripcion,
        tamaño: doc.tamaño,
        tamañoFormateado: doc.tamañoFormateado,
        mimeType: doc.mimeType,
        estado: doc.estado,
        version: doc.version,
        creadoPor: doc.creadoPor,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error al obtener documentos:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener documentos'
    });
  }
};

// @desc    Get single document by ID
// @route   GET /api/documentos/:id
// @access  Private
const getDocumento = async (req, res) => {
  try {
    const documento = await Documento.findById(req.params.id)
      .populate('projectId', 'name userId')
      .populate('creadoPor', 'name email');

    if (!documento) {
      return res.status(404).json({
        error: 'Documento no encontrado',
        message: 'El documento no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto del documento
    if (documento.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para ver este documento'
      });
    }

    res.json({
      documento: {
        id: documento._id,
        nombre: documento.nombre,
        tipo: documento.tipo,
        contenido: documento.contenido,
        descripcion: documento.descripcion,
        tamaño: documento.tamaño,
        tamañoFormateado: documento.tamañoFormateado,
        mimeType: documento.mimeType,
        estado: documento.estado,
        version: documento.version,
        projectId: documento.projectId._id,
        projectName: documento.projectId.name,
        creadoPor: documento.creadoPor,
        createdAt: documento.createdAt,
        updatedAt: documento.updatedAt
      }
    });
  } catch (error) {
    console.error('Error al obtener documento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener documento'
    });
  }
};

// @desc    Create new document
// @route   POST /api/projects/:projectId/documentos
// @access  Private
const createDocumento = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { projectId } = req.params;
    const { nombre, tipo, contenido, descripcion, mimeType } = req.body;

    // Verificar que el proyecto existe y pertenece al usuario
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // Crear el documento
    const documento = new Documento({
      nombre,
      tipo,
      contenido,
      descripcion,
      mimeType,
      projectId,
      creadoPor: req.user.userId
    });

    const savedDocumento = await documento.save();
    await savedDocumento.populate('creadoPor', 'name email');

    res.status(201).json({
      message: 'Documento creado exitosamente',
      documento: {
        id: savedDocumento._id,
        nombre: savedDocumento.nombre,
        tipo: savedDocumento.tipo,
        descripcion: savedDocumento.descripcion,
        tamaño: savedDocumento.tamaño,
        tamañoFormateado: savedDocumento.tamañoFormateado,
        mimeType: savedDocumento.mimeType,
        estado: savedDocumento.estado,
        version: savedDocumento.version,
        projectId: savedDocumento.projectId,
        creadoPor: savedDocumento.creadoPor,
        createdAt: savedDocumento.createdAt,
        updatedAt: savedDocumento.updatedAt
      }
    });
  } catch (error) {
    console.error('Error al crear documento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al crear documento'
    });
  }
};

// @desc    Update document
// @route   PUT /api/documentos/:id
// @access  Private
const updateDocumento = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { nombre, tipo, contenido, descripcion, mimeType, estado } = req.body;

    const documento = await Documento.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!documento) {
      return res.status(404).json({
        error: 'Documento no encontrado',
        message: 'El documento no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto del documento
    if (documento.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para modificar este documento'
      });
    }

    // Actualizar campos
    if (nombre !== undefined) documento.nombre = nombre;
    if (tipo !== undefined) documento.tipo = tipo;
    if (contenido !== undefined) {
      documento.contenido = contenido;
      // Incrementar versión si se modifica el contenido
      documento.version += 1;
    }
    if (descripcion !== undefined) documento.descripcion = descripcion;
    if (mimeType !== undefined) documento.mimeType = mimeType;
    if (estado !== undefined) documento.estado = estado;

    const updatedDocumento = await documento.save();
    await updatedDocumento.populate('creadoPor', 'name email');

    res.json({
      message: 'Documento actualizado exitosamente',
      documento: {
        id: updatedDocumento._id,
        nombre: updatedDocumento.nombre,
        tipo: updatedDocumento.tipo,
        descripcion: updatedDocumento.descripcion,
        tamaño: updatedDocumento.tamaño,
        tamañoFormateado: updatedDocumento.tamañoFormateado,
        mimeType: updatedDocumento.mimeType,
        estado: updatedDocumento.estado,
        version: updatedDocumento.version,
        projectId: updatedDocumento.projectId,
        creadoPor: updatedDocumento.creadoPor,
        createdAt: updatedDocumento.createdAt,
        updatedAt: updatedDocumento.updatedAt
      }
    });
  } catch (error) {
    console.error('Error al actualizar documento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar documento'
    });
  }
};

// @desc    Delete document (soft delete)
// @route   DELETE /api/documentos/:id
// @access  Private
const deleteDocumento = async (req, res) => {
  try {
    const documento = await Documento.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!documento) {
      return res.status(404).json({
        error: 'Documento no encontrado',
        message: 'El documento no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto del documento
    if (documento.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para eliminar este documento'
      });
    }

    // Soft delete - cambiar estado a eliminado
    documento.estado = 'eliminado';
    await documento.save();

    res.json({
      message: 'Documento eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar documento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al eliminar documento'
    });
  }
};

// @desc    Archive document
// @route   PUT /api/documentos/:id/archive
// @access  Private
const archiveDocumento = async (req, res) => {
  try {
    const documento = await Documento.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!documento) {
      return res.status(404).json({
        error: 'Documento no encontrado',
        message: 'El documento no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto del documento
    if (documento.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para archivar este documento'
      });
    }

    documento.estado = 'archivado';
    await documento.save();

    res.json({
      message: 'Documento archivado exitosamente',
      documento: {
        id: documento._id,
        estado: documento.estado,
        updatedAt: documento.updatedAt
      }
    });
  } catch (error) {
    console.error('Error al archivar documento:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al archivar documento'
    });
  }
};

// @desc    Get documents by type
// @route   GET /api/projects/:projectId/documentos/tipo/:tipo
// @access  Private
const getDocumentosByTipo = async (req, res) => {
  try {
    const { projectId, tipo } = req.params;

    // Verificar que el proyecto existe y pertenece al usuario
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para verlo'
      });
    }

    // Validar tipo
    if (!['documento', 'csv'].includes(tipo)) {
      return res.status(400).json({
        error: 'Tipo inválido',
        message: 'El tipo debe ser "documento" o "csv"'
      });
    }

    const documentos = await Documento.find({ 
      projectId: projectId,
      tipo: tipo,
      estado: { $ne: 'eliminado' }
    })
    .populate('creadoPor', 'name email')
    .sort({ createdAt: -1 });

    res.json({
      tipo,
      count: documentos.length,
      documentos: documentos.map(doc => ({
        id: doc._id,
        nombre: doc.nombre,
        descripcion: doc.descripcion,
        tamaño: doc.tamaño,
        tamañoFormateado: doc.tamañoFormateado,
        mimeType: doc.mimeType,
        estado: doc.estado,
        version: doc.version,
        creadoPor: doc.creadoPor,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error al obtener documentos por tipo:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener documentos por tipo'
    });
  }
};

// @desc    Get document statistics for a project
// @route   GET /api/projects/:projectId/documentos/stats
// @access  Private
const getDocumentosStats = async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verificar que el proyecto existe y pertenece al usuario
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para verlo'
      });
    }

    const stats = await Documento.aggregate([
      {
        $match: {
          projectId: project._id,
          estado: { $ne: 'eliminado' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          documentos: {
            $sum: {
              $cond: [{ $eq: ['$tipo', 'documento'] }, 1, 0]
            }
          },
          csvs: {
            $sum: {
              $cond: [{ $eq: ['$tipo', 'csv'] }, 1, 0]
            }
          },
          activos: {
            $sum: {
              $cond: [{ $eq: ['$estado', 'activo'] }, 1, 0]
            }
          },
          archivados: {
            $sum: {
              $cond: [{ $eq: ['$estado', 'archivado'] }, 1, 0]
            }
          },
          tamañoTotal: { $sum: '$tamaño' }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      documentos: 0,
      csvs: 0,
      activos: 0,
      archivados: 0,
      tamañoTotal: 0
    };

    res.json({
      projectId,
      stats: {
        total: result.total,
        porTipo: {
          documentos: result.documentos,
          csvs: result.csvs
        },
        porEstado: {
          activos: result.activos,
          archivados: result.archivados
        },
        tamañoTotal: result.tamañoTotal,
        tamañoTotalFormateado: formatBytes(result.tamañoTotal)
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de documentos:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener estadísticas de documentos'
    });
  }
};

// Helper function to format bytes
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

module.exports = {
  getDocumentosByProject,
  getDocumento,
  createDocumento,
  updateDocumento,
  deleteDocumento,
  archiveDocumento,
  getDocumentosByTipo,
  getDocumentosStats
};