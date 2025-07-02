const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  updateGithubUrl,
  deleteProject,
  addPage,
  updatePage,
  addUserStory,
  syncProject,
  generatePageDescription,
  generateUserStoriesForPage,
  generateBackendFromAPI,
  getPaginasIa,
  actualizarPagina,
  generatePagesWithGemini,
  generateAdditionalPagesWithGemini,
  addMultiplePages,
  generarProyectoConIA,  // Nueva función agregada
  generarpromptinicial,   // Agregar esta nueva función
  saveUserStoriesToPage,   // Añadir esta función
  generateestudiodemercadowithgemini  // Nueva función para estudio de mercado
} = require('../controllers/projectController');

// Importar la función del backend generator
const { generateBackendFromAPI: generateAdvancedBackend } = require('../backendGenerator');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Validation rules
const projectValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La descripción debe tener entre 10 y 500 caracteres'),
  body('status')
    .optional()
    .isIn(['planning', 'in-progress', 'completed', 'on-hold'])
    .withMessage('El estado debe ser: planning, in-progress, completed, o on-hold'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('El color debe ser un código hexadecimal válido'),
  body('techStack')
    .optional()
    .isArray()
    .withMessage('El stack tecnológico debe ser un array'),
  body('githubUrl')
    .optional()
    .isURL()
    .withMessage('La URL de GitHub debe ser una URL válida'),
  body('colorTheme')
    .optional()
    .isArray()
    .withMessage('El tema de colores debe ser un array'),
  body('colorTheme.*')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Cada color del tema debe ser un código hexadecimal válido')
];

const projectUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La descripción debe tener entre 10 y 500 caracteres'),
  body('status')
    .optional()
    .isIn(['planning', 'in-progress', 'completed', 'on-hold'])
    .withMessage('El estado debe ser: planning, in-progress, completed, o on-hold'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('El color debe ser un código hexadecimal válido'),
  body('techStack')
    .optional()
    .isArray()
    .withMessage('El stack tecnológico debe ser un array'),
  body('githubUrl')
    .optional()
    .isURL()
    .withMessage('La URL de GitHub debe ser una URL válida'),
  body('colorTheme')
    .optional()
    .isArray()
    .withMessage('El tema de colores debe ser un array'),
  body('colorTheme.*')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Cada color del tema debe ser un código hexadecimal válido')
];

const pageValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  body('route')
    .trim()
    .notEmpty()
    .withMessage('La ruta es requerida')
];

const pageUpdateValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  body('route')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('La ruta no puede estar vacía si se proporciona')
];

