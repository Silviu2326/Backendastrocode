const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs-extra');
const path = require('path');
const EstudioDeMercado = require('../models/EstudioDeMercado');
const Project = require('../models/Project');

// Helper function to write Gemini responses to files
const writeGeminiResponseToFile = async (responseText, fileName, projectId) => {
  try {
    const responseDir = path.join(__dirname, '..', 'gemini-responses');
    await fs.ensureDir(responseDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fullFileName = `${projectId}_${fileName}_${timestamp}.txt`;
    const filePath = path.join(responseDir, fullFileName);
    
    await fs.writeFile(filePath, responseText, 'utf8');
    console.log(`📝 Respuesta de Gemini guardada en: ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error('❌ Error al escribir respuesta de Gemini:', error);
  }
};

// @desc    Crear nuevo estudio de mercado
// @route   POST /api/estudios-mercado
// @access  Private
const createEstudioDeMercado = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { projectId, ...estudioData } = req.body;

    // Verificar que el proyecto existe y pertenece al usuario
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para acceder a él'
      });
    }

    // Crear nuevo estudio de mercado
    const estudioDeMercado = new EstudioDeMercado({
      projectId,
      ...estudioData
    });

    const savedEstudio = await estudioDeMercado.save();

    res.status(201).json({
      message: 'Estudio de mercado creado exitosamente',
      estudioDeMercado: savedEstudio
    });
  } catch (error) {
    console.error('Error al crear estudio de mercado:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al crear estudio de mercado'
    });
  }
};

// @desc    Obtener todos los estudios de mercado de un proyecto
// @route   GET /api/estudios-mercado/proyecto/:projectId
// @access  Private
const getEstudiosByProject = async (req, res) => {
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
        message: 'El proyecto no existe o no tienes permisos para acceder a él'
      });
    }

    const estudios = await EstudioDeMercado.find({ projectId })
      .sort({ createdAt: -1 });

    res.json({
      message: 'Estudios de mercado obtenidos exitosamente',
      count: estudios.length,
      estudios
    });
  } catch (error) {
    console.error('Error al obtener estudios de mercado:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener estudios de mercado'
    });
  }
};

// @desc    Obtener estudio de mercado por ID
// @route   GET /api/estudios-mercado/:id
// @access  Private
const getEstudioById = async (req, res) => {
  try {
    const estudio = await EstudioDeMercado.findById(req.params.id)
      .populate('projectId', 'name description userId');

    if (!estudio) {
      return res.status(404).json({
        error: 'Estudio de mercado no encontrado',
        message: 'El estudio de mercado no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto
    if (estudio.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para acceder a este estudio de mercado'
      });
    }

    res.json({
      message: 'Estudio de mercado obtenido exitosamente',
      estudioDeMercado: estudio
    });
  } catch (error) {
    console.error('Error al obtener estudio de mercado:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener estudio de mercado'
    });
  }
};

// @desc    Actualizar estudio de mercado
// @route   PUT /api/estudios-mercado/:id
// @access  Private
const updateEstudioDeMercado = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const estudio = await EstudioDeMercado.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!estudio) {
      return res.status(404).json({
        error: 'Estudio de mercado no encontrado',
        message: 'El estudio de mercado no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto
    if (estudio.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para modificar este estudio de mercado'
      });
    }

    // Actualizar campos permitidos
    const allowedUpdates = [
      'resumenEjecutivo', 'definicionMercado', 'segmentacion', 'tamanoMercado',
      'tendencias', 'competencia', 'pricing', 'canalesDistribucion',
      'regulacionBarreras', 'analisisPESTLE', 'porterSWOT', 'proyeccionDemanda'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        estudio[field] = req.body[field];
      }
    });

    const updatedEstudio = await estudio.save();

    res.json({
      message: 'Estudio de mercado actualizado exitosamente',
      estudioDeMercado: updatedEstudio
    });
  } catch (error) {
    console.error('Error al actualizar estudio de mercado:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar estudio de mercado'
    });
  }
};

// @desc    Eliminar estudio de mercado
// @route   DELETE /api/estudios-mercado/:id
// @access  Private
const deleteEstudioDeMercado = async (req, res) => {
  try {
    const estudio = await EstudioDeMercado.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!estudio) {
      return res.status(404).json({
        error: 'Estudio de mercado no encontrado',
        message: 'El estudio de mercado no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto
    if (estudio.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para eliminar este estudio de mercado'
      });
    }

    await EstudioDeMercado.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Estudio de mercado eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar estudio de mercado:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al eliminar estudio de mercado'
    });
  }
};

// @desc    Obtener resumen de estudio de mercado
// @route   GET /api/estudios-mercado/:id/resumen
// @access  Private
const getResumenEstudio = async (req, res) => {
  try {
    const estudio = await EstudioDeMercado.findById(req.params.id)
      .populate('projectId', 'name userId');

    if (!estudio) {
      return res.status(404).json({
        error: 'Estudio de mercado no encontrado',
        message: 'El estudio de mercado no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto
    if (estudio.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para acceder a este estudio de mercado'
      });
    }

    const resumen = estudio.getResumen();

    res.json({
      message: 'Resumen obtenido exitosamente',
      resumen
    });
  } catch (error) {
    console.error('Error al obtener resumen:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener resumen del estudio de mercado'
    });
  }
};

// @desc    Actualizar sección específica del estudio
// @route   PATCH /api/estudios-mercado/:id/:seccion
// @access  Private
const updateSeccionEstudio = async (req, res) => {
  try {
    const { seccion } = req.params;
    const allowedSections = [
      'resumenEjecutivo', 'definicionMercado', 'segmentacion', 'tamanoMercado',
      'tendencias', 'competencia', 'pricing', 'canalesDistribucion',
      'regulacionBarreras', 'analisisPESTLE', 'porterSWOT', 'proyeccionDemanda'
    ];

    if (!allowedSections.includes(seccion)) {
      return res.status(400).json({
        error: 'Sección inválida',
        message: `La sección '${seccion}' no es válida. Secciones permitidas: ${allowedSections.join(', ')}`
      });
    }

    const estudio = await EstudioDeMercado.findById(req.params.id)
      .populate('projectId', 'userId');

    if (!estudio) {
      return res.status(404).json({
        error: 'Estudio de mercado no encontrado',
        message: 'El estudio de mercado no existe'
      });
    }

    // Verificar que el usuario tiene acceso al proyecto
    if (estudio.projectId.userId.toString() !== req.user.userId) {
      return res.status(403).json({
        error: 'Acceso denegado',
        message: 'No tienes permisos para modificar este estudio de mercado'
      });
    }

    // Actualizar la sección específica
    estudio[seccion] = {
      ...estudio[seccion],
      ...req.body,
      generatedByAI: req.body.generatedByAI !== undefined ? req.body.generatedByAI : true,
      createdAt: new Date()
    };

    const updatedEstudio = await estudio.save();

    res.json({
      message: `Seccion '${seccion}' actualizada exitosamente`,
      seccion: updatedEstudio[seccion]
    });
  } catch (error) {
    console.error('Error al actualizar sección:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar sección del estudio de mercado'
    });
  }
};

// @desc    Obtener estadísticas de estudios de mercado por usuario
// @route   GET /api/estudios-mercado/stats/usuario
// @access  Private
const getEstadisticasUsuario = async (req, res) => {
  try {
    // Obtener todos los proyectos del usuario
    const userProjects = await Project.find({
      userId: req.user.userId,
      isActive: true
    }).select('_id');

    const projectIds = userProjects.map(p => p._id);

    // Obtener estadísticas de estudios de mercado
    const totalEstudios = await EstudioDeMercado.countDocuments({
      projectId: { $in: projectIds }
    });

    const estudiosGeneradosIA = await EstudioDeMercado.countDocuments({
      projectId: { $in: projectIds },
      $or: [
        { 'resumenEjecutivo.generatedByAI': true },
        { 'definicionMercado.generatedByAI': true },
        { 'segmentacion.generatedByAI': true },
        { 'tamanoMercado.generatedByAI': true },
        { 'tendencias.generatedByAI': true },
        { 'competencia.generatedByAI': true }
      ]
    });

    const estudiosRecientes = await EstudioDeMercado.find({
      projectId: { $in: projectIds }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('projectId', 'name');

    res.json({
      message: 'Estadísticas obtenidas exitosamente',
      estadisticas: {
        totalEstudios,
        estudiosGeneradosIA,
        estudiosRecientes: estudiosRecientes.map(e => e.getResumen())
      }
    });
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener estadísticas'
    });
  }
};

// @desc    Generar resumen ejecutivo con Gemini para estudio de mercado
// @route   POST /api/estudios-mercado/proyecto/:projectId/generate-resumen-ejecutivo
// @access  Private
const generateResumenEjecutivoWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de resumen ejecutivo con Gemini para estudio de mercado');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user.userId,
      isActive: true
    });
    
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para acceder a él'
      });
    }

    // ────────────────── 2. Buscar o crear estudio de mercado ──────────────────
    let estudio = await EstudioDeMercado.findOne({ projectId: project._id });
    
    if (!estudio) {
      // Crear un nuevo estudio de mercado básico
      estudio = new EstudioDeMercado({
        projectId: project._id,
        resumenEjecutivo: {},
        definicionMercado: {},
        segmentacion: {},
        tamanoMercado: {},
        tendencias: {},
        competencia: {}
      });
      await estudio.save();
      console.log('📝 Nuevo estudio de mercado creado para el proyecto');
    }

    // ────────────────── 3. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 4. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 5. Construir prompt ─────────────────
    const prompt = `
Eres un experto consultor de estrategia empresarial. Genera un resumen ejecutivo conciso para directivos basado en el proyecto y estudio de mercado.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Información del Estudio de Mercado Existente**
- Definición de Mercado: ${estudio.definicionMercado?.problemStatement || 'No especificado'}
- Segmentación: ${estudio.segmentacion?.segments?.map(s => s.name).join(', ') || 'No especificado'}
- Tamaño de Mercado: ${estudio.tamanoMercado?.totalMarketSize || 'No especificado'}
- Competencia: ${estudio.competencia?.competitors?.length || 0} competidores identificados

**Instrucciones**
1. Crea una visión de alto nivel para directivos (máximo 800 caracteres)
2. Incluye tamaño de mercado estimado (máximo 400 caracteres)
3. Identifica la brecha que cubre el proyecto (máximo 400 caracteres)
4. Destaca la oportunidad de negocio (máximo 400 caracteres)
5. Incorpora insights del estudio de mercado existente
6. Máximo 3 puntos clave de 150 caracteres cada uno

**Formato de respuesta (JSON válido)**
{
  "executiveSummary": {
    "overview": "Visión general del proyecto y oportunidad (máximo 800 caracteres)",
    "marketSize": "Tamaño estimado del mercado (máximo 400 caracteres)",
    "marketGap": "Brecha identificada en el mercado (máximo 400 caracteres)",
    "opportunity": "Descripción de la oportunidad de negocio (máximo 400 caracteres)",
    "keyPoints": ["Punto clave 1 (máximo 150 caracteres)", "Punto clave 2 (máximo 150 caracteres)", "Punto clave 3 (máximo 150 caracteres)"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 6. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_executive_summary', project._id);

    // ────────────────── 7. Parsear respuesta ────────────────
    let generatedSummary;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedSummary = JSON.parse(jsonString);

      if (!generatedSummary.executiveSummary) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 8. Formatear y guardar resumen ejecutivo ────────────────
    const formattedSummary = {
      overview: generatedSummary.executiveSummary.overview || 'No especificado',
      marketSize: generatedSummary.executiveSummary.marketSize || 'No especificado',
      marketGap: generatedSummary.executiveSummary.marketGap || 'No especificado',
      opportunity: generatedSummary.executiveSummary.opportunity || 'No especificado',
      keyPoints: Array.isArray(generatedSummary.executiveSummary.keyPoints)
        ? generatedSummary.executiveSummary.keyPoints
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // Actualizar el estudio de mercado con el resumen ejecutivo
    estudio.resumenEjecutivo = formattedSummary;
    const updatedEstudio = await estudio.save();

    // ────────────────── 9. Responder ────────────────────────
    res.json({
      message: 'Resumen ejecutivo generado exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      estudioDeMercado: { id: estudio._id },
      resumenEjecutivo: formattedSummary,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack,
          existingMarketStudy: true
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateResumenEjecutivoWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar resumen ejecutivo con Gemini'
    });
  }
};

module.exports = {
  createEstudioDeMercado,
  getEstudiosByProject,
  getEstudioById,
  updateEstudioDeMercado,
  deleteEstudioDeMercado,
  getResumenEstudio,
  updateSeccionEstudio,
  getEstadisticasUsuario,
  generateResumenEjecutivoWithGemini
};