const userStoryValidation = [
  body('title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('La descripción debe tener entre 10 y 1000 caracteres'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('La prioridad debe ser: low, medium, o high'),
  body('estimatedHours')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Las horas estimadas deben ser un número entero entre 1 y 1000')
];

const githubUrlValidation = [
  body('githubUrl')
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage('La URL de GitHub debe ser una URL válida')
    .custom((value) => {
      if (value && !value.includes('github.com')) {
        throw new Error('La URL debe ser de GitHub');
      }
      return true;
    })
];

// Routes

// GET /api/projects - Obtener todos los proyectos del usuario
router.get('/', getProjects);

// GET /api/projects/:id - Obtener un proyecto específico
router.get('/:id', getProject);

// POST /api/projects - Crear nuevo proyecto
router.post('/', projectValidation, createProject);

// PUT /api/projects/:id - Actualizar proyecto
router.put('/:id', projectUpdateValidation, updateProject);

// PUT /api/projects/:id/github - Actualizar URL de GitHub del proyecto
router.put('/:id/github', githubUrlValidation, updateGithubUrl);

// DELETE /api/projects/:id - Eliminar proyecto
router.delete('/:id', deleteProject);

// POST /api/projects/:id/pages - Agregar página a proyecto
router.post('/:id/pages', pageValidation, addPage);

// POST /api/projects/:id/multiple-pages - Agregar múltiples páginas a proyecto
router.post('/:id/multiple-pages', addMultiplePages);

// PUT /api/projects/:projectId/pages/:pageId - Actualizar página específica
router.put('/:projectId/pages/:pageId', pageUpdateValidation, updatePage);

// POST /api/projects/:projectId/pages/:pageId/generate-user-stories - Generar historias de usuario para página con IA
router.post('/:projectId/pages/:pageId/generate-user-stories', generateUserStoriesForPage);

// POST /api/projects/:projectId/pages/:pageId/user-stories - Agregar historia de usuario a página
router.post('/:projectId/pages/:pageId/user-stories', userStoryValidation, addUserStory);

// POST /api/projects/:id/sync - Sincronizar proyecto con repositorio GitHub
router.post('/:id/sync', syncProject);

// POST /api/projects/:projectId/pages/:pageId/generate-description - Generar descripción de página con IA
router.post('/:projectId/pages/:pageId/generate-description', generatePageDescription);

// POST /api/projects/:id/paginasIa - Generar sugerencias de páginas con IA
router.post('/:id/paginasIa', getPaginasIa);
router.post('/:projectId/actualizarPagina', actualizarPagina);

// POST /api/projects/:id/generate-pages - Generar páginas con Gemini 2.5 Pro
router.post('/:id/generate-pages', generatePagesWithGemini);

// POST /api/projects/:id/generate-additional-pages - Generar páginas adicionales con Gemini basándose en páginas existentes
router.post('/:id/generate-additional-pages', generateAdditionalPagesWithGemini);

// POST /api/projects/generar-proyecto-ia - Generar ideas de proyectos de software con IA
router.post('/generar-proyecto-ia', [
  body('nicho')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nicho debe tener entre 2 y 100 caracteres'),
  body('tipo')
    .trim()
    .isIn(['microsaas', 'macrosaas', 'saas'])
    .withMessage('El tipo debe ser: microsaas, macrosaas o saas')
], generarProyectoConIA);

// Validación para el backend generator avanzado
const backendGeneratorValidation = [
  body('outputPath')
    .optional()
    .isString()
    .withMessage('La ruta de salida debe ser una cadena válida'),
  body('includeDatabase')
    .optional()
    .isBoolean()
    .withMessage('includeDatabase debe ser un valor booleano'),
  body('framework')
    .optional()
    .isIn(['express', 'fastify', 'koa'])
    .withMessage('El framework debe ser: express, fastify, o koa'),
  body('features')
    .optional()
    .isObject()
    .withMessage('Las características deben ser un objeto'),
  body('features.authentication')
    .optional()
    .isBoolean()
    .withMessage('authentication debe ser un valor booleano'),
  body('features.validation')
    .optional()
    .isBoolean()
    .withMessage('validation debe ser un valor booleano'),
  body('features.swagger')
    .optional()
    .isBoolean()
    .withMessage('swagger debe ser un valor booleano'),
  body('features.testing')
    .optional()
    .isBoolean()
    .withMessage('testing debe ser un valor booleano'),
  body('features.docker')
    .optional()
    .isBoolean()
    .withMessage('docker debe ser un valor booleano')
];

// POST /api/projects/:id/generate-backend - Generar backend completo desde archivos API del repositorio
router.post('/:id/generate-backend', generateBackendFromAPI);

// POST /api/projects/:id/generate-advanced-backend - Generar backend avanzado con opciones personalizadas
router.post('/:id/generate-advanced-backend', backendGeneratorValidation, async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.userId; // Cambiado de req.user.id a req.user.userId
    
    // Buscar el proyecto
    const Project = require('../models/Project');
    const project = await Project.findOne({ _id: projectId, userId });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    // Opciones del backend generator
    const options = {
      outputPath: req.body.outputPath || `./generated-backend-${project.name.toLowerCase().replace(/\s+/g, '-')}`,
      includeDatabase: req.body.includeDatabase !== undefined ? req.body.includeDatabase : true,
      framework: req.body.framework || 'express',
      features: {
        authentication: req.body.features?.authentication !== undefined ? req.body.features.authentication : true,
        validation: req.body.features?.validation !== undefined ? req.body.features.validation : true,
        swagger: req.body.features?.swagger !== undefined ? req.body.features.swagger : true,
        testing: req.body.features?.testing !== undefined ? req.body.features.testing : true,
        docker: req.body.features?.docker !== undefined ? req.body.features.docker : true,
        security: req.body.features?.security !== undefined ? req.body.features.security : true,
        logging: req.body.features?.logging !== undefined ? req.body.features.logging : true,
        metrics: req.body.features?.metrics !== undefined ? req.body.features.metrics : true
      }
    };

    console.log(`🚀 Iniciando generación de backend avanzado para proyecto: ${project.name}`);
    console.log('📋 Opciones:', options);

    // Generar el backend usando el generador avanzado
    const result = await generateAdvancedBackend(project, options);

    res.json({
      success: true,
      message: 'Backend avanzado generado exitosamente',
      data: result
    });

  } catch (error) {
    console.error('❌ Error generando backend avanzado:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor al generar el backend',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
  }
});

// GET /api/projects/:id/backend-generator/status - Obtener estado del generador de backend
router.get('/:id/backend-generator/status', async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.userId; // Cambiado de req.user.id a req.user.userId
    
    // Buscar el proyecto
    const Project = require('../models/Project');
    const project = await Project.findOne({ _id: projectId, userId });
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    // Verificar si el proyecto tiene URL de GitHub
    const hasGithubUrl = !!project.githubUrl;
    const hasApiKey = !!process.env.GEMINI_API_KEY;

    res.json({
      success: true,
      data: {
        projectId: project._id,
        projectName: project.name,
        githubUrl: project.githubUrl,
        canGenerate: hasGithubUrl && hasApiKey,
        requirements: {
          githubUrl: hasGithubUrl,
          geminiApiKey: hasApiKey
        },
        supportedFrameworks: ['express', 'fastify', 'koa'],
        availableFeatures: {
          authentication: 'JWT + RBAC authentication system',
          validation: 'Zod/Celebrate input validation',
          swagger: 'OpenAPI documentation generation',
          testing: 'Jest + Supertest test suite',
          docker: 'Docker containerization',
          security: 'Helmet + CORS + Rate limiting',
          logging: 'Structured logging with Pino',
          metrics: 'Prometheus metrics collection'
        }
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo estado del generador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
  }
});

// Ruta para guardar múltiples user stories de una vez
router.post('/:projectId/pages/:pageId/user-stories/save-multiple', [
  body('userStories')
    .isArray()
    .withMessage('userStories debe ser un array'),
  body('userStories.*.title')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('El título debe tener entre 5 y 200 caracteres'),
  body('userStories.*.description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('La descripción debe tener entre 10 y 1000 caracteres'),
  body('userStories.*.priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('La prioridad debe ser: low, medium, o high'),
  body('userStories.*.estimatedHours')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Las horas estimadas deben ser un número entero entre 1 y 1000')
], saveUserStoriesToPage);

// Auth configuration validation rules
const authConfigValidation = [
  body('hasLogin')
    .optional()
    .isBoolean()
    .withMessage('hasLogin debe ser un valor booleano'),
  body('authMethod')
    .optional()
    .isIn(['none', 'basic', 'jwt', 'oauth', 'session', 'custom'])
    .withMessage('authMethod debe ser: none, basic, jwt, oauth, session, o custom'),
  body('oauthProviders')
    .optional()
    .isArray()
    .withMessage('oauthProviders debe ser un array'),
  body('oauthProviders.*')
    .optional()
    .isIn(['google', 'github', 'facebook', 'twitter', 'linkedin', 'microsoft'])
    .withMessage('Proveedor OAuth no válido'),
  body('requiresEmailVerification')
    .optional()
    .isBoolean()
    .withMessage('requiresEmailVerification debe ser un valor booleano'),
  body('passwordPolicy.minLength')
    .optional()
    .isInt({ min: 6 })
    .withMessage('La longitud mínima de contraseña debe ser al menos 6'),
  body('sessionTimeout')
    .optional()
    .isInt({ min: 300 })
    .withMessage('El timeout de sesión debe ser al menos 300 segundos'),
  body('userTypes')
    .optional()
    .isArray()
    .withMessage('userTypes debe ser un array'),
  body('userTypes.*.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El nombre del tipo de usuario debe tener entre 1 y 50 caracteres')
];

// Get project auth configuration
router.get('/:id/auth-config', async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).select('authConfig');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    res.json({
      success: true,
      authConfig: project.authConfig || {
        hasLogin: false,
        authMethod: 'none',
        oauthProviders: [],
        requiresEmailVerification: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: false,
          requireLowercase: false,
          requireNumbers: false,
          requireSpecialChars: false
        },
        sessionTimeout: 3600,
        multiFactorAuth: {
          enabled: false,
          methods: []
        },
        userTypes: []
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo configuración de autenticación:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Update project auth configuration
router.put('/:id/auth-config', authConfigValidation, async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    console.log(`🔄 [BACKEND-${requestId}] Iniciando actualización de configuración de autenticación`);
    console.log(`🆔 [BACKEND-${requestId}] Project ID:`, req.params.id);
    console.log(`👤 [BACKEND-${requestId}] User ID:`, req.user.id);
    console.log(`📋 [BACKEND-${requestId}] Headers:`, {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer ***' : 'No auth header',
      'user-agent': req.headers['user-agent']
    });
    console.log(`📋 [BACKEND-${requestId}] Datos recibidos (raw):`, JSON.stringify(req.body, null, 2));
    
    // Validación de entrada
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(`❌ [BACKEND-${requestId}] Errores de validación:`, errors.array());
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }
    
    // Validación adicional de datos
    if (req.body.hasLogin && (!req.body.authMethod || req.body.authMethod === 'none')) {
      console.error(`❌ [BACKEND-${requestId}] Método de autenticación requerido cuando hasLogin es true`);
      return res.status(400).json({
        success: false,
        message: 'Método de autenticación es requerido cuando se habilita el login'
      });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      console.error(`❌ [BACKEND-${requestId}] Proyecto no encontrado para ID: ${req.params.id} y User: ${req.user.id}`);
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }
    
    console.log(`📂 [BACKEND-${requestId}] Proyecto encontrado:`, {
      id: project._id,
      name: project.name,
      userId: project.userId
    });
    console.log(`🔧 [BACKEND-${requestId}] AuthConfig actual:`, JSON.stringify(project.authConfig, null, 2));

    // Preparar configuración por defecto
    const defaultAuthConfig = {
      hasLogin: false,
      authMethod: 'none',
      oauthProviders: [],
      requiresEmailVerification: false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumbers: false,
        requireSpecialChars: false
      },
      sessionTimeout: 3600,
      multiFactorAuth: {
        enabled: false,
        methods: []
      },
      userTypes: []
    };
    
    // Obtener configuración actual
    const currentAuthConfig = project.authConfig ? project.authConfig.toObject() : defaultAuthConfig;
    console.log(`🔄 [BACKEND-${requestId}] Configuración actual procesada:`, JSON.stringify(currentAuthConfig, null, 2));
    
    // Procesar datos de entrada
    const incomingData = {
      hasLogin: req.body.hasLogin !== undefined ? Boolean(req.body.hasLogin) : currentAuthConfig.hasLogin,
      authMethod: req.body.authMethod || currentAuthConfig.authMethod,
      oauthProviders: req.body.oauthProviders || currentAuthConfig.oauthProviders,
      requiresEmailVerification: req.body.requiresEmailVerification !== undefined ? Boolean(req.body.requiresEmailVerification) : currentAuthConfig.requiresEmailVerification,
      sessionTimeout: req.body.sessionTimeout ? Number(req.body.sessionTimeout) : currentAuthConfig.sessionTimeout
    };
    
    console.log(`📝 [BACKEND-${requestId}] Datos procesados:`, JSON.stringify(incomingData, null, 2));
    
    // Merge nested objects properly
    const updatedAuthConfig = {
      ...currentAuthConfig,
      ...incomingData
    };
    
    // Handle nested passwordPolicy object
    if (req.body.passwordPolicy) {
      console.log(`🔐 [BACKEND-${requestId}] Actualizando passwordPolicy:`, req.body.passwordPolicy);
      updatedAuthConfig.passwordPolicy = {
        ...currentAuthConfig.passwordPolicy,
        ...req.body.passwordPolicy,
        minLength: Number(req.body.passwordPolicy.minLength) || currentAuthConfig.passwordPolicy.minLength
      };
    }
    
    // Handle nested multiFactorAuth object
    if (req.body.multiFactorAuth) {
      console.log(`🔒 [BACKEND-${requestId}] Actualizando multiFactorAuth:`, req.body.multiFactorAuth);
      updatedAuthConfig.multiFactorAuth = {
        ...currentAuthConfig.multiFactorAuth,
        ...req.body.multiFactorAuth,
        enabled: Boolean(req.body.multiFactorAuth.enabled)
      };
    }
    
    console.log(`💾 [BACKEND-${requestId}] Configuración final a guardar:`, JSON.stringify(updatedAuthConfig, null, 2));
    
    // Asignar y guardar
    project.authConfig = updatedAuthConfig;
    project.markModified('authConfig'); // Asegurar que Mongoose detecte el cambio
    
    const savedProject = await project.save();
    
    console.log(`✅ [BACKEND-${requestId}] Configuración guardada exitosamente`);
    console.log(`📤 [BACKEND-${requestId}] Configuración guardada en BD:`, JSON.stringify(savedProject.authConfig, null, 2));

    const responseData = {
      success: true,
      message: 'Configuración de autenticación actualizada correctamente',
      data: savedProject.authConfig
    };
    
    console.log(`📤 [BACKEND-${requestId}] Enviando respuesta:`, JSON.stringify(responseData, null, 2));
    
    res.json(responseData);
  } catch (error) {
    console.error(`❌ [BACKEND-${requestId}] Error actualizando configuración de autenticación:`, error);
    console.error(`❌ [BACKEND-${requestId}] Stack trace:`, error.stack);
    console.error(`❌ [BACKEND-${requestId}] Error message:`, error.message);
    console.error(`❌ [BACKEND-${requestId}] Error name:`, error.name);
    
    const errorResponse = {
      success: false,
      message: 'Error interno del servidor',
      error: error.message,
      requestId
    };
    
    console.log(`📤 [BACKEND-${requestId}] Enviando respuesta de error:`, errorResponse);
     
     res.status(500).json(errorResponse);
   }
 });

// Add user type to project
router.post('/:id/auth-config/user-types', [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El nombre del tipo de usuario es requerido y debe tener máximo 50 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descripción no puede exceder 200 caracteres'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Los permisos deben ser un array'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault debe ser un valor booleano')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    // Check if user type name already exists
    const existingUserType = project.authConfig.userTypes.find(
      userType => userType.name.toLowerCase() === req.body.name.toLowerCase()
    );

    if (existingUserType) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un tipo de usuario con ese nombre'
      });
    }

    // If this is set as default, remove default from others
    if (req.body.isDefault) {
      project.authConfig.userTypes.forEach(userType => {
        userType.isDefault = false;
      });
    }

    project.authConfig.userTypes.push(req.body);
    await project.save();

    res.status(201).json({
      success: true,
      message: 'Tipo de usuario añadido correctamente',
      data: project.authConfig.userTypes[project.authConfig.userTypes.length - 1]
    });
  } catch (error) {
    console.error('❌ Error añadiendo tipo de usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Update user type
router.put('/:id/auth-config/user-types/:userTypeId', [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El nombre del tipo de usuario debe tener máximo 50 caracteres'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descripción no puede exceder 200 caracteres'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Los permisos deben ser un array'),
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault debe ser un valor booleano')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: errors.array()
      });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    const userType = project.authConfig.userTypes.id(req.params.userTypeId);
    if (!userType) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de usuario no encontrado'
      });
    }

    // Check if name already exists (excluding current user type)
    if (req.body.name) {
      const existingUserType = project.authConfig.userTypes.find(
        ut => ut._id.toString() !== req.params.userTypeId && 
             ut.name.toLowerCase() === req.body.name.toLowerCase()
      );

      if (existingUserType) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe un tipo de usuario con ese nombre'
        });
      }
    }

    // If this is set as default, remove default from others
    if (req.body.isDefault) {
      project.authConfig.userTypes.forEach(ut => {
        if (ut._id.toString() !== req.params.userTypeId) {
          ut.isDefault = false;
        }
      });
    }

    // Update user type
    Object.assign(userType, req.body);
    await project.save();

    res.json({
      success: true,
      message: 'Tipo de usuario actualizado correctamente',
      data: userType
    });
  } catch (error) {
    console.error('❌ Error actualizando tipo de usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Delete user type
router.delete('/:id/auth-config/user-types/:userTypeId', async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Proyecto no encontrado'
      });
    }

    const userType = project.authConfig.userTypes.id(req.params.userTypeId);
    if (!userType) {
      return res.status(404).json({
        success: false,
        message: 'Tipo de usuario no encontrado'
      });
    }

    userType.deleteOne();
    await project.save();

    res.json({
      success: true,
      message: 'Tipo de usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('❌ Error eliminando tipo de usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Validation for market study generation
// Remover la validación del apiKey
// const marketStudyValidation = [
//   body('apiKey')
//     .notEmpty()
//     .withMessage('API key de Gemini es requerida')
//     .isString()
//     .withMessage('API key debe ser una cadena válida')
// ];

// POST /api/projects/:id/generate-market-study - Generar estudio de mercado completo con Gemini
router.post('/:id/generate-market-study', generateestudiodemercadowithgemini);

// GET /api/projects/:id/generar-prompt-inicial - Generar prompt inicial para bolt.new
router.get('/:id/generar-prompt-inicial', generarpromptinicial);

module.exports = router;