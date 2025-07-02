const { validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const Project = require('../models/Project');
const simpleGit = require('simple-git');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs-extra');
const path = require('path');

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

// Helper function to cleanup temp directory with retry logic for Windows
const cleanupTempDir = async (tempDir, maxRetries = 15, delay = 2500) => {
  for (let i = 0; i < maxRetries; i++) {
    const attempt = i + 1;
    try {
      const exists = await fs.pathExists(tempDir);
      if (!exists) {
        console.log(`[Cleanup] Directorio temporal ${tempDir} ya no existe.`);
        return;
      }
      
      console.log(`[Cleanup] Intento ${attempt}/${maxRetries}: Eliminando ${tempDir}...`);
      await fs.remove(tempDir);
      
      const stillExistsAfterRemove = await fs.pathExists(tempDir);
      if (!stillExistsAfterRemove) {
        console.log(`[Cleanup] ✅ Directorio temporal ${tempDir} eliminado correctamente en intento ${attempt}.`);
        return;
      }
      
      console.warn(`[Cleanup] ⚠️ Directorio ${tempDir} aún existe después del intento de eliminación ${attempt} (sin error explícito de fs.remove). Forzando reintento si no es el último.`);
      if (attempt === maxRetries) {
        throw new Error(`Directorio ${tempDir} aún existe después del último intento (${attempt}) de eliminación.`);
      }
      // Force a retry by throwing a generic error
      throw new Error(`Directorio ${tempDir} persistió después del intento ${attempt}, forzando reintento.`);

    } catch (error) {
      const isLastError = attempt === maxRetries;
      const filePathInfo = error.path ? ` (archivo problemático: ${error.path})` : '';
      const errorCodeInfo = error.code ? ` (código: ${error.code})` : '';

      console.error(`[Cleanup] ⚠️ Intento ${attempt}/${maxRetries} de limpieza para ${tempDir} falló${filePathInfo}${errorCodeInfo}: ${error.message}`);

      if (isLastError) {
        console.error(`[Cleanup] ❌ Falló la limpieza final del directorio temporal ${tempDir} después de ${maxRetries} intentos.`);
        throw error; 
      }
      
      console.log(`[Cleanup] Reintentando en ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// @desc    Update GitHub URL for a project
// @route   PUT /api/projects/:id/github
// @access  Private
const updateGithubUrl = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { githubUrl } = req.body;

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // Update GitHub URL
    project.githubUrl = githubUrl || '';
    const updatedProject = await project.save();

    res.json({
      message: 'URL de GitHub actualizada exitosamente',
      project: {
        id: updatedProject._id,
        name: updatedProject.name,
        githubUrl: updatedProject.githubUrl,
        updatedAt: updatedProject.updatedAt
      }
    });
  } catch (error) {
    console.error('Error al actualizar URL de GitHub:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar URL de GitHub'
    });
  }
};

// @desc    Get all projects for authenticated user
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ 
      userId: req.user.userId,
      isActive: true 
    }).sort({ createdAt: -1 });

    res.json({
      projects: projects.map(project => ({
        id: project._id,
        name: project.name,
        description: project.description,
        status: project.status,
        color: project.color,
        techStack: project.techStack,
        githubUrl: project.githubUrl,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        pages: project.pages,
        totalUserStories: project.totalUserStories,
        completedUserStories: project.completedUserStories,
        fileStructure: project.fileStructure
      }))
    });
  } catch (error) {
    console.error('Error al obtener proyectos:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener proyectos'
    });
  }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para verlo'
      });
    }

    res.json({
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        status: project.status,
        color: project.color,
        techStack: project.techStack,
        githubUrl: project.githubUrl,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        pages: project.pages,
        totalUserStories: project.totalUserStories,
        completedUserStories: project.completedUserStories,
        fileStructure: project.fileStructure
      }
    });
  } catch (error) {
    console.error('Error al obtener proyecto:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al obtener proyecto'
    });
  }
};

// @desc    Create new project
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { name, description, status, color, techStack, githubUrl, colorTheme } = req.body;

    console.log('createProject - Datos recibidos:', {
      name,
      description,
      status,
      color,
      techStack,
      githubUrl
    });

    const project = new Project({
      name,
      description,
      status: status || 'planning',
      color: color || '#3B82F6',
      techStack: techStack || [],
      githubUrl,
      userId: req.user.userId,
      pages: [],
      authConfig: {
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

    const savedProject = await project.save();

    console.log('createProject - Proyecto guardado:', savedProject);

    res.status(201).json({
      message: 'Proyecto creado exitosamente',
      project: {
        id: savedProject._id,
        name: savedProject.name,
        description: savedProject.description,
        status: savedProject.status,
        color: savedProject.color,
        techStack: savedProject.techStack,
        githubUrl: savedProject.githubUrl,
        createdAt: savedProject.createdAt,
        updatedAt: savedProject.updatedAt,
        pages: savedProject.pages
      }
    });
  } catch (error) {
    console.error('Error al crear proyecto:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al crear proyecto'
    });
  }
};


// @desc    Generate pages using Gemini 2.5 Pro based on project name and description
// @route   POST /api/projects/:id/generate-pages
// @access  Private
// @desc    Generate pages using Gemini 1.5-flash
// @route   POST /api/projects/:id/generate-pages
// @access  Private
const generatePagesWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de páginas con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
   const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en desarrollo web y UX/UI. Basándote en la siguiente información del proyecto, genera un listado de páginas web necesarias.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Identifica el tipo de aplicación.
2. Propón entre 5-10 páginas.
3. Para cada página incluye: name, description, route, isEssential, priority (1-10).

**Formato de respuesta (JSON válido)**
{
  "pages": [
    {
      "name": "Nombre de la página",
      "description": "Descripción detallada",
      "route": "/ruta",
      "isEssential": true,
      "priority": 1
    }
  ]
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result       = await client.models.generateContent({
      model   : 'gemini-2.5-pro-preview-06-05',
      contents: prompt
      });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_pages', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedPages;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedPages   = JSON.parse(jsonString);

      if (!Array.isArray(generatedPages.pages)) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear páginas ────────────────
    const formattedPages = generatedPages.pages.map((p, idx) => ({
      id          : uuidv4(),
      name        : p.name        ?? `Página ${idx + 1}`,
      description : p.description ?? '',
      route       : p.route       ?? `/${(p.name || `page-${idx+1}`).toLowerCase().replace(/\s+/g,'-')}`,
      isEssential : Boolean(p.isEssential),
      priority    : Math.min(10, Math.max(1, Number(p.priority) || 5)),
      userStories : [],
      createdAt   : new Date(),
      generatedByAI: true
    }));

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message      : 'Páginas generadas exitosamente con Gemini',
      project      : { id: project._id, name: project.name },
      generatedPages: formattedPages,
      totalPages   : formattedPages.length,
      metadata     : {
        generatedAt: new Date(),
        aiModel    : 'gemini-2.5-pro-preview-06-05',
        basedOn    : {
          projectName       : project.name,
          projectDescription: project.description,
          techStack         : project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generatePagesWithGemini:', error);
    res.status(500).json({
      error  : 'Error interno del servidor',
      message: 'Error al generar páginas con Gemini'
    });
  }
};
const generarProyectoConIA = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de proyectos con Gemini');

    // ────────────────── 1. Validar parámetros ──────────────────
    const { nicho, tipo } = req.body;
    
    if (!nicho || !tipo) {
      return res.status(400).json({
        error: 'Parámetros faltantes',
        message: 'Se requieren los campos nicho y tipo'
      });
    }

    const tiposValidos = ['microsaas', 'macrosaas', 'saas'];
    if (!tiposValidos.includes(tipo.toLowerCase())) {
      return res.status(400).json({
        error: 'Tipo inválido',
        message: 'El tipo debe ser: microsaas, macrosaas o saas'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en desarrollo de software y análisis de mercado. Basándote en el nicho "${nicho}" y el tipo de negocio "${tipo}", genera una lista de 3-5 ideas de software viables.

**Información proporcionada:**
- Nicho: ${nicho}
- Tipo de negocio: ${tipo}

**Instrucciones:**
1. Analiza el nicho y tipo de negocio
2. Propón entre 3-5 ideas de software específicas para ese nicho
3. Para cada software incluye:
   - name: Nombre del software
   - description: Descripción detallada (2-3 líneas)
   - targetClient: Cliente ideal (perfil demográfico y necesidades)
   - pages: Array de 4-6 páginas principales que necesitaría
   - financialReport: Objeto con análisis financiero básico

**Formato de respuesta (JSON válido):**
{
  "softwares": [
    {
      "name": "Nombre del Software",
      "description": "Descripción detallada del software y su propósito",
      "targetClient": "Perfil del cliente ideal, demografía y necesidades específicas",
      "pages": [
        {
          "name": "Nombre de la página",
          "description": "Descripción de la funcionalidad",
          "route": "/ruta"
        }
      ],
      "financialReport": {
        "estimatedDevelopmentCost": "$X,XXX - $X,XXX USD",
        "monthlyRevenuePotential": "$X,XXX - $X,XXX USD",
        "breakEvenTime": "X-X meses",
        "marketSize": "Tamaño estimado del mercado",
        "competitionLevel": "Bajo/Medio/Alto"
      }
    }
  ]
}

Responde **solo** con el JSON válido.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generar_proyecto', `${nicho}_${tipo}`);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedSoftwares;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedSoftwares = JSON.parse(jsonString);

      if (!Array.isArray(generatedSoftwares.softwares)) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear softwares ──────────────
    const formattedSoftwares = generatedSoftwares.softwares.map((software, idx) => ({
      id: uuidv4(),
      name: software.name ?? `Software ${idx + 1}`,
      description: software.description ?? '',
      targetClient: software.targetClient ?? 'Cliente no especificado',
      pages: Array.isArray(software.pages) ? software.pages.map((page, pageIdx) => ({
        id: uuidv4(),
        name: page.name ?? `Página ${pageIdx + 1}`,
        description: page.description ?? '',
        route: page.route ?? `/${(page.name || `page-${pageIdx+1}`).toLowerCase().replace(/\s+/g,'-')}`,
        createdAt: new Date()
      })) : [],
      financialReport: {
        estimatedDevelopmentCost: software.financialReport?.estimatedDevelopmentCost ?? 'No estimado',
        monthlyRevenuePotential: software.financialReport?.monthlyRevenuePotential ?? 'No estimado',
        breakEvenTime: software.financialReport?.breakEvenTime ?? 'No estimado',
        marketSize: software.financialReport?.marketSize ?? 'No estimado',
        competitionLevel: software.financialReport?.competitionLevel ?? 'No estimado'
      },
      createdAt: new Date(),
      generatedByAI: true
    }));

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Proyectos de software generados exitosamente con Gemini',
      nicho,
      tipo,
      generatedSoftwares: formattedSoftwares,
      totalSoftwares: formattedSoftwares.length,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          nicho,
          tipo
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generarProyectoConIA:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar proyectos con Gemini'
    });
  }
};

// @desc    Generate additional pages with Gemini based on existing pages
// @route   POST /api/projects/:id/generate-additional-pages
// @access  Private
const generateAdditionalPagesWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de páginas adicionales con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar páginas existentes ──────────────────
    const { existingPages } = req.body;
    if (!existingPages || !Array.isArray(existingPages)) {
      return res.status(400).json({
        error: 'Páginas existentes requeridas',
        message: 'Debes proporcionar un array de páginas existentes en el body'
      });
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

    // ────────────────── 5. Construir prompt con páginas existentes ─────────────────
    const existingPagesInfo = existingPages.map(page => 
      `- ${page.name} (${page.route}): ${page.description}`
    ).join('\n');

    const prompt = `
Eres un experto en desarrollo web y UX/UI. Basándote en la siguiente información del proyecto y las páginas ya existentes, genera páginas adicionales que complementen y mejoren la aplicación.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Páginas Existentes**
${existingPagesInfo}

**Instrucciones**
1. Analiza las páginas existentes para entender la estructura de la aplicación.
2. Identifica qué páginas adicionales serían útiles o necesarias.
3. Propón entre 3-8 páginas adicionales que NO DUPLIQUEN las existentes.
4. Para cada página incluye: name, description, route, isEssential, priority (1-10).
5. Asegúrate de que las rutas sean únicas y no conflicten con las existentes.

**Formato de respuesta (JSON válido)**
{
  "pages": [
    {
      "name": "Nombre de la página",
      "description": "Descripción detallada",
      "route": "/ruta",
      "isEssential": true,
      "priority": 1
    }
  ]
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 6. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_additional_pages', project._id);

    // ────────────────── 7. Parsear respuesta ────────────────
    let generatedPages;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedPages = JSON.parse(jsonString);

      if (!Array.isArray(generatedPages.pages)) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 8. Validar rutas únicas ────────────────
    const existingRoutes = existingPages.map(page => page.route);
    const filteredPages = generatedPages.pages.filter(page => {
      const route = page.route || `/${(page.name || 'page').toLowerCase().replace(/\s+/g,'-')}`;
      return !existingRoutes.includes(route);
    });

    // ────────────────── 9. Formatear páginas ────────────────
    const formattedPages = filteredPages.map((p, idx) => ({
      id: uuidv4(),
      name: p.name ?? `Página Adicional ${idx + 1}`,
      description: p.description ?? '',
      route: p.route ?? `/${(p.name || `additional-page-${idx+1}`).toLowerCase().replace(/\s+/g,'-')}`,
      isEssential: Boolean(p.isEssential),
      priority: Math.min(10, Math.max(1, Number(p.priority) || 5)),
      userStories: [],
      createdAt: new Date(),
      generatedByAI: true
    }));

    // ────────────────── 10. Responder ────────────────────────
    res.json({
      message: 'Páginas adicionales generadas exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      existingPagesCount: existingPages.length,
      generatedPages: formattedPages,
      totalNewPages: formattedPages.length,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack,
          existingPages: existingPages.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateAdditionalPagesWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar páginas adicionales con Gemini'
    });
  }
};


// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    console.log('🔍 [BACKEND] updateProject - Datos recibidos:', {
      params: req.params,
      body: req.body,
      userId: req.user?.userId
    });

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ [BACKEND] Errores de validación:', errors.array());
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { name, description, status, color, techStack, githubUrl, colorTheme } = req.body;
    console.log('✅ [BACKEND] Validación pasada, campos extraídos:', {
      name, description, status, color, techStack, githubUrl, colorTheme
    });

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // Update fields
    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (status !== undefined) project.status = status;
    if (color !== undefined) project.color = color;
    if (techStack !== undefined) project.techStack = techStack;
    if (githubUrl !== undefined) project.githubUrl = githubUrl;
    if (colorTheme !== undefined) project.colorTheme = colorTheme;

    const updatedProject = await project.save();

    res.json({
      message: 'Proyecto actualizado exitosamente',
      project: {
        id: updatedProject._id,
        name: updatedProject.name,
        description: updatedProject.description,
        status: updatedProject.status,
        color: updatedProject.color,
        colorTheme: updatedProject.colorTheme,
        techStack: updatedProject.techStack,
        githubUrl: updatedProject.githubUrl,
        createdAt: updatedProject.createdAt,
        updatedAt: updatedProject.updatedAt,
        pages: updatedProject.pages
      }
    });
  } catch (error) {
    console.error('Error al actualizar proyecto:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar proyecto'
    });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para eliminarlo'
      });
    }

    // Soft delete
    project.isActive = false;
    await project.save();

    res.json({
      message: 'Proyecto eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error al eliminar proyecto:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al eliminar proyecto'
    });
  }
};

// @desc    Add page to project
// @route   POST /api/projects/:id/pages
// @access  Private
const addPage = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { name, description, route } = req.body;

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    const newPage = {
      id: Date.now().toString(),
      name,
      description: description || '',
      route,
      userStories: []
    };

    project.pages.push(newPage);
    await project.save();

    res.status(201).json({
      message: 'Página agregada exitosamente',
      page: newPage
    });
  } catch (error) {
    console.error('Error al agregar página:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al agregar página'
    });
  }
};

// @desc    Add user story to page
// @route   POST /api/projects/:projectId/pages/:pageId/user-stories
// @access  Private
const addUserStory = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { title, description, priority, estimatedHours } = req.body;
    const { projectId, pageId } = req.params;

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

    const page = project.pages.find(p => p.id === pageId);
    if (!page) {
      return res.status(404).json({
        error: 'Página no encontrada',
        message: 'La página no existe en este proyecto'
      });
    }

    const newUserStory = {
      id: uuidv4(),
      title,
      description,
      priority: priority || 'medium',
      status: 'pending',
      estimatedHours: estimatedHours || 0
    };

    page.userStories.push(newUserStory);
    await project.save();

    res.status(201).json({
      message: 'Historia de usuario agregada exitosamente',
      userStory: newUserStory
    });
  } catch (error) {
    console.error('Error al agregar historia de usuario:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al agregar historia de usuario'
    });
  }
};

// @desc    Sincronizar proyecto con repositorio GitHub
// @route   POST /api/projects/:id/sync
// @access  Private
const syncProject = async (req, res) => {
  try {
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    console.log(`\n🚀 Iniciando sincronización del proyecto: ${project.name}`);
    console.log(`👤 Usuario: ${req.user.userId}`);
    console.log(`🆔 ID del proyecto: ${project._id}`);

    if (!project) {
      console.log('❌ Proyecto no encontrado');
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    console.log(`🔗 GitHub URL: ${project.githubUrl}`);
    if (!project.githubUrl) {
      console.log('❌ URL de GitHub no configurada');
      return res.status(400).json({
        error: 'URL de GitHub requerida',
        message: 'El proyecto debe tener una URL de GitHub configurada para sincronizar'
      });
    }

    // Verificar que la API key de Gemini esté configurada
    console.log('🔑 Verificando configuración de Gemini API...');
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ API key de Gemini no configurada');
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }
    console.log('✅ API key de Gemini configurada correctamente');

      // Eliminar todas las páginas y user stories existentes antes de la sincronización
      console.log('🗑️ Eliminando páginas y user stories existentes...');
      project.pages = [];
      await project.save(); // Guardar el proyecto después de limpiar las páginas
      console.log('✅ Páginas y user stories eliminadas.');

      // Crear directorio temporal para clonar el repositorio
    const tempDir = path.join(__dirname, '..', 'temp', `repo_${project._id}`);
    console.log(`📁 Directorio temporal: ${tempDir}`);
    
    try {
      // Limpiar directorio temporal si existe
      console.log('🧹 Preparando directorio temporal...');
      await cleanupTempDir(tempDir);
      await fs.ensureDir(tempDir);
      console.log('✅ Directorio temporal preparado');

      // Clonar repositorio
      console.log(`📥 Clonando repositorio: ${project.githubUrl}`);
      const git = simpleGit();
      await git.clone(project.githubUrl, tempDir);
      console.log('✅ Repositorio clonado exitosamente');

      // Buscar carpeta de páginas (pages o Pages)
      console.log('🔍 Buscando carpeta de páginas...');
      const pagesDir = await findPagesDirectory(tempDir);
      
      if (!pagesDir) {
        console.log('❌ Carpeta de páginas no encontrada');
        return res.status(404).json({
          error: 'Carpeta de páginas no encontrada',
          message: 'No se encontró una carpeta "pages" o "Pages" en el repositorio'
        });
      }
      console.log(`✅ Carpeta de páginas encontrada: ${pagesDir}`);

      // Obtener todas las páginas
      console.log('🔍 Buscando archivos de páginas en:', pagesDir);
      const pageFiles = await getPageFiles(pagesDir);
      console.log('📄 Páginas encontradas:', pageFiles.length);
      
      if (pageFiles.length === 0) {
        console.log('❌ No se encontraron páginas en el directorio');
        return res.status(404).json({
          error: 'No se encontraron páginas',
          message: 'No se encontraron archivos de páginas en el repositorio'
        });
      }

      // Inicializar Google Gemini
      console.log('🤖 Inicializando Google Gemini...');
      console.log('🔑 API Key presente:', !!process.env.GEMINI_API_KEY);
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      console.log('✅ Cliente Gemini inicializado correctamente');

      const syncResults = [];
      
      // Procesar cada página
      for (const pageFile of pageFiles) {
        try {
          console.log(`\n🔄 Procesando página: ${pageFile.name}`);
          console.log(`📁 Ruta del archivo: ${pageFile.path}`);
          
          // Leer contenido de la página
          console.log('📖 Leyendo contenido del archivo...');
          const pageContent = await fs.readFile(pageFile.path, 'utf8');
          console.log(`📝 Contenido leído: ${pageContent.length} caracteres`);
          
          // Obtener componentes importados
          console.log('🔍 Analizando componentes importados...');
          const importedComponents = await getImportedComponents(pageFile.path, tempDir);
          console.log(`🧩 Componentes encontrados: ${importedComponents.length}`);
          
          // Crear prompt para Gemini
          console.log('📝 Creando prompt para Gemini...');
          const prompt = createGeminiPrompt(pageFile.name, pageContent, importedComponents);
          console.log(`📋 Prompt creado: ${prompt.length} caracteres`);
          
          // Obtener user stories usando Gemini
          console.log('🤖 Enviando solicitud a Gemini...');
          const response = await client.models.generateContent({
            model: 'gemini-2.5-pro-preview-06-05',
            contents: prompt
          });
          console.log('✅ Respuesta recibida de Gemini');
          console.log('📄 Procesando respuesta...');
          
          // Escribir respuesta de Gemini en archivo
          await writeGeminiResponseToFile(response.text, `sync_${pageFile.name}`, project._id);
          
          const userStories = parseGeminiResponse(response.text);
          console.log('[DEBUG] User stories recibidas de Gemini:', JSON.stringify(userStories, null, 2)); // Log para depuración
          console.log(`📚 User stories generadas: ${userStories.length}`);
          
          syncResults.push({
            pageName: pageFile.name,
            userStories: userStories,
            componentsAnalyzed: importedComponents.length
          });
          
          // Agregar user stories al proyecto
          console.log('💾 Guardando user stories en el proyecto...');
          await addUserStoriesToProject(project, pageFile.name, userStories);
          // project.save() se llama dentro de addUserStoriesToProject, por lo que se guarda por cada página.
          console.log('✅ User stories guardadas correctamente para la página:', pageFile.name);
          
        } catch (error) {
          console.error(`❌ Error procesando página ${pageFile.name}:`, error.message);
          console.error('📋 Stack trace:', error.stack);
          syncResults.push({
            pageName: pageFile.name,
            error: error.message,
            userStories: []
          });
        }
      }

      console.log('\n🧹 Limpiando directorio temporal...');
      // Limpiar directorio temporal con reintentos para Windows
      try {
        await cleanupTempDir(tempDir);
        console.log('✅ Directorio temporal eliminado');
      } catch (cleanupError) {
        console.log('⚠️ Error limpiando directorio temporal:', cleanupError.message);
      }

      const totalUserStories = syncResults.reduce((total, result) => total + (result.userStories?.length || 0), 0);
      console.log(`\n🎉 Sincronización completada:`);
      console.log(`📄 Páginas procesadas: ${pageFiles.length}`);
      console.log(`📚 Total user stories generadas: ${totalUserStories}`);

      res.json({
        message: 'Sincronización completada exitosamente',
        project: {
          id: project._id,
          name: project.name,
          githubUrl: project.githubUrl
        },
        results: {
          pagesProcessed: pageFiles.length,
          totalUserStories: totalUserStories,
          details: syncResults
        }
      });

    } catch (error) {
      console.error('❌ Error en el bloque interno de sincronización:', error.message);
      console.error('📋 Stack trace interno:', error.stack);
      // Limpiar directorio temporal en caso de error
      try {
        await cleanupTempDir(tempDir);
      } catch (cleanupError) {
        console.error('❌ Error limpiando directorio temporal:', cleanupError.message);
      }
      throw error;
    }

  } catch (error) {
    console.error('❌ Error general en sincronización de proyecto:', error.message);
    console.error('📋 Stack trace general:', error.stack);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error durante la sincronización del proyecto',
      details: error.message
    });
  }
};

// Función auxiliar para encontrar el directorio de páginas
const findPagesDirectory = async (repoDir) => {
  const possiblePaths = [
    path.join(repoDir, 'pages'),
    path.join(repoDir, 'Pages'),
    path.join(repoDir, 'src', 'pages'),
    path.join(repoDir, 'src', 'Pages'),
    path.join(repoDir, 'app', 'pages'),
    path.join(repoDir, 'app', 'Pages')
  ];

  for (const dirPath of possiblePaths) {
    if (await fs.pathExists(dirPath)) {
      return dirPath;
    }
  }
  
  return null;
};

// Función auxiliar para obtener archivos de páginas
const getPageFiles = async (pagesDir) => {
  const files = [];
  const items = await fs.readdir(pagesDir);
  
  for (const item of items) {
    const itemPath = path.join(pagesDir, item);
    const stat = await fs.stat(itemPath);
    
    if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (['.js', '.jsx', '.ts', '.tsx', '.vue'].includes(ext)) {
        files.push({
          name: path.basename(item, ext),
          path: itemPath,
          extension: ext
        });
      }
    }
  }
  
  return files;
};

// Función auxiliar para obtener componentes importados
const getImportedComponents = async (pageFilePath, repoDir) => {
  try {
    const pageContent = await fs.readFile(pageFilePath, 'utf8');
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(pageContent)) !== null) {
      const importPath = match[1];
      
      // Solo procesar imports relativos (componentes locales)
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        const componentPath = path.resolve(path.dirname(pageFilePath), importPath);
        
        // Buscar el archivo con diferentes extensiones
        const possibleExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue'];
        for (const ext of possibleExtensions) {
          const fullPath = componentPath + ext;
          if (await fs.pathExists(fullPath)) {
            const componentContent = await fs.readFile(fullPath, 'utf8');
            imports.push({
              name: path.basename(importPath),
              path: fullPath,
              content: componentContent.substring(0, 2000) // Limitar contenido
            });
            break;
          }
        }
      }
    }
    
    return imports;
  } catch (error) {
    console.error('Error obteniendo componentes importados:', error);
    return [];
  }
};

// Función auxiliar para crear prompt de Gemini
const createGeminiPrompt = (pageName, pageContent, components) => {
  let prompt = `Analiza el siguiente código de una página React/Vue llamada "${pageName}" y extrae todas las funcionalidades desde la perspectiva del usuario final. 

Código de la página:
\`\`\`
${pageContent.substring(0, 3000)}
\`\`\`

`;
  
  if (components.length > 0) {
    prompt += `Componentes importados y utilizados:
`;
    components.forEach((comp, index) => {
      prompt += `\n${index + 1}. Componente: ${comp.name}
\`\`\`
${comp.content}
\`\`\`

`;
    });
  }
  
  prompt += `Por favor, identifica y lista todas las funcionalidades que un usuario puede realizar en esta página. Para cada funcionalidad, proporciona:

1. **Título**: Un título descriptivo de la funcionalidad
2. **Descripción**: Una descripción detallada de lo que puede hacer el usuario
3. **Criterios de Aceptación**: Lista de criterios específicos que deben cumplirse
4. **Prioridad**: Alta, Media o Baja

Formato de respuesta (JSON):
\`\`\`json
[
  {
    "title": "Título de la funcionalidad",
    "description": "Descripción detallada",
    "acceptanceCriteria": ["Criterio 1", "Criterio 2"],
    "priority": "Alta|Media|Baja"
  }
]
\`\`\`

Concentrate en las acciones que el usuario puede realizar, no en detalles técnicos de implementación.`;
  
  return prompt;
};

// Función auxiliar para parsear respuesta de Gemini
const parseGeminiResponse = (responseText) => {
  try {
    // Buscar JSON en la respuesta
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Si no hay formato JSON, intentar parsear directamente
    const cleanResponse = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanResponse);
  } catch (error) {
    console.error('Error parseando respuesta de Gemini:', error);
    // Retornar estructura básica en caso de error
    return [{
      title: 'Funcionalidad detectada',
      description: 'Se detectó funcionalidad pero no se pudo parsear correctamente',
      acceptanceCriteria: ['Revisar manualmente el análisis'],
      priority: 'Media'
    }];
  }
};

// Función auxiliar para agregar user stories al proyecto
const addUserStoriesToProject = async (project, pageName, userStoriesFromGemini) => {
  console.log(`[Sync] Agregando/actualizando user stories para la página: ${pageName}`);
  let page = project.pages.find(p => p.name === pageName);

  if (!page) {
    console.warn(`[Sync] Página "${pageName}" no encontrada en el proyecto. Creando nueva página...`);
    const generatedRoute = pageName
      .toLowerCase()
      .replace(/\s+/g, '-') // Reemplazar espacios con guiones
      .replace(/[^a-z0-9-\/]/g, ''); // Permitir solo alfanuméricos, guiones y barras

    const newPageData = {
      id: uuidv4(),
      name: pageName,
      description: `Página ${pageName} generada durante la sincronización.`,
      route: generatedRoute || pageName.toLowerCase().replace(/\s+/g, '-'), // Asegurar una ruta válida
      userStories: [] // Inicializar con array vacío
    };
    project.pages.push(newPageData);
    page = project.pages[project.pages.length - 1]; // Obtener la referencia a la página recién agregada
    console.log(`[Sync] Nueva página "${pageName}" creada con ID ${page.id} y ruta ${page.route}`);
  } else {
    console.log(`[Sync] Página "${pageName}" encontrada. ID: ${page.id}`);
  }

  // Limpiar historias de usuario existentes generadas por IA para esta página si es necesario,
  // o fusionar de forma inteligente. Por ahora, las reemplazaremos.
  // page.userStories = []; // Opción 1: Reemplazar todas
  
  console.log(`[Sync] Agregando ${userStoriesFromGemini.length} nuevas user stories a la página "${pageName}"`);

  const priorityMap = {
    'alta': 'high',
    'media': 'medium',
    'baja': 'low'
  };

  userStoriesFromGemini.forEach(storyData => {
    const mappedPriority = priorityMap[(storyData.priority || '').toLowerCase()] || 'medium';
    const newUserStory = {
      id: uuidv4(),
      title: storyData.title,
      description: storyData.description,
      priority: mappedPriority,
      status: 'completed', // Set status to completed for synced stories
      estimatedHours: storyData.estimatedHours || 0,
      // createdAt y updatedAt serán manejados por Mongoose si se definen en el schema
    };
    page.userStories.push(newUserStory);
  });
  
  console.log(`[Sync] Total user stories en página "${pageName}" después de agregar: ${page.userStories.length}`);

  try {
    await project.save(); // Guardar el proyecto para persistir las nuevas historias y/o páginas
    console.log(`[Sync] ✅ User stories para "${pageName}" guardadas/actualizadas exitosamente en el proyecto.`);
  } catch (error) {
    // Loguear el error completo, incluyendo el objeto de error si es una ValidationError
    console.error(`❌ Error agregando user stories al proyecto para la página "${pageName}":`, error.message);
    if (error.errors) {
        console.error('Detalles de validación:', JSON.stringify(error.errors, null, 2));
    }
    console.error('Stack trace del error en addUserStoriesToProject:', error.stack);
    throw error; // Re-lanzar para que syncProject lo maneje
  }
};

// @desc    Generate page description using AI
// @route   POST /api/projects/:projectId/pages/:pageId/generate-description
// @access  Private
const generatePageDescription = async (req, res) => {
  try {
    const { projectId, pageId } = req.params;
    console.log('🔍 generatePageDescription - Parámetros recibidos:', { projectId, pageId });
    console.log('👤 Usuario autenticado:', req.user?.userId);

    // Verificar que la API key de Gemini esté configurada
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ API key de Gemini no configurada');
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    console.log('🔍 Buscando proyecto con ID:', projectId);
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      console.log('❌ Proyecto no encontrado para:', { projectId, userId: req.user.userId });
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    console.log('✅ Proyecto encontrado:', project.name);
    console.log('📄 Páginas en el proyecto:', project.pages.length);
    console.log('🔍 Buscando página con ID:', pageId);
    
    // Listar todas las páginas para debug
    project.pages.forEach((p, index) => {
      console.log(`  Página ${index}: ID=${p.id}, name=${p.name}`);
    });

    const page = project.pages.find(p => p.id === pageId);
    if (!page) {
      console.log('❌ Página no encontrada con ID:', pageId);
      return res.status(404).json({
        error: 'Página no encontrada',
        message: 'La página no existe en este proyecto'
      });
    }

    console.log('✅ Página encontrada:', page.name);

    console.log(`🤖 Generando descripción para la página: ${page.name}`);
    console.log(`📚 User stories disponibles: ${page.userStories.length}`);

    // Inicializar Google Gemini
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Crear el prompt para generar la descripción
    const userStoriesText = page.userStories.map(story => 
      `- ${story.title}: ${story.description} (Prioridad: ${story.priority})`
    ).join('\n');

    const prompt = `
Actúa como un analista de producto experto. Basándote en el nombre de la página y las historias de usuario proporcionadas, genera una descripción clara y concisa de la página.

Nombre de la página: "${page.name}"
Ruta de la página: "${page.route || 'No especificada'}"

Historias de usuario asociadas:
${userStoriesText || 'No hay historias de usuario definidas aún.'}

Instrucciones:
1. Genera una descripción de 2-4 oraciones que explique claramente el propósito y funcionalidad de esta página
2. La descripción debe ser técnica pero comprensible
3. Incluye las funcionalidades principales basándote en las historias de usuario
4. Mantén un tono profesional y directo
5. Si no hay historias de usuario, basa la descripción únicamente en el nombre y ruta de la página

Responde únicamente con la descripción, sin explicaciones adicionales.`;

    console.log('📝 Enviando solicitud a Gemini para generar descripción...');
    
    try {
      const response = await client.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt
      });
      
      // Escribir respuesta de Gemini en archivo
      await writeGeminiResponseToFile(response.text, `description_${page.name}`, projectId);
      
      const generatedDescription = response.text.trim();

      console.log('✅ Descripción generada exitosamente');
      console.log(`📄 Descripción: ${generatedDescription}`);

      res.json({
        message: 'Descripción generada exitosamente',
        description: generatedDescription,
        pageInfo: {
          id: page.id,
          name: page.name,
          route: page.route,
          userStoriesCount: page.userStories.length
        }
      });

    } catch (geminiError) {
      console.error('❌ Error al generar descripción con Gemini:', geminiError);
      res.status(500).json({
        error: 'Error al generar descripción',
        message: 'No se pudo generar la descripción usando IA. Inténtalo de nuevo.'
      });
    }

  } catch (error) {
    console.error('Error al generar descripción de página:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar descripción de página'
    });
  }
};


// @desc    Update page
// @route   PUT /api/projects/:projectId/pages/:pageId
// @access  Private
const updatePage = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { name, description, route } = req.body;
    const { projectId, pageId } = req.params;

    console.log('🔍 updatePage - Parámetros recibidos:', { projectId, pageId });
    console.log('👤 Usuario autenticado:', req.user?.userId);
    console.log('📝 Datos a actualizar:', { name, description, route });

    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      console.log('❌ Proyecto no encontrado para:', { projectId, userId: req.user.userId });
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    console.log('✅ Proyecto encontrado:', project.name);
    console.log('📄 Páginas en el proyecto:', project.pages.length);
    console.log('🔍 Buscando página con ID:', pageId);
    
    const pageIndex = project.pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) {
      console.log('❌ Página no encontrada con ID:', pageId);
      return res.status(404).json({
        error: 'Página no encontrada',
        message: 'La página no existe en este proyecto'
      });
    }

    console.log('✅ Página encontrada:', project.pages[pageIndex].name);

    // Update page fields
    if (name !== undefined) project.pages[pageIndex].name = name;
    if (description !== undefined) project.pages[pageIndex].description = description;
    if (route !== undefined) project.pages[pageIndex].route = route;
    
    project.pages[pageIndex].updatedAt = new Date();

    await project.save();

    console.log('✅ Página actualizada exitosamente');

    res.json({
      message: 'Página actualizada exitosamente',
      page: project.pages[pageIndex]
    });

  } catch (error) {
    console.error('Error al actualizar página:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al actualizar página'
    });
  }
};// @desc    Generate backend structure from GitHub repository API folder
// @route   POST /api/projects/:id/generate-backend
// @access  Private
const generateBackendFromAPI = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { outputPath = './generated-backend', includeDatabase = true, framework = 'express' } = req.body;
    
    console.log('🚀 generateBackendFromAPI - Iniciando generación de backend');
    console.log('📋 Parámetros:', { projectId, outputPath, includeDatabase, framework });
    console.log('👤 Usuario:', req.user?.userId);

    // Verificar que la API key de Gemini esté configurada
    if (!process.env.GEMINI_API_KEY) {
      console.log('❌ API key de Gemini no configurada');
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      console.log('❌ Proyecto no encontrado');
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    if (!project.githubUrl) {
      console.log('❌ URL de GitHub no configurada');
      return res.status(400).json({
        error: 'URL de GitHub requerida',
        message: 'El proyecto debe tener una URL de GitHub configurada'
      });
    }

    console.log(`✅ Proyecto encontrado: ${project.name}`);
    console.log(`🔗 GitHub URL: ${project.githubUrl}`);

    // Crear directorio temporal para clonar el repositorio
    const tempDir = path.join(__dirname, '..', 'temp', `backend_gen_${project._id}_${Date.now()}`);
    console.log(`📁 Directorio temporal: ${tempDir}`);
    
    try {
      // Preparar directorio temporal
      console.log('🧹 Preparando directorio temporal...');
      await cleanupTempDir(tempDir);
      await fs.ensureDir(tempDir);
      console.log('✅ Directorio temporal preparado');

      // Clonar repositorio
      console.log(`📥 Clonando repositorio: ${project.githubUrl}`);
      const git = simpleGit();
      await git.clone(project.githubUrl, tempDir);
      console.log('✅ Repositorio clonado exitosamente');

      // Buscar carpeta API
      console.log('🔍 Buscando carpeta API...');
      const apiDir = await findAPIDirectory(tempDir);
      
      if (!apiDir) {
        console.log('❌ Carpeta API no encontrada');
        return res.status(404).json({
          error: 'Carpeta API no encontrada',
          message: 'No se encontró una carpeta "api", "API", "routes" o "endpoints" en el repositorio'
        });
      }
      console.log(`✅ Carpeta API encontrada: ${apiDir}`);

      // Analizar archivos API
      console.log('🔍 Analizando archivos API...');
      const apiFiles = await getAPIFiles(apiDir);
      console.log(`📄 Archivos API encontrados: ${apiFiles.length}`);
      
      if (apiFiles.length === 0) {
        console.log('❌ No se encontraron archivos API');
        return res.status(404).json({
          error: 'No se encontraron archivos API',
          message: 'No se encontraron archivos de API en el directorio especificado'
        });
      }

      // Inicializar Google Gemini
      console.log('🤖 Inicializando Google Gemini...');
      const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      console.log('✅ Cliente Gemini inicializado correctamente');

      const backendStructure = {
        models: [],
        controllers: [],
        routes: [],
        middleware: [], // Se mantiene por si el análisis general lo sugiere
        config: []      // Se mantiene por si el análisis general lo sugiere
      };

      // Procesar cada archivo API
      for (const apiFile of apiFiles) {
        try {
          console.log(`\n🔄 Procesando archivo API: ${apiFile.name} para generar backend completo`);
          console.log(`📁 Ruta del archivo: ${apiFile.path}`);
          
          console.log('📖 Leyendo contenido del archivo...');
          const apiContent = await fs.readFile(apiFile.path, 'utf8');
          console.log(`📝 Contenido leído: ${apiContent.length} caracteres`);

          // --- Generar Modelos ---
          console.log('📝 Creando prompt para Modelos...');
          const modelsPrompt = createTargetedBackendAnalysisPrompt(apiFile.name, apiContent, framework, includeDatabase, 'models');
          console.log(`🤖 Enviando solicitud a Gemini para Modelos...`);
          let response = await client.models.generateContent({
            model: 'gemini-2.5-pro-preview-06-05',
            contents: modelsPrompt
          });
          console.log('✅ Respuesta recibida de Gemini para Modelos');
          console.log('🤖 Respuesta cruda de Gemini (Modelos):', response.text);
          
          // Escribir respuesta de Gemini en archivo
          await writeGeminiResponseToFile(response.text, 'modelos', projectId);
          
          let analysis = parseBackendAnalysisResponse(response.text);
          console.log(`📚 Análisis de Modelos completado para: ${apiFile.name}`);
          console.log('🔍 Análisis parseado de Gemini (Modelos):', JSON.stringify(analysis, null, 2));
          if (analysis.models) backendStructure.models.push(...analysis.models);
          // Opcionalmente, si el análisis de modelos sugiere otros componentes:
          // if (analysis.middleware) backendStructure.middleware.push(...analysis.middleware);
          // if (analysis.config) backendStructure.config.push(...analysis.config);

          // --- Generar Controladores ---
          console.log('📝 Creando prompt para Controladores...');
          const controllersPrompt = createTargetedBackendAnalysisPrompt(apiFile.name, apiContent, framework, includeDatabase, 'controllers');
          console.log(`🤖 Enviando solicitud a Gemini para Controladores...`);
          response = await client.models.generateContent({
            model: 'gemini-2.5-pro-preview-06-05',
            contents: controllersPrompt
          });
          console.log('✅ Respuesta recibida de Gemini para Controladores');
          console.log('🤖 Respuesta cruda de Gemini (Controladores):', response.text);
          
          // Escribir respuesta de Gemini en archivo
          await writeGeminiResponseToFile(response.text, 'controladores', projectId);
          
          analysis = parseBackendAnalysisResponse(response.text);
          console.log(`📚 Análisis de Controladores completado para: ${apiFile.name}`);
          console.log('🔍 Análisis parseado de Gemini (Controladores):', JSON.stringify(analysis, null, 2));
          if (analysis.controllers) backendStructure.controllers.push(...analysis.controllers);
          // Opcionalmente:
          // if (analysis.middleware) backendStructure.middleware.push(...analysis.middleware);
          // if (analysis.config) backendStructure.config.push(...analysis.config);

          // --- Generar Rutas ---
          console.log('📝 Creando prompt para Rutas...');
          const routesPrompt = createTargetedBackendAnalysisPrompt(apiFile.name, apiContent, framework, includeDatabase, 'routes');
          console.log(`🤖 Enviando solicitud a Gemini para Rutas...`);
          response = await client.models.generateContent({
            model: 'gemini-2.5-pro-preview-06-05',
            contents: routesPrompt
          });
          console.log('✅ Respuesta recibida de Gemini para Rutas');
          console.log('🤖 Respuesta cruda de Gemini (Rutas):', response.text);
          
          // Escribir respuesta de Gemini en archivo
          await writeGeminiResponseToFile(response.text, 'rutas', projectId);
          
          analysis = parseBackendAnalysisResponse(response.text);
          console.log(`📚 Análisis de Rutas completado para: ${apiFile.name}`);
          console.log('🔍 Análisis parseado de Gemini (Rutas):', JSON.stringify(analysis, null, 2));
          if (analysis.routes) backendStructure.routes.push(...analysis.routes);
          // Opcionalmente:
          // if (analysis.middleware) backendStructure.middleware.push(...analysis.middleware);
          // if (analysis.config) backendStructure.config.push(...analysis.config);
          
        } catch (error) {
          console.error(`❌ Error procesando archivo API ${apiFile.name}:`, error.message);
        }
      }

      // Generar archivos del backend
      console.log('\n🏗️ Generando estructura del backend...');
      const generatedFiles = await generateBackendFiles(backendStructure, outputPath, framework, includeDatabase, client);
      
      console.log('\n🧹 Limpiando directorio temporal...');
      try {
        await cleanupTempDir(tempDir);
        console.log('✅ Directorio temporal eliminado');
      } catch (cleanupError) {
        console.log('⚠️ Error limpiando directorio temporal:', cleanupError.message);
      }

      console.log(`\n🎉 Generación de backend completada:`);
      console.log(`📄 Archivos API analizados: ${apiFiles.length}`);
      console.log(`🏗️ Archivos generados: ${generatedFiles.length}`);

      res.json({
        message: 'Backend generado exitosamente',
        project: {
          id: project._id,
          name: project.name,
          githubUrl: project.githubUrl
        },
        results: {
          apiFilesAnalyzed: apiFiles.length,
          generatedFiles: generatedFiles.length,
          outputPath: outputPath,
          framework: framework,
          includeDatabase: includeDatabase,
          structure: {
            models: backendStructure.models.length,
            controllers: backendStructure.controllers.length,
            routes: backendStructure.routes.length,
            middleware: backendStructure.middleware.length,
            config: backendStructure.config.length
          },
          files: generatedFiles
        }
      });

    } catch (error) {
      console.error('❌ Error en el proceso de generación:', error);
      
      // Limpiar directorio temporal en caso de error
      try {
        await cleanupTempDir(tempDir);
      } catch (cleanupError) {
        console.log('⚠️ Error limpiando directorio temporal después del error:', cleanupError.message);
      }
      
      throw error;
    }

  } catch (error) {
    console.error('Error al generar backend:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar backend desde API'
    });
  }
};

// @desc    Generate user stories for a specific page using AI
// @route   POST /api/projects/:projectId/pages/:pageId/generate-user-stories
// @access  Private
const generateUserStoriesForPage = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de historias de usuario con Gemini');

    // ────────────────── 1. Extraer parámetros ──────────────────
    const { projectId, pageId } = req.params;
    const { numUserStories = 5, userStoryType = '' } = req.body;
    
    console.log('🔍 generateUserStoriesForPage - Parámetros recibidos:', { projectId, pageId, numUserStories, userStoryType });
    console.log('👤 Usuario autenticado:', req.user?.userId);

    // ────────────────── 2. Cargar proyecto ──────────────────
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

    console.log('✅ Proyecto encontrado:', project.name);
    
    const page = project.pages.find(p => p.id === pageId);
    if (!page) {
      console.log('❌ Página no encontrada con ID:', pageId);
      return res.status(404).json({
        error: 'Página no encontrada',
        message: 'La página no existe en este proyecto'
      });
    }

    console.log('✅ Página encontrada:', page.name);

    // ────────────────── 3. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 4. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 5. Construir información de estructura de archivos ─────────────────
    const fileStructureInfo = project.fileStructure ? `
**Estructura de Archivos del Proyecto**
${project.fileStructure.folders && project.fileStructure.folders.length > 0 
  ? `\nCarpetas:\n${project.fileStructure.folders.map(folder => 
      `- ${folder.path || folder.name} (${folder.type})`
    ).join('\n')}`
  : ''
}
${project.fileStructure.files && project.fileStructure.files.length > 0 
  ? `\nArchivos:\n${project.fileStructure.files.map(file => 
      `- ${file.path || file.name} (${file.type})${file.description ? ': ' + file.description : ''}`
    ).join('\n')}`
  : ''
}
${project.fileStructure.generatedAt ? `\nEstructura generada: ${project.fileStructure.generatedAt}` : ''}
` : '';

    // ────────────────── 6. Construir prompt ─────────────────
    const prompt = `
Eres un experto en desarrollo web y análisis de requerimientos. Basándote en la siguiente información de la página y la estructura del proyecto, genera historias de usuario detalladas.

**Información de la Página**
- Nombre: ${page.name}
- Descripción: ${page.description || 'No especificada'}
- Ruta: ${page.route || 'No especificada'}
- Proyecto: ${project.name}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}
${fileStructureInfo}
**Parámetros de Generación**
- Número de historias solicitadas: ${numUserStories}
- Tipo específico: ${userStoryType || 'General'}

**Historias de Usuario Existentes (NO duplicar):**
${page.userStories && page.userStories.length > 0 
  ? page.userStories.map((story, index) => `${index + 1}. ${story.title}: ${story.description}`).join('\n')
  : 'Ninguna historia existente'
}

**Instrucciones**
1. Genera exactamente ${numUserStories} historias de usuario NUEVAS y DIFERENTES a las existentes.
2. Cada historia debe seguir el formato: "Como [tipo de usuario], quiero [funcionalidad] para [beneficio]".
3. Incluye criterios de aceptación específicos y realistas.
4. Asigna prioridad (Alta, Media, Baja) y estimación de horas.
5. Enfócate en funcionalidades que un usuario final puede realizar en esta página.
6. Utiliza la estructura de archivos del proyecto para sugerir archivos afectados y componentes relevantes.

**Formato de respuesta (JSON válido)**
{
  "userStories": [
    {
      "title": "Título descriptivo de la historia",
      "description": "Como [usuario], quiero [funcionalidad] para [beneficio]",
      "pageContext": "${page.name}",
      "affectedFiles": ["archivo1.jsx", "archivo2.js"],
      "componentsModules": {
        "create": [
          {
            "name": "ComponenteNuevo",
            "type": "component"
          }
        ],
        "import": [
          {
            "name": "ComponenteExistente",
            "from": "./components/ComponenteExistente"
          }
        ]
      },
      "logicData": "Descripción de la lógica y datos necesarios",
      "styling": {
        "framework": "tailwind",
        "classes": "clase1 clase2 clase3",
        "colorCoding": "Esquema de colores sugerido"
      },
      "acceptanceCriteria": ["Criterio 1", "Criterio 2", "Criterio 3"],
      "additionalSuggestions": ["Sugerencia 1", "Sugerencia 2"],
      "aiEditorTask": "Instrucción específica para el editor IA",
      "priority": "Alta|Media|Baja",
      "estimatedHours": 8
    }
  ]
}

Responde **solo** con el JSON.
    `.trim();


    // ────────────────── 6. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, `generate_stories_${page.name}`, projectId);

    // ────────────────── 7. Parsear respuesta ────────────────
    let generatedUserStories;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedUserStories = JSON.parse(jsonString);

      if (!Array.isArray(generatedUserStories.userStories)) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 8. Formatear historias ──────────────
    const priorityMap = {
      'alta': 'high',
      'media': 'medium', 
      'baja': 'low'
    };

    const formattedUserStories = generatedUserStories.userStories.map((story, idx) => ({
      id: uuidv4(),
      title: story.title ?? `Historia ${idx + 1}`,
      description: story.description ?? '',
      pageContext: story.pageContext ?? page.name,
      affectedFiles: Array.isArray(story.affectedFiles) ? story.affectedFiles : [],
      componentsModules: {
        create: Array.isArray(story.componentsModules?.create) 
          ? story.componentsModules.create.map(comp => ({
              name: comp.name || comp,
              type: comp.type || 'component'
            }))
          : [],
        import: Array.isArray(story.componentsModules?.import) 
          ? story.componentsModules.import.map(imp => ({
              name: imp.name || imp,
              from: imp.from || ''
            }))
          : []
      },
      logicData: story.logicData ?? '',
      styling: {
        framework: story.styling?.framework ?? 'tailwind',
        classes: typeof story.styling?.classes === 'string' 
          ? story.styling.classes 
          : Array.isArray(story.styling?.classes) 
            ? story.styling.classes.join(' ') 
            : '',
        colorCoding: story.styling?.colorCoding ?? ''
      },
      acceptanceCriteria: Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : [],
      additionalSuggestions: Array.isArray(story.additionalSuggestions) ? story.additionalSuggestions : [],
      aiEditorTask: story.aiEditorTask ?? '',
      priority: priorityMap[(story.priority || '').toLowerCase()] || 'medium',
      status: 'pending',
      estimatedHours: Math.min(40, Math.max(1, Number(story.estimatedHours) || 5))
    }));

    console.log('✅ User stories generadas exitosamente (sin guardar)');

    // ────────────────── 9. Responder sin guardar ───────────────────────
    res.json({
      message: 'Historias de usuario generadas exitosamente con Gemini',
      page: { id: page.id, name: page.name },
      generatedUserStories: formattedUserStories,
      totalUserStories: formattedUserStories.length,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-1.5-flash',
        basedOn: {
          pageName: page.name,
          pageDescription: page.description,
          projectName: project.name,
          numUserStories,
          userStoryType
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateUserStoriesForPage:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar historias de usuario con Gemini'
    });
  }
};

// Función auxiliar para encontrar el directorio de API
const findAPIDirectory = async (repoDir) => {
  const possiblePaths = [
    path.join(repoDir, 'api'),
    path.join(repoDir, 'API'),
    path.join(repoDir, 'apis'),
    path.join(repoDir, 'APIS'),
    path.join(repoDir, 'src', 'api'),
    path.join(repoDir, 'src', 'API'),
    path.join(repoDir, 'src', 'apis'),
    path.join(repoDir, 'src', 'APIS'),
    path.join(repoDir, 'routes'),
    path.join(repoDir, 'src', 'routes'),
    path.join(repoDir, 'endpoints'),
    path.join(repoDir, 'src', 'endpoints'),
    path.join(repoDir, 'server', 'api'),
    path.join(repoDir, 'backend', 'api'),
    path.join(repoDir, 'backend', 'routes')
  ];

  for (const dirPath of possiblePaths) {
    if (await fs.pathExists(dirPath)) {
      return dirPath;
    }
  }
  
  return null;
};

// Función auxiliar para obtener archivos de API
const getAPIFiles = async (apiDir) => {
  const files = [];
  
  const processDirectory = async (dirPath) => {
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = await fs.stat(itemPath);
      
      if (stat.isDirectory()) {
        // Recursivamente procesar subdirectorios
        await processDirectory(itemPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item).toLowerCase();
        if (['.js', '.jsx', '.ts', '.tsx', '.json', '.yaml', '.yml'].includes(ext)) {
          files.push({
            name: path.basename(item, ext),
            path: itemPath,
            extension: ext,
            relativePath: path.relative(apiDir, itemPath)
          });
        }
      }
    }
  };
  
  await processDirectory(apiDir);
  return files;
};

// Nueva o modificada función para prompts específicos
const createTargetedBackendAnalysisPrompt = (fileName, fileContent, framework, includeDatabase, targetType) => {
  let specificInstructions = '';
  let responseFormat = {};

  switch (targetType) {
    case 'models':
      specificInstructions = `Identifica las entidades de datos necesarias y genera SOLO los modelos de datos ${includeDatabase ? 'con esquemas de base de datos (MongoDB/Mongoose)' : 'simples'}.`;
      responseFormat = {
        "models": [
          {
            "name": "NombreModelo",
            "fileName": "nombreModelo.js",
            "content": "código completo del modelo",
            "description": "descripción del modelo"
          }
        ]
      };
      break;
    case 'controllers':
      specificInstructions = "Crea SOLO los controladores con toda la lógica de negocio, basándote en los posibles modelos que se podrían haber generado.";
      responseFormat = {
        "controllers": [
          {
            "name": "NombreController",
            "fileName": "nombreController.js",
            "content": "código completo del controlador",
            "description": "descripción del controlador"
          }
        ]
      };
      break;
    case 'routes':
      specificInstructions = "Define SOLO las rutas completas con middleware de validación, basándote en los posibles controladores que se podrían haber generado.";
      responseFormat = {
        "routes": [
          {
            "name": "NombreRoute",
            "fileName": "nombreRoute.js",
            "content": "código completo de las rutas",
            "description": "descripción de las rutas"
          }
        ]
      };
      break;
    default:
      // Fallback al prompt general si el tipo no es reconocido, o lanzar error
      return createBackendAnalysisPrompt(fileName, fileContent, framework, includeDatabase); 
  }

  let prompt = `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera la estructura específica para ${targetType.toUpperCase()} en ${framework} con Node.js.

Contenido del archivo:
\`\`\`
${fileContent.substring(0, 4000)}
\`\`\`

Instrucciones Específicas para ${targetType.toUpperCase()}:
1. ${specificInstructions}
2. Incluye manejo de errores completo.
3. Agrega validación de datos si aplica.
4. Implementa respuestas HTTP apropiadas si aplica.
5. Usa async/await para operaciones asíncronas.
6. Incluye comentarios explicativos en el código.
${includeDatabase && targetType === 'models' ? '- Usa Mongoose para modelos de MongoDB' : ''}
- Sigue patrones RESTful para las APIs si aplica.

Formato de respuesta (JSON):
\`\`\`json
${JSON.stringify(responseFormat, null, 2)}
\`\`\`

Asegúrate de:
- Usar las mejores prácticas de ${framework}
- Generar SOLO los componentes de tipo ${targetType.toUpperCase()}.
`;
  
  return prompt;
};

// Función auxiliar para crear prompt de análisis de backend
const createBackendAnalysisPrompt = (fileName, fileContent, framework, includeDatabase) => {
  let prompt = `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera la estructura completa de backend en ${framework} con Node.js.

Contenido del archivo:
\`\`\`
${fileContent.substring(0, 4000)}
\`\`\`

Instrucciones:
1. Analiza los endpoints, métodos HTTP, parámetros y respuestas
2. Identifica las entidades de datos necesarias
3. Genera modelos de datos ${includeDatabase ? 'con esquemas de base de datos (MongoDB/Mongoose)' : 'simples'}
4. Crea controladores con toda la lógica de negocio
5. Define rutas completas con middleware de validación
6. Incluye middleware de autenticación y validación si es necesario
7. Agrega configuración básica del servidor

Formato de respuesta (JSON):
\`\`\`json
{
  "models": [
    {
      "name": "NombreModelo",
      "fileName": "nombreModelo.js",
      "content": "código completo del modelo",
      "description": "descripción del modelo"
    }
  ],
  "controllers": [
    {
      "name": "NombreController",
      "fileName": "nombreController.js",
      "content": "código completo del controlador",
      "description": "descripción del controlador"
    }
  ],
  "routes": [
    {
      "name": "NombreRoute",
      "fileName": "nombreRoute.js",
      "content": "código completo de las rutas",
      "description": "descripción de las rutas"
    }
  ],
  "middleware": [
    {
      "name": "NombreMiddleware",
      "fileName": "nombreMiddleware.js",
      "content": "código completo del middleware",
      "description": "descripción del middleware"
    }
  ],
  "config": [
    {
      "name": "NombreConfig",
      "fileName": "nombreConfig.js",
      "content": "código completo de configuración",
      "description": "descripción de la configuración"
    }
  ]
}
\`\`\`

Asegúrate de:
- Usar las mejores prácticas de ${framework}
- Incluir manejo de errores completo
- Agregar validación de datos
- Implementar respuestas HTTP apropiadas
- Usar async/await para operaciones asíncronas
- Incluir comentarios explicativos en el código
${includeDatabase ? '- Usar Mongoose para modelos de MongoDB' : '- Usar estructuras de datos simples'}
- Seguir patrones RESTful para las APIs`;
  
  return prompt;
};

// Función auxiliar para parsear respuesta de análisis de backend
const parseBackendAnalysisResponse = (responseText) => {
  try {
    // Buscar JSON en la respuesta
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Si no hay formato JSON, intentar parsear directamente
    const cleanResponse = responseText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanResponse);
  } catch (error) {
    console.error('Error parseando respuesta de análisis de backend:', error);
    // Retornar estructura básica en caso de error
    return {
      models: [],
      controllers: [],
      routes: [],
      middleware: [],
      config: []
    };
  }
};

// Función auxiliar para generar archivos del backend
const generateBackendFiles = async (backendStructure, outputPath, framework, includeDatabase, geminiClient) => {
  const generatedFiles = [];
  
  try {
    // Crear directorio de salida
    const fullOutputPath = path.resolve(outputPath);
    await fs.ensureDir(fullOutputPath);
    
    // Crear estructura de directorios
    const directories = ['models', 'controllers', 'routes', 'middleware', 'config'];
    for (const dir of directories) {
      await fs.ensureDir(path.join(fullOutputPath, dir));
    }
    
    // Generar archivos de modelos
    for (const model of backendStructure.models) {
      const filePath = path.join(fullOutputPath, 'models', model.fileName);
      await fs.writeFile(filePath, model.content, 'utf8');
      generatedFiles.push({
        type: 'model',
        name: model.name,
        fileName: model.fileName,
        path: filePath,
        description: model.description
      });
    }
    
    // Generar archivos de controladores
    for (const controller of backendStructure.controllers) {
      const filePath = path.join(fullOutputPath, 'controllers', controller.fileName);
      await fs.writeFile(filePath, controller.content, 'utf8');
      generatedFiles.push({
        type: 'controller',
        name: controller.name,
        fileName: controller.fileName,
        path: filePath,
        description: controller.description
      });
    }
    
    // Generar archivos de rutas
    for (const route of backendStructure.routes) {
      const filePath = path.join(fullOutputPath, 'routes', route.fileName);
      await fs.writeFile(filePath, route.content, 'utf8');
      generatedFiles.push({
        type: 'route',
        name: route.name,
        fileName: route.fileName,
        path: filePath,
        description: route.description
      });
    }
    
    // Generar archivos de middleware
    for (const middleware of backendStructure.middleware) {
      const filePath = path.join(fullOutputPath, 'middleware', middleware.fileName);
      await fs.writeFile(filePath, middleware.content, 'utf8');
      generatedFiles.push({
        type: 'middleware',
        name: middleware.name,
        fileName: middleware.fileName,
        path: filePath,
        description: middleware.description
      });
    }
    
    // Generar archivos de configuración
    for (const config of backendStructure.config) {
      const filePath = path.join(fullOutputPath, 'config', config.fileName);
      await fs.writeFile(filePath, config.content, 'utf8');
      generatedFiles.push({
        type: 'config',
        name: config.name,
        fileName: config.fileName,
        path: filePath,
        description: config.description
      });
    }
    
    // Generar package.json
    const packageJsonContent = await generatePackageJson(framework, includeDatabase, geminiClient);
    const packageJsonPath = path.join(fullOutputPath, 'package.json');
    await fs.writeFile(packageJsonPath, packageJsonContent, 'utf8');
    generatedFiles.push({
      type: 'config',
      name: 'PackageJson',
      fileName: 'package.json',
      path: packageJsonPath,
      description: 'Configuración de dependencias del proyecto'
    });
    
    // Generar server.js principal
    const serverContent = await generateMainServer(framework, includeDatabase, geminiClient);
    const serverPath = path.join(fullOutputPath, 'server.js');
    await fs.writeFile(serverPath, serverContent, 'utf8');
    generatedFiles.push({
      type: 'config',
      name: 'MainServer',
      fileName: 'server.js',
      path: serverPath,
      description: 'Archivo principal del servidor'
    });
    
    // Generar README.md
    const readmeContent = generateReadme(framework, includeDatabase, generatedFiles);
    const readmePath = path.join(fullOutputPath, 'README.md');
    await fs.writeFile(readmePath, readmeContent, 'utf8');
    generatedFiles.push({
      type: 'documentation',
      name: 'README',
      fileName: 'README.md',
      path: readmePath,
      description: 'Documentación del proyecto generado'
    });
    
    console.log(`✅ Generados ${generatedFiles.length} archivos en ${fullOutputPath}`);
    return generatedFiles;
    
  } catch (error) {
    console.error('Error generando archivos del backend:', error);
    throw error;
  }
};

// Función auxiliar para generar package.json
const generatePackageJson = async (framework, includeDatabase, geminiClient) => {
  const basePackage = {
    "name": "generated-backend",
    "version": "1.0.0",
    "description": "Backend generado automáticamente desde análisis de API",
    "main": "server.js",
    "scripts": {
      "start": "node server.js",
      "dev": "nodemon server.js",
      "test": "echo \"Error: no test specified\" && exit 1"
    },
    "dependencies": {
      "express": "^4.18.2",
      "cors": "^2.8.5",
      "helmet": "^7.0.0",
      "morgan": "^1.10.0",
      "dotenv": "^16.3.1",
      "express-validator": "^7.0.1"
    },
    "devDependencies": {
      "nodemon": "^3.0.1"
    }
  };
  
  if (includeDatabase) {
    basePackage.dependencies.mongoose = "^7.5.0";
  }
  
  return JSON.stringify(basePackage, null, 2);
};

// Función auxiliar para generar servidor principal
const generateMainServer = async (framework, includeDatabase, geminiClient) => {
  let serverContent = `const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

`;
  
  if (includeDatabase) {
    serverContent += `// Database connection
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/generated-backend', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Conectado a MongoDB'))
.catch(err => console.error('❌ Error conectando a MongoDB:', err));

`;
  }
  
  serverContent += `// Routes
// TODO: Importar y usar las rutas generadas
// app.use('/api', require('./routes'));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    message: \`La ruta \${req.originalUrl} no existe\`
  });
});

app.listen(PORT, () => {
  console.log(\`🚀 Servidor ejecutándose en puerto \${PORT}\`);
  console.log(\`📍 Health check: http://localhost:\${PORT}/health\`);
});

module.exports = app;`;
  
  return serverContent;
};

// Función auxiliar para generar README
const generateReadme = (framework, includeDatabase, generatedFiles) => {
  let readme = `# Backend Generado Automáticamente

Este backend fue generado automáticamente mediante análisis de archivos API usando IA.

## Características

- **Framework**: ${framework}
- **Base de datos**: ${includeDatabase ? 'MongoDB con Mongoose' : 'Sin base de datos'}
- **Archivos generados**: ${generatedFiles.length}

## Estructura del Proyecto

\`\`\`
├── models/          # Modelos de datos
├── controllers/     # Lógica de negocio
├── routes/          # Definición de rutas
├── middleware/      # Middleware personalizado
├── config/          # Configuraciones
├── server.js        # Archivo principal
├── package.json     # Dependencias
└── README.md        # Este archivo
\`\`\`

## Instalación

1. Instalar dependencias:
\`\`\`bash
npm install
\`\`\`

2. Configurar variables de entorno:
\`\`\`bash
cp .env.example .env
# Editar .env con tus configuraciones
\`\`\`

${includeDatabase ? '3. Asegúrate de tener MongoDB ejecutándose\n\n' : ''}## Ejecución

### Desarrollo
\`\`\`bash
npm run dev
\`\`\`

### Producción
\`\`\`bash
npm start
\`\`\`

## Archivos Generados

`;
  
  const groupedFiles = generatedFiles.reduce((acc, file) => {
    if (!acc[file.type]) acc[file.type] = [];
    acc[file.type].push(file);
    return acc;
  }, {});
  
  Object.keys(groupedFiles).forEach(type => {
    readme += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n\n`;
    groupedFiles[type].forEach(file => {
      readme += `- **${file.fileName}**: ${file.description}\n`;
    });
  });
  
  readme += `\n## Notas Importantes

- Este código fue generado automáticamente y puede requerir ajustes
- Revisa y prueba todas las funcionalidades antes de usar en producción
- Agrega validaciones adicionales según tus necesidades
- Configura adecuadamente las variables de entorno

## Health Check

Una vez ejecutando, puedes verificar el estado del servidor en:
\`\`\`
GET http://localhost:3000/health
\`\`\`

---

*Generado automáticamente el ${new Date().toLocaleString()}*`;
  
  return readme;
};

// Función auxiliar para crear prompt específico para user stories
const createUserStoriesPrompt = (pageName, pageContent, components, numUserStories, userStoryType, pageDescription, existingUserStories) => {
  let prompt = `Analiza el siguiente código de una página React/Vue llamada "${pageName}" y genera exactamente ${numUserStories} historias de usuario desde la perspectiva del usuario final.`;
  
  if (userStoryType && userStoryType.trim() !== '') {
    prompt += ` Enfócate especialmente en funcionalidades relacionadas con: ${userStoryType}.`;
  }
  
  // Agregar descripción de la página si existe
  if (pageDescription && pageDescription.trim() !== '') {
    prompt += `

**Descripción de la página:**
${pageDescription}`;
  }
  
  // Agregar historias de usuario existentes si las hay
  if (existingUserStories && existingUserStories.length > 0) {
    prompt += `

**Historias de usuario existentes (NO duplicar estas funcionalidades):**
`;
    existingUserStories.forEach((story, index) => {
      prompt += `${index + 1}. ${story.title}: ${story.description}
`;
    });
    prompt += `
IMPORTANTE: Las nuevas historias deben ser DIFERENTES y COMPLEMENTARIAS a las existentes, no duplicadas.`;
  }
  
  prompt += `

Código de la página:
\`\`\`
${pageContent.substring(0, 3000)}
\`\`\`

`;
  
  if (components.length > 0) {
    prompt += `Componentes importados y utilizados:
`;
    components.forEach((comp, index) => {
      prompt += `
${index + 1}. Componente: ${comp.name}
\`\`\`
${comp.content.substring(0, 1000)}
\`\`\`

`;
    });
  }
  
  prompt += `Por favor, genera exactamente ${numUserStories} historias de usuario NUEVAS que representen funcionalidades adicionales que un usuario puede realizar en esta página. Para cada historia, proporciona:

1. **Título**: Un título descriptivo y conciso
2. **Descripción**: Una descripción detallada siguiendo el formato "Como [tipo de usuario], quiero [funcionalidad] para [beneficio]"
3. **Criterios de Aceptación**: Lista de 2-4 criterios específicos que deben cumplirse
4. **Prioridad**: Alta, Media o Baja
5. **Horas Estimadas**: Estimación en horas (número entero entre 1 y 40)

Formato de respuesta (JSON):
\`\`\`json
[
  {
    "title": "Título de la historia de usuario",
    "description": "Como [usuario], quiero [funcionalidad] para [beneficio]",
    "acceptanceCriteria": ["Criterio 1", "Criterio 2", "Criterio 3"],
    "priority": "Alta|Media|Baja",
    "estimatedHours": 8
  }
]
\`\`\`

Concentrate en las acciones que el usuario puede realizar, no en detalles técnicos de implementación. Asegúrate de generar exactamente ${numUserStories} historias NUEVAS que no dupliquen las existentes.`;
  
  return prompt;
};

// @desc    Generar sugerencias de páginas con IA
// @route   POST /api/projects/:id/paginasIa
// @access  Private
const getPaginasIa = async (req, res) => {
  console.log('🚀 [BACKEND] Iniciando getPaginasIa');
  console.log('📋 [BACKEND] Parámetros recibidos:', {
    projectId: req.params.id,
    userId: req.user?.userId,
    method: req.method,
    url: req.url
  });
  
  try {
    console.log('🔍 [BACKEND] Buscando proyecto en base de datos...');
    
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    console.log('📊 [BACKEND] Resultado de búsqueda de proyecto:', {
      found: !!project,
      projectId: project?._id,
      projectName: project?.name,
      userId: req.user.userId
    });

    if (!project) {
      console.error('❌ [BACKEND] Proyecto no encontrado o sin permisos');
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para verlo'
      });
    }

    // Verificar que la API key de Gemini esté configurada
    console.log('🔑 [BACKEND] Verificando API key de Gemini...');
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    console.log('🔑 [BACKEND] API key disponible:', hasGeminiKey);
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ [BACKEND] API key de Gemini no configurada');
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    console.log(`🤖 [BACKEND] Generando sugerencias de páginas para proyecto: ${project.name}`);
    console.log(`📈 [BACKEND] Proyecto tiene ${project.pages?.length || 0} páginas existentes`);

    // Preparar información del proyecto para Gemini
    console.log('📝 [BACKEND] Preparando información del proyecto para Gemini...');
    
    const projectInfo = {
      name: project.name,
      description: project.description,
      techStack: project.techStack,
      pages: project.pages.map(page => ({
        title: page.title || page.name,
        description: page.description,
        userStories: page.userStories ? page.userStories.map(us => ({
          title: us.title,
          description: us.description,
          priority: us.priority
        })) : []
      }))
    };

    console.log('📊 [BACKEND] Información del proyecto preparada:', {
      name: projectInfo.name,
      descriptionLength: projectInfo.description?.length || 0,
      techStackCount: projectInfo.techStack?.length || 0,
      pagesCount: projectInfo.pages?.length || 0,
      totalUserStories: projectInfo.pages.reduce((total, page) => total + (page.userStories?.length || 0), 0)
    });

    // Crear prompt para Gemini
    console.log('🎯 [BACKEND] Creando prompt para Gemini...');
    const prompt = `
Analiza el siguiente proyecto y genera 3 sugerencias de nuevas páginas que complementen la funcionalidad existente.

PROYECTO:
Nombre: ${projectInfo.name}
Descripción: ${projectInfo.description}
Tecnologías: ${projectInfo.techStack.join(', ')}

PÁGINAS EXISTENTES:
${projectInfo.pages.map(page => `
- ${page.title}
  Descripción: ${page.description}
  User Stories: ${page.userStories.map(us => `\n    * ${us.title}: ${us.description} (${us.priority})`).join('')}`).join('\n')}

Genera 3 sugerencias de páginas nuevas en formato JSON con la siguiente estructura:
{
  "suggestions": [
    {
      "title": "Título de la página",
      "description": "Descripción detallada de la funcionalidad",
      "priority": "high|medium|low",
      "status": "todo"
    }
  ]
}

Las sugerencias deben ser relevantes al contexto del proyecto y complementar las páginas existentes. Responde ÚNICAMENTE con el JSON, sin texto adicional.
`;

    console.log('📏 [BACKEND] Longitud del prompt:', prompt.length);
    console.log('📝 [BACKEND] Prompt creado (primeros 200 chars):', prompt.substring(0, 200) + '...');
    
    try {
      // Inicializar Google Gemini
      console.log('🔧 [BACKEND] Inicializando cliente de Google Gemini...');
      const client = new GoogleGenAI(process.env.GEMINI_API_KEY);
      const model = client.getGenerativeModel({ model: 'gemini-1.5-pro' });
      console.log('✅ [BACKEND] Cliente Gemini inicializado correctamente');

      console.log('🤖 [BACKEND] Enviando solicitud a Gemini...');
      const startTime = Date.now();
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const responseText = response.text();
      
      const endTime = Date.now();
      console.log(`✅ [BACKEND] Respuesta recibida de Gemini en ${endTime - startTime}ms`);
      console.log('📏 [BACKEND] Longitud de respuesta:', responseText.length);
      console.log('📝 [BACKEND] Respuesta de Gemini (primeros 300 chars):', responseText.substring(0, 300) + '...');

      // Escribir respuesta de Gemini en archivo para debugging
      console.log('💾 [BACKEND] Guardando respuesta en archivo para debugging...');
      await writeGeminiResponseToFile(responseText, 'paginas_ia_suggestions', project._id);
      console.log('✅ [BACKEND] Respuesta guardada en archivo');

      // Parsear respuesta JSON
      console.log('🔍 [BACKEND] Iniciando parseo de respuesta JSON...');
      let suggestions;
      try {
        // Extraer JSON de la respuesta (puede venir con texto adicional)
        console.log('🎯 [BACKEND] Buscando JSON en la respuesta...');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          console.log('✅ [BACKEND] JSON encontrado, parseando...');
          console.log('📝 [BACKEND] JSON extraído:', jsonMatch[0].substring(0, 200) + '...');
          suggestions = JSON.parse(jsonMatch[0]);
          console.log('✅ [BACKEND] JSON parseado exitosamente');
        } else {
          console.error('❌ [BACKEND] No se encontró JSON válido en la respuesta');
          throw new Error('No se encontró JSON válido en la respuesta');
        }
      } catch (parseError) {
        console.error('❌ [BACKEND] Error parseando respuesta de Gemini:', parseError);
        console.error('❌ [BACKEND] Tipo de error de parseo:', typeof parseError);
        console.error('❌ [BACKEND] Stack trace del parseo:', parseError.stack);
        
        console.log('🔄 [BACKEND] Usando sugerencias por defecto como fallback...');
        
        // Fallback con sugerencias por defecto
        suggestions = {
          suggestions: [
            {
              title: "Dashboard de Analíticas",
              description: "Panel de control con métricas y estadísticas del sistema",
              priority: "high",
              status: "todo"
            },
            {
              title: "Gestión de Configuración",
              description: "Página para administrar configuraciones del sistema",
              priority: "medium",
              status: "todo"
            },
            {
              title: "Centro de Notificaciones",
              description: "Sistema de notificaciones y alertas para usuarios",
              priority: "low",
              status: "todo"
            }
          ]
        };
        
        console.log('✅ [BACKEND] Sugerencias por defecto aplicadas');
      }

      const finalSuggestions = suggestions.suggestions || suggestions;
      console.log(`📚 [BACKEND] Sugerencias finales generadas: ${finalSuggestions.length}`);
      console.log('📋 [BACKEND] Títulos de sugerencias:', finalSuggestions.map(s => s.title));

      const responseData = {
        message: 'Sugerencias de páginas generadas exitosamente',
        suggestions: finalSuggestions,
        projectInfo: {
          name: project.name,
          description: project.description,
          existingPages: project.pages.length
        }
      };
      
      console.log('📤 [BACKEND] Enviando respuesta exitosa al frontend');
      console.log('📊 [BACKEND] Datos de respuesta:', {
        suggestionsCount: responseData.suggestions.length,
        projectName: responseData.projectInfo.name,
        existingPages: responseData.projectInfo.existingPages
      });
      
      res.json(responseData);

    } catch (geminiError) {
      console.error('❌ [BACKEND] Error con Gemini API:', geminiError);
      console.error('❌ [BACKEND] Tipo de error Gemini:', typeof geminiError);
      console.error('❌ [BACKEND] Mensaje de error Gemini:', geminiError.message);
      console.error('❌ [BACKEND] Stack trace Gemini:', geminiError.stack);
      
      const errorResponse = {
        error: 'Error generando sugerencias',
        message: 'Error al comunicarse con el servicio de IA: ' + geminiError.message
      };
      
      console.log('📤 [BACKEND] Enviando respuesta de error Gemini:', errorResponse);
      
      return res.status(500).json(errorResponse);
    }

  } catch (error) {
    console.error('❌ [BACKEND] Error general en getPaginasIa:', error);
    console.error('❌ [BACKEND] Tipo de error general:', typeof error);
    console.error('❌ [BACKEND] Mensaje de error general:', error.message);
    console.error('❌ [BACKEND] Stack trace general:', error.stack);
    
    const errorResponse = {
      error: 'Error interno del servidor',
      message: 'Error al generar sugerencias de páginas'
    };
    
    console.log('📤 [BACKEND] Enviando respuesta de error general:', errorResponse);
    
    res.status(500).json(errorResponse);
  }
  
  console.log('🏁 [BACKEND] Finalizando función getPaginasIa');
};

// @desc    Actualizar página con sugerencias de IA
// @route   POST /api/projects/:projectId/actualizarPagina
// @access  Private
const actualizarPagina = async (req, res) => {
  console.log('🚀 [BACKEND] Iniciando función actualizarPagina');
  console.log('📋 [BACKEND] Parámetros recibidos:', req.params);
  console.log('📦 [BACKEND] Body recibido:', req.body);
  
  try {
    const { projectId } = req.params;
    const { pageId, pageName, pageDescription } = req.body;
    
    console.log('🔍 [BACKEND] Buscando proyecto con ID:', projectId);
    
    // Buscar el proyecto
    const project = await Project.findOne({
      _id: projectId,
      userId: req.user.userId,
      isActive: true
    });
    
    console.log('📊 [BACKEND] Resultado de búsqueda de proyecto:', project ? 'Encontrado' : 'No encontrado');
    
    if (!project) {
      console.error('❌ [BACKEND] Proyecto no encontrado');
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }
    
    console.log('✅ [BACKEND] Proyecto encontrado:', project.name);
    
    // Verificar que la API key de Gemini esté configurada
    console.log('🔑 [BACKEND] Verificando API key de Gemini...');
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ [BACKEND] API key de Gemini no configurada');
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }
    console.log('✅ [BACKEND] API key de Gemini verificada');
    
    // Buscar la página específica si se proporciona pageId
    let targetPage = null;
    if (pageId) {
      targetPage = project.pages.find(p => p.id === pageId);
      console.log('🔍 [BACKEND] Página específica:', targetPage ? 'Encontrada' : 'No encontrada');
    }
    
    // Preparar información del proyecto para Gemini
    console.log('📝 [BACKEND] Preparando información del proyecto para Gemini...');
    const projectInfo = {
      name: project.name,
      description: project.description || 'Sin descripción',
      techStack: project.techStack || [],
      totalPages: project.pages.length,
      totalUserStories: project.pages.reduce((total, page) => total + (page.userStories?.length || 0), 0)
    };
    
    console.log('📊 [BACKEND] Info del proyecto preparada:', {
      name: projectInfo.name,
      descriptionLength: projectInfo.description.length,
      techStackCount: projectInfo.techStack.length,
      totalPages: projectInfo.totalPages,
      totalUserStories: projectInfo.totalUserStories
    });
    
    // Preparar información de la página
    const pageInfo = {
      name: pageName || targetPage?.name || 'Página sin nombre',
      description: pageDescription || targetPage?.description || 'Sin descripción',
      userStories: targetPage?.userStories || []
    };
    
    console.log('📄 [BACKEND] Info de la página preparada:', {
      name: pageInfo.name,
      descriptionLength: pageInfo.description.length,
      userStoriesCount: pageInfo.userStories.length
    });
    
    // Crear prompt para Gemini
    const prompt = `
Analiza el siguiente proyecto y página para generar mejoras en forma de User Stories:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${projectInfo.name}
- Descripción: ${projectInfo.description}
- Stack Tecnológico: ${projectInfo.techStack.join(', ')}
- Total de páginas: ${projectInfo.totalPages}
- Total de user stories: ${projectInfo.totalUserStories}

**INFORMACIÓN DE LA PÁGINA A MEJORAR:**
- Nombre: ${pageInfo.name}
- Descripción: ${pageInfo.description}
- User Stories actuales: ${pageInfo.userStories.length}

**USER STORIES EXISTENTES:**
${pageInfo.userStories.map((us, index) => `${index + 1}. ${us.title} - ${us.description} (Prioridad: ${us.priority}, Estado: ${us.status})`).join('\n')}

**INSTRUCCIONES:**
Genera entre 3 y 6 user stories que mejoren esta página específica. Las mejoras deben:
1. Complementar las user stories existentes (no duplicar)
2. Mejorar la funcionalidad, UX/UI, rendimiento o accesibilidad
3. Ser específicas para esta página en el contexto del proyecto
4. Incluir mejoras técnicas y de experiencia de usuario
5. Considerar el stack tecnológico del proyecto

**FORMATO DE RESPUESTA (JSON):**
{
  "improvements": [
    {
      "title": "Título de la mejora",
      "description": "Descripción detallada de la mejora",
      "priority": "high|medium|low",
      "category": "functionality|ux|performance|accessibility|security",
      "estimatedHours": número,
      "acceptanceCriteria": ["Criterio 1", "Criterio 2"]
    }
  ]
}

Responde ÚNICAMENTE con el JSON válido, sin texto adicional.`;
    
    console.log('📝 [BACKEND] Prompt creado - longitud:', prompt.length);
    console.log('📋 [BACKEND] Primeros 200 caracteres del prompt:', prompt.substring(0, 200));
    
    // Inicializar cliente Gemini
    console.log('🤖 [BACKEND] Inicializando cliente Gemini...');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✅ [BACKEND] Cliente Gemini inicializado');
    
    // Llamar a Gemini
    console.log('📡 [BACKEND] Enviando solicitud a Gemini...');
    const startTime = Date.now();
    
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: prompt
    });
    const responseText = result.text;
    
    const endTime = Date.now();
    console.log(`⏱️ [BACKEND] Tiempo de respuesta de Gemini: ${endTime - startTime}ms`);
    console.log('📄 [BACKEND] Longitud de respuesta:', responseText.length);
    console.log('📋 [BACKEND] Primeros 300 caracteres de respuesta:', responseText.substring(0, 300));
    
    // Guardar respuesta en archivo
    console.log('💾 [BACKEND] Guardando respuesta de Gemini en archivo...');
    await writeGeminiResponseToFile(responseText, 'actualizarPagina', projectId);
    
    // Parsear respuesta JSON
    console.log('🔄 [BACKEND] Parseando respuesta JSON...');
    let improvements;
    
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      console.log('📋 [BACKEND] JSON extraído:', jsonString.substring(0, 200));
      
      const parsedResponse = JSON.parse(jsonString);
      improvements = parsedResponse.improvements || [];
      
      console.log('✅ [BACKEND] JSON parseado exitosamente');
      console.log('📊 [BACKEND] Mejoras encontradas:', improvements.length);
      
    } catch (parseError) {
      console.error('❌ [BACKEND] Error parseando JSON:', parseError);
      console.error('❌ [BACKEND] Tipo de error de parseo:', typeof parseError);
      console.error('❌ [BACKEND] Stack trace de parseo:', parseError.stack);
      
      // Mejoras por defecto en caso de error
      improvements = [
        {
          title: "Mejorar accesibilidad de la página",
          description: "Implementar mejores prácticas de accesibilidad para usuarios con discapacidades",
          priority: "medium",
          category: "accessibility",
          estimatedHours: 4,
          acceptanceCriteria: ["Cumplir con WCAG 2.1 AA", "Navegación por teclado funcional"]
        },
        {
          title: "Optimizar rendimiento de carga",
          description: "Mejorar los tiempos de carga y la experiencia de usuario",
          priority: "high",
          category: "performance",
          estimatedHours: 6,
          acceptanceCriteria: ["Reducir tiempo de carga en 50%", "Implementar lazy loading"]
        }
      ];
      
      console.log('✅ [BACKEND] Mejoras por defecto aplicadas');
    }
    
    const finalImprovements = improvements || [];
    console.log(`📚 [BACKEND] Mejoras finales generadas: ${finalImprovements.length}`);
    console.log('📋 [BACKEND] Títulos de mejoras:', finalImprovements.map(i => i.title));
    
    const responseData = {
      message: 'Mejoras para la página generadas exitosamente',
      improvements: finalImprovements,
      pageInfo: {
        name: pageInfo.name,
        description: pageInfo.description,
        currentUserStories: pageInfo.userStories.length
      },
      projectInfo: {
        name: projectInfo.name,
        totalPages: projectInfo.totalPages
      }
    };
    
    console.log('📤 [BACKEND] Enviando respuesta exitosa al frontend');
    console.log('📊 [BACKEND] Datos de respuesta:', {
      improvementsCount: responseData.improvements.length,
      pageName: responseData.pageInfo.name,
      projectName: responseData.projectInfo.name
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ [BACKEND] Error en actualizarPagina:', error);
    console.error('❌ [BACKEND] Tipo de error:', typeof error);
    console.error('❌ [BACKEND] Mensaje de error:', error.message);
    console.error('❌ [BACKEND] Stack trace:', error.stack);
    
    const errorResponse = {
      error: 'Error interno del servidor',
      message: 'Error al generar mejoras para la página'
    };
    
    console.log('📤 [BACKEND] Enviando respuesta de error:', errorResponse);
    
    res.status(500).json(errorResponse);
  }
  
  console.log('🏁 [BACKEND] Finalizando función actualizarPagina');
};


// @desc    Add multiple pages to a project
// @route   POST /api/projects/:id/pages/bulk
// @access  Private
const addMultiplePages = async (req, res) => {
  try {
    // Check for validation errors
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: validationErrors.array()
      });
    }

    const { pages } = req.body;

    // Validar que pages sea un array
    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'Debes proporcionar un array de páginas no vacío'
      });
    }

    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    const addedPages = [];
    const errors = [];

    // Procesar cada página
    for (let i = 0; i < pages.length; i++) {
      const pageData = pages[i];
      
      try {
        // Validar datos requeridos de la página
        if (!pageData.name || !pageData.route) {
          errors.push({
            index: i,
            error: 'Nombre y ruta son requeridos',
            pageData
          });
          continue;
        }

        // Verificar que la ruta no exista ya en el proyecto
        const existingPage = project.pages.find(p => p.route === pageData.route);
        if (existingPage) {
          errors.push({
            index: i,
            error: `La ruta '${pageData.route}' ya existe en el proyecto`,
            pageData
          });
          continue;
        }

        // Crear nueva página
        const newPage = {
          id: pageData.id || uuidv4(),
          name: pageData.name,
          description: pageData.description || '',
          route: pageData.route,
          isEssential: pageData.isEssential || false,
          priority: pageData.priority || 5,
          userStories: pageData.userStories || [],
          createdAt: pageData.createdAt || new Date(),
          generatedByAI: pageData.generatedByAI || false
        };

        project.pages.push(newPage);
        addedPages.push(newPage);

      } catch (pageError) {
        console.error(`Error procesando página ${i}:`, pageError);
        errors.push({
          index: i,
          error: `Error interno al procesar página: ${pageError.message}`,
          pageData
        });
      }
    }

    // Guardar el proyecto con todas las páginas agregadas
    if (addedPages.length > 0) {
      await project.save();
    }

    // Preparar respuesta
    const response = {
      message: `Proceso completado: ${addedPages.length} páginas agregadas exitosamente`,
      totalRequested: pages.length,
      totalAdded: addedPages.length,
      totalErrors: errors.length,
      addedPages,
      project: {
        id: project._id,
        name: project.name,
        totalPages: project.pages.length
      }
    };

    // Incluir errores si los hay
    if (errors.length > 0) {
      response.errors = errors;
      response.message += `, ${errors.length} páginas tuvieron errores`;
    }

    // Determinar código de estado
    const statusCode = addedPages.length > 0 ? 
      (errors.length > 0 ? 207 : 201) : // 207 Multi-Status si hay éxitos y errores, 201 si todo bien
      400; // 400 si no se agregó ninguna página

    res.status(statusCode).json(response);

  } catch (error) {
    console.error('Error al agregar múltiples páginas:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al agregar múltiples páginas'
    });
  }
};

// @desc    Generate initial prompt for bolt.new with project pages
// @route   GET /api/projects/:id/generate-initial-prompt
// @access  Private
const generarpromptinicial = async (req, res) => {
  try {
    console.log('🚀 Generando prompts para bolt.new');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });

    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para acceder a él'
      });
    }

    // ────────────────── 2. Preparar información del proyecto ──────────────────
    const projectInfo = {
      name: project.name,
      description: project.description,
      techStack: project.techStack || [],
      totalPages: project.pages?.length || 0,
      pages: project.pages || []
    };

    // ────────────────── 2.5. Generar estructura de archivos ──────────────────
    const generateFileStructure = () => {
      const folders = [];
      const files = [];

      // Carpetas base
      folders.push(
        { path: 'src', name: 'src', type: 'folder' },
        { path: 'src/components', name: 'components', type: 'component' },
        { path: 'src/features', name: 'features', type: 'folder' },
        { path: 'src/hooks', name: 'hooks', type: 'hook' },
        { path: 'src/styles', name: 'styles', type: 'style' },
        { path: '.gemini', name: '.gemini', type: 'folder' }
      );

      // Archivos base
      files.push(
        { path: 'src/components/Button.jsx', name: 'Button.jsx', type: 'component', description: 'Componente Button reutilizable básico' },
        { path: 'src/components/Table.jsx', name: 'Table.jsx', type: 'component', description: 'Componente Table reutilizable básico' },
        { path: 'src/components/Sidebar.jsx', name: 'Sidebar.jsx', type: 'component', description: 'Sidebar básico con navegación' },
        { path: 'src/App.tsx', name: 'App.tsx', type: 'route', description: 'Configuración de rutas básicas' },
        { path: 'GEMINI.md', name: 'GEMINI.md', type: 'config', description: 'Briefing para el agente' }
      );

      // Generar estructura para cada página
      if (projectInfo.pages.length > 0) {
        projectInfo.pages.forEach((page) => {
          const featureName = page.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          const pageName = page.name.replace(/\s+/g, '');

          // Carpetas por feature
          folders.push(
            { path: `src/features/${featureName}`, name: featureName, type: 'feature' },
            { path: `src/features/${featureName}/components`, name: 'components', type: 'component' },
            { path: `src/features/${featureName}/hooks`, name: 'hooks', type: 'hook' }
          );

          // Archivos por feature
          files.push(
            { path: `src/features/${featureName}/hooks/use${pageName}.ts`, name: `use${pageName}.ts`, type: 'hook', description: `Hook específico del dominio ${page.name}` },
            { path: `src/features/${featureName}/api.ts`, name: 'api.ts', type: 'api', description: `Llamadas REST/GraphQL para ${page.name}` },
            { path: `src/features/${featureName}/${pageName}Page.tsx`, name: `${pageName}Page.tsx`, type: 'page', description: `Entry-point de ruta para ${page.name}` }
          );
        });
      } else {
        // Estructura por defecto si no hay páginas
        folders.push(
          { path: 'src/features/home', name: 'home', type: 'feature' },
          { path: 'src/features/home/components', name: 'components', type: 'component' },
          { path: 'src/features/home/hooks', name: 'hooks', type: 'hook' }
        );

        files.push(
          { path: 'src/features/home/hooks/useHome.ts', name: 'useHome.ts', type: 'hook', description: 'Hook específico del dominio Home' },
          { path: 'src/features/home/api.ts', name: 'api.ts', type: 'api', description: 'Llamadas REST/GraphQL para Home' },
          { path: 'src/features/home/HomePage.tsx', name: 'HomePage.tsx', type: 'page', description: 'Entry-point de ruta para Home' }
        );
      }

      return { folders, files };
    };

    const fileStructure = generateFileStructure();

    // ────────────────── 3. PROMPT COMPLETO ──────────────────
    let promptCompleto = `Crea una aplicación web completa llamada "${projectInfo.name}" con arquitectura basada en features\n\n`;
    promptCompleto += `**Descripción del proyecto:**\n${projectInfo.description}\n\n`;

    if (projectInfo.techStack.length > 0) {
      promptCompleto += `**Stack tecnológico sugerido:**\n${projectInfo.techStack.join(', ')}\n\n`;
    }

    promptCompleto += `**Estructura de proyecto requerida:**\n\n`;
    promptCompleto += `\`\`\`\n`;
    promptCompleto += `src/\n`;
    promptCompleto += ` ├─ components/\n`;
    promptCompleto += ` │  └─ Sidebar.jsx            # único componente global\n`;
    promptCompleto += ` ├─ features/\n`;

    // Generar estructura para cada página
    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page, index) => {
        const featureName = page.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        promptCompleto += ` │  ├─ ${featureName}/\n`;
        promptCompleto += ` │  │  ├─ components/          # componentes específicos de ${page.name}\n`;
        promptCompleto += ` │  │  ├─ hooks/\n`;
        promptCompleto += ` │  │  │  └─ use${page.name.replace(/\s+/g, '')}.ts   # hook específico del dominio\n`;
        promptCompleto += ` │  │  ├─ api.ts              # llamadas REST/GraphQL\n`;
        promptCompleto += ` │  │  └─ ${page.name.replace(/\s+/g, '')}Page.tsx    # entry-point de ruta\n`;

        if (index < projectInfo.pages.length - 1) {
          promptCompleto += ` │  │\n`;
        }
      });
    } else {
      promptCompleto += ` │  ├─ home/\n`;
      promptCompleto += ` │  │  ├─ components/\n`;
      promptCompleto += ` │  │  ├─ hooks/\n`;
      promptCompleto += ` │  │  │  └─ useHome.ts\n`;
      promptCompleto += ` │  │  ├─ api.ts\n`;
      promptCompleto += ` │  │  └─ HomePage.tsx\n`;
    }

    promptCompleto += ` │  └─ … (más dominios)\n`;
    promptCompleto += ` ├─ hooks/                    # (opcional) hooks globales muy genéricos\n`;
    promptCompleto += ` ├─ styles/                   # estilos globales o tokens de diseño\n`;
    promptCompleto += ` └─ routes.tsx                # definición de rutas (React Router, Next App Router…)\n`;
    promptCompleto += `.gemini/\n`;
    promptCompleto += ` └─ config.yaml               # patrones a ignorar (node_modules, dist, .next…)\n`;
    promptCompleto += `GEMINI.md                    # briefing para el agente\n`;
    promptCompleto += `\`\`\`\n\n`;

    promptCompleto += `**Páginas a implementar (${projectInfo.totalPages} páginas):**\n\n`;

    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page, index) => {
        const featureName = page.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        promptCompleto += `${index + 1}. **${page.name}** (${page.route}) - Feature: \`${featureName}\`\n`;
        if (page.description) {
          promptCompleto += `   - ${page.description}\n`;
        }
        if (page.userStories && page.userStories.length > 0) {
          promptCompleto += `   - Historias de usuario: ${page.userStories.length}\n`;
        }
        promptCompleto += `\n`;
      });
    } else {
      promptCompleto += `No hay páginas definidas aún. Por favor, genera las páginas básicas necesarias para este tipo de aplicación siguiendo la estructura de features.\n\n`;
    }

    promptCompleto += `**Instrucciones específicas de arquitectura:**\n`;
    promptCompleto += `- Implementa la arquitectura basada en features como se muestra arriba\n`;
    promptCompleto += `- Cada feature debe tener su propia carpeta con components/, hooks/, api.ts y Page.tsx\n`;
    promptCompleto += `- Las carpetas de components/ por feature deben estar vacías inicialmente\n`;
    promptCompleto += `- Usa un único componente global Sidebar.jsx en src/components/\n`;
    promptCompleto += `- Implementa hooks específicos del dominio para cada feature\n`;
    promptCompleto += `- Separa las llamadas API por feature en archivos api.ts individuales\n`;
    promptCompleto += `- Crea un sistema de rutas centralizado en routes.tsx\n\n`;

    promptCompleto += `**Instrucciones adicionales:**\n`;
    promptCompleto += `- Implementa un diseño moderno y responsivo\n`;
    promptCompleto += `- Usa componentes reutilizables dentro de cada feature\n`;
    promptCompleto += `- Incluye navegación entre páginas\n`;
    promptCompleto += `- Aplica buenas prácticas de UX/UI\n`;
    promptCompleto += `- Asegúrate de que la aplicación sea funcional y completa\n`;
    promptCompleto += `- Mantén la separación de responsabilidades por feature\n\n`;

    promptCompleto += `Por favor, crea toda la estructura de archivos, componentes y páginas necesarias siguiendo estrictamente la arquitectura de features especificada.`;

    // ────────────────── 4. PROMPT MINIMALISTA (ajustado) ──────────────────
    let promptMinimalista = `Crea ÚNICAMENTE la estructura básica de carpetas y archivos mínimos para el proyecto "${projectInfo.name}"\n\n`;
    promptMinimalista += `**IMPORTANTE: Solo crea la estructura de carpetas y archivos básicos, NO implementes funcionalidad completa.**\n\n`;

    // 1. Estructura de carpetas y archivos
    promptMinimalista += `**1. Crear estructura de carpetas y archivos boilerplate:**\n`;
    promptMinimalista += `\`\`\`\n`;
    promptMinimalista += `src/\n`;
    promptMinimalista += ` ├─ components/\n`;
    promptMinimalista += ` ├─ features/\n`;

    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page) => {
        const featureName = page.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const pageName = page.name.replace(/\s+/g, '');
        promptMinimalista += ` │  ├─ ${featureName}/\n`;
        promptMinimalista += ` │  │  ├─ components/\n`;
        promptMinimalista += ` │  │  ├─ hooks/\n`;
        promptMinimalista += ` │  │  ├─ api.ts                # boilerplate API\n`;
        promptMinimalista += ` │  │  └─ ${pageName}Page.tsx   # boilerplate de página\n`;
      });
    } else {
      promptMinimalista += ` │  └─ home/\n`;
      promptMinimalista += ` │     ├─ components/\n`;
      promptMinimalista += ` │     ├─ hooks/\n`;
      promptMinimalista += ` │     ├─ api.ts              # boilerplate API\n`;
      promptMinimalista += ` │     └─ HomePage.tsx        # boilerplate de página\n`;
    }

    promptMinimalista += ` ├─ hooks/\n`;
    promptMinimalista += ` └─ styles/\n`;
    promptMinimalista += `.gemini/\n`;
    promptMinimalista += `\`\`\`\n\n`;

    // 2. Componentes globales básicos
    promptMinimalista += `**2. Crear componentes globales básicos:**\n`;
    promptMinimalista += `\n`;
    promptMinimalista += `**src/components/Button.jsx:**\n`;
    promptMinimalista += `Crea un componente Button reutilizable básico con props para:\n`;
    promptMinimalista += `- \`text\` (texto del botón)\n`;
    promptMinimalista += `- \`onClick\` (función de click)\n`;
    promptMinimalista += `- \`variant\` (primary, secondary, danger)\n`;
    promptMinimalista += `- \`disabled\` (estado deshabilitado)\n`;
    promptMinimalista += `\n`;
    promptMinimalista += `**src/components/Table.jsx:**\n`;
    promptMinimalista += `Crea un componente Table reutilizable básico con props para:\n`;
    promptMinimalista += `- \`columns\` (array de objetos con key y label)\n`;
    promptMinimalista += `- \`data\` (array de objetos con los datos)\n`;
    promptMinimalista += `- \`onRowClick\` (función opcional para click en fila)\n`;
    promptMinimalista += `- \`loading\` (estado de carga)\n`;
    promptMinimalista += `\n`;

    // 3. Sidebar básico
    promptMinimalista += `**3. Editar src/components/Sidebar.jsx:**\n`;
    promptMinimalista += `Crea un sidebar básico con navegación a las siguientes páginas:\n`;
    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page) => {
        promptMinimalista += `- ${page.name} (${page.route})\n`;
      });
    } else {
      promptMinimalista += `- Home (/)\n`;
    }
    promptMinimalista += `Utiliza el componente Button para los enlaces de navegación.\n\n`;

    // 4. App.tsx básico
    promptMinimalista += `**4. Editar src/App.tsx:**\n`;
    promptMinimalista += `Configura las rutas básicas para:\n`;
    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page) => {
        promptMinimalista += `- ${page.route} -> ${page.name}\n`;
      });
    } else {
      promptMinimalista += `- / -> Home\n`;
    }
    promptMinimalista += `Incluye el Sidebar en el layout.\n\n`;

    // 5. GEMINI.md
    promptMinimalista += `**5. Crear GEMINI.md:**\n`;
    promptMinimalista += `\`\`\`markdown\n`;
    promptMinimalista += `# ${projectInfo.name}\n\n`;
    promptMinimalista += `## Descripción\n`;
    promptMinimalista += `${projectInfo.description}\n\n`;

    if (projectInfo.techStack.length > 0) {
      promptMinimalista += `## Stack Tecnológico\n`;
      projectInfo.techStack.forEach(tech => {
        promptMinimalista += `- ${tech}\n`;
      });
      promptMinimalista += `\n`;
    }

    promptMinimalista += `## Páginas\n`;
    if (projectInfo.pages.length > 0) {
      projectInfo.pages.forEach((page, index) => {
        promptMinimalista += `${index + 1}. **${page.name}** (${page.route})\n`;
        if (page.description) {
          promptMinimalista += `   - ${page.description}\n`;
        }
      });
    } else {
      promptMinimalista += `1. **Home** (/)\n   - Página principal\n`;
    }

    promptMinimalista += `\n## Componentes Globales\n`;
    promptMinimalista += `- **Button**: Componente reutilizable para botones\n`;
    promptMinimalista += `- **Table**: Componente reutilizable para tablas\n`;
    promptMinimalista += `- **Sidebar**: Navegación principal\n`;
    promptMinimalista += `\n## Arquitectura\n`;
    promptMinimalista += `- Basada en features\n`;
    promptMinimalista += `- Cada feature en su propia carpeta\n`;
    promptMinimalista += `- Componentes globales mínimos\n`;
    promptMinimalista += `\`\`\`\n\n`;

    promptMinimalista += `**RECORDATORIO: Solo crea la estructura básica y los archivos mínimos mencionados. NO implementes funcionalidad completa.**`;

    // ────────────────── 5. Guardar estructura de archivos en el proyecto ──────────────────
    project.fileStructure = {
      folders: fileStructure.folders,
      files: fileStructure.files,
      generatedAt: new Date(),
      promptType: 'minimalista'
    };

    await project.save();
    console.log('✅ Estructura de archivos guardada en el proyecto');

    // ────────────────── 6. Responder con ambos prompts ──────────────────
    res.json({
      message: 'Prompts generados exitosamente',
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        totalPages: projectInfo.totalPages
      },
      prompts: {
        completo: promptCompleto,
        minimalista: promptMinimalista
      },
      fileStructure: {
        totalFolders: fileStructure.folders.length,
        totalFiles: fileStructure.files.length,
        generatedAt: new Date(),
        folders: fileStructure.folders,
        files: fileStructure.files
      },
      metadata: {
        generatedAt: new Date(),
        pagesIncluded: projectInfo.totalPages,
        techStackIncluded: projectInfo.techStack.length > 0,
        promptTypes: ['completo', 'minimalista'],
        fileStructureSaved: true
      }
    });

  } catch (error) {
    console.error('❌ Error al generar prompts:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar prompts para bolt.new'
    });
  }
};

// @desc    Save multiple user stories to a specific page
// @route   POST /api/projects/:projectId/pages/:pageId/save-user-stories
// @access  Private
const saveUserStoriesToPage = async (req, res) => {
  try {
    console.log('💾 Iniciando guardado masivo de historias de usuario');

    // ────────────────── 1. Extraer parámetros ──────────────────
    const { projectId, pageId } = req.params;
    const { userStories } = req.body;
    
    console.log('🔍 saveUserStoriesToPage - Parámetros recibidos:', { 
      projectId, 
      pageId, 
      userStoriesCount: userStories?.length || 0 
    });
    console.log('👤 Usuario autenticado:', req.user?.userId);

    // ────────────────── 2. Validar datos de entrada ──────────────────
    if (!Array.isArray(userStories) || userStories.length === 0) {
      return res.status(400).json({
        error: 'Datos inválidos',
        message: 'Se requiere un array de historias de usuario no vacío'
      });
    }

    // ────────────────── 3. Cargar proyecto ──────────────────
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

    console.log('✅ Proyecto encontrado:', project.name);
    
    // ────────────────── 4. Encontrar página ──────────────────
    const pageIndex = project.pages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) {
      console.log('❌ Página no encontrada con ID:', pageId);
      return res.status(404).json({
        error: 'Página no encontrada',
        message: 'La página no existe en este proyecto'
      });
    }

    const page = project.pages[pageIndex];
    console.log('✅ Página encontrada:', page.name);

    // ────────────────── 5. Validar y formatear user stories ──────────────────
    const validatedUserStories = [];
    const errors = [];
    const newFilesToAdd = [];
    const newFoldersToAdd = [];

    for (let i = 0; i < userStories.length; i++) {
      const story = userStories[i];
      
      // Validaciones básicas
      if (!story.title || !story.description) {
        errors.push(`Historia ${i + 1}: Título y descripción son requeridos`);
        continue;
      }

      // Formatear la historia con valores por defecto
      const formattedStory = {
        id: story.id || uuidv4(),
        title: story.title.trim(),
        description: story.description.trim(),
        pageContext: story.pageContext || page.name,
        affectedFiles: Array.isArray(story.affectedFiles) ? story.affectedFiles : [],
        componentsModules: {
          create: Array.isArray(story.componentsModules?.create) 
            ? story.componentsModules.create.map(comp => ({
                name: comp.name || comp,
                type: comp.type || 'component'
              }))
            : [],
          import: Array.isArray(story.componentsModules?.import) 
            ? story.componentsModules.import.map(imp => ({
                name: imp.name || imp,
                from: imp.from || ''
              }))
            : []
        },
        logicData: story.logicData || '',
        styling: {
          framework: story.styling?.framework || 'tailwind',
          classes: typeof story.styling?.classes === 'string' 
            ? story.styling.classes 
            : Array.isArray(story.styling?.classes) 
              ? story.styling.classes.join(' ') 
              : '',
          colorCoding: story.styling?.colorCoding || ''
        },
        acceptanceCriteria: Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : [],
        additionalSuggestions: Array.isArray(story.additionalSuggestions) ? story.additionalSuggestions : [],
        aiEditorTask: story.aiEditorTask || '',
        priority: ['low', 'medium', 'high'].includes(story.priority) ? story.priority : 'medium',
        status: ['pending', 'in-progress', 'completed'].includes(story.status) ? story.status : 'pending',
        estimatedHours: Math.min(40, Math.max(1, Number(story.estimatedHours) || 5))
      };

      // ────────────────── 5.1. Procesar archivos a crear ──────────────────
      if (formattedStory.componentsModules.create && formattedStory.componentsModules.create.length > 0) {
        formattedStory.componentsModules.create.forEach(comp => {
          const componentName = comp.name;
          const componentType = comp.type || 'component';
          
          // Generar nombre de página para la carpeta
          const pageName = page.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          
          // Determinar la ruta y extensión según el tipo
          let filePath = '';
          let folderPath = '';
          let fileExtension = '.tsx';
          
          switch (componentType) {
            case 'component':
              folderPath = `src/features/${pageName}/components`;
              filePath = `src/features/${pageName}/components/${componentName}.tsx`;
              break;
            case 'hook':
              folderPath = `src/features/${pageName}/hooks`;
              filePath = `src/features/${pageName}/hooks/${componentName}.ts`;
              fileExtension = '.ts';
              break;
            case 'service':
              folderPath = `src/features/${pageName}/services`;
              filePath = `src/features/${pageName}/services/${componentName}.ts`;
              fileExtension = '.ts';
              break;
            case 'util':
              folderPath = `src/features/${pageName}/utils`;
              filePath = `src/features/${pageName}/utils/${componentName}.ts`;
              fileExtension = '.ts';
              break;
            case 'module':
              folderPath = `src/features/${pageName}/modules`;
              filePath = `src/features/${pageName}/modules/${componentName}.ts`;
              fileExtension = '.ts';
              break;
            default:
              folderPath = `src/features/${pageName}/components`;
              filePath = `src/features/${pageName}/components/${componentName}.tsx`;
          }

          // Agregar carpeta padre src/features/[página] si no existe
          const featureFolderPath = `src/features/${pageName}`;
          const existingFeatureFolder = project.fileStructure?.folders?.find(f => f.path === featureFolderPath);
          if (!existingFeatureFolder && !newFoldersToAdd.find(f => f.path === featureFolderPath)) {
            newFoldersToAdd.push({
              path: featureFolderPath,
              name: pageName,
              type: 'feature'
            });
          }

          // Agregar carpeta específica si no existe
          const existingFolder = project.fileStructure?.folders?.find(f => f.path === folderPath);
          if (!existingFolder && !newFoldersToAdd.find(f => f.path === folderPath)) {
            newFoldersToAdd.push({
              path: folderPath,
              name: folderPath.split('/').pop(),
              type: componentType === 'component' ? 'component' : 'folder'
            });
          }

          // Agregar archivo si no existe
          const existingFile = project.fileStructure?.files?.find(f => f.path === filePath);
          if (!existingFile && !newFilesToAdd.find(f => f.path === filePath)) {
            newFilesToAdd.push({
              path: filePath,
              name: `${componentName}${fileExtension}`,
              type: componentType === 'component' ? 'component' : 
                    componentType === 'hook' ? 'hook' : 
                    componentType === 'service' ? 'api' : 'component',
              description: `${componentType === 'component' ? 'Componente' : 
                          componentType === 'hook' ? 'Hook personalizado' : 
                          componentType === 'service' ? 'Servicio' : 
                          componentType === 'util' ? 'Utilidad' : 'Módulo'} generado para: ${formattedStory.title}`
            });
          }
        });
      }

      // ────────────────── 5.2. Procesar archivos afectados ──────────────────
      if (formattedStory.affectedFiles && formattedStory.affectedFiles.length > 0) {
        formattedStory.affectedFiles.forEach(filePath => {
          const existingFile = project.fileStructure?.files?.find(f => f.path === filePath);
          if (!existingFile && !newFilesToAdd.find(f => f.path === filePath)) {
            const fileName = filePath.split('/').pop();
            const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
            
            // Determinar tipo de archivo por extensión
            let fileType = 'component';
            if (fileName.endsWith('.ts') || fileName.endsWith('.js')) {
              fileType = 'api';
            } else if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
              fileType = 'style';
            } else if (fileName.includes('route') || fileName.includes('router')) {
              fileType = 'route';
            }

            // Agregar carpeta si no existe
            if (folderPath && !project.fileStructure?.folders?.find(f => f.path === folderPath) && !newFoldersToAdd.find(f => f.path === folderPath)) {
              newFoldersToAdd.push({
                path: folderPath,
                name: folderPath.split('/').pop(),
                type: 'folder'
              });
            }

            newFilesToAdd.push({
              path: filePath,
              name: fileName,
              type: fileType,
              description: `Archivo afectado por: ${formattedStory.title}`
            });
          }
        });
      }

      validatedUserStories.push(formattedStory);
    }

    // ────────────────── 6. Verificar si hay errores ──────────────────
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Errores de validación',
        message: 'Algunas historias de usuario tienen errores',
        details: errors
      });
    }

    // ────────────────── 7. Actualizar estructura de archivos ──────────────────
    if (!project.fileStructure) {
      project.fileStructure = {
        folders: [],
        files: [],
        generatedAt: new Date(),
        promptType: 'minimalista'
      };
    }

    // Agregar nuevas carpetas
    if (newFoldersToAdd.length > 0) {
      project.fileStructure.folders.push(...newFoldersToAdd);
      console.log(`📁 ${newFoldersToAdd.length} nuevas carpetas agregadas a la estructura`);
    }

    // Agregar nuevos archivos
    if (newFilesToAdd.length > 0) {
      project.fileStructure.files.push(...newFilesToAdd);
      console.log(`📄 ${newFilesToAdd.length} nuevos archivos agregados a la estructura`);
    }

    // Actualizar fecha de generación
    project.fileStructure.generatedAt = new Date();

    // ────────────────── 8. Agregar las historias a la página ──────────────────
    project.pages[pageIndex].userStories.push(...validatedUserStories);

    // ────────────────── 9. Guardar el proyecto ──────────────────
    await project.save();

    console.log(`✅ ${validatedUserStories.length} historias de usuario guardadas exitosamente en la página "${page.name}"`);

    // ────────────────── 10. Responder con éxito ──────────────────
    res.json({
      message: `${validatedUserStories.length} historias de usuario guardadas exitosamente`,
      page: {
        id: page.id,
        name: page.name,
        totalUserStories: project.pages[pageIndex].userStories.length
      },
      savedUserStories: validatedUserStories,
      fileStructureUpdates: {
        newFolders: newFoldersToAdd.length,
        newFiles: newFilesToAdd.length,
        addedFolders: newFoldersToAdd,
        addedFiles: newFilesToAdd
      },
      metadata: {
        savedAt: new Date(),
        savedCount: validatedUserStories.length,
        totalInPage: project.pages[pageIndex].userStories.length,
        fileStructureUpdated: newFoldersToAdd.length > 0 || newFilesToAdd.length > 0
      }
    });

  } catch (error) {
    console.error('❌ Error en saveUserStoriesToPage:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al guardar las historias de usuario'
    });
  }
};

// @desc    Generate executive summary using Gemini
// @route   POST /api/projects/:id/generate-executive-summary
// @access  Private
const generateResumenEjecutivoWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de resumen ejecutivo con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto consultor de estrategia empresarial. Genera un resumen ejecutivo conciso para directivos basado en el proyecto.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Crea una visión de alto nivel para directivos
2. Incluye tamaño de mercado estimado
3. Identifica la brecha que cubre el proyecto
4. Destaca la oportunidad de negocio
5. Máximo media página de texto

**Formato de respuesta (JSON válido)**
{
  "executiveSummary": {
    "overview": "Visión general del proyecto y oportunidad",
    "marketSize": "Tamaño estimado del mercado",
    "marketGap": "Brecha identificada en el mercado",
    "opportunity": "Descripción de la oportunidad de negocio",
    "keyPoints": ["Punto clave 1", "Punto clave 2", "Punto clave 3"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_executive_summary', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
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

    // ────────────────── 7. Formatear resumen ejecutivo ────────────────
    const formattedSummary = {
      id: uuidv4(),
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

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Resumen ejecutivo generado exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      executiveSummary: formattedSummary,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
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

// @desc    Generate market definition using Gemini
// @route   POST /api/projects/:id/generate-market-definition
// @access  Private
const generateDefinicionMercadoWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de definición del mercado con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en análisis de mercado. Define claramente el mercado objetivo basado en el proyecto.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Define qué problema específico se resuelve
2. Identifica a quién se dirige (target audience)
3. Especifica geografía y sector de aplicación
4. Extrae palabras clave relevantes
5. Sugiere códigos NAICS/NACE aplicables

**Formato de respuesta (JSON válido)**
{
  "marketDefinition": {
    "problemStatement": "Descripción clara del problema que se resuelve",
    "targetAudience": "A quién se dirige la solución",
    "geography": "Alcance geográfico del mercado",
    "sector": "Sector o industria específica",
    "keywords": ["palabra clave 1", "palabra clave 2", "palabra clave 3"],
    "naicsCodes": ["código NAICS 1", "código NAICS 2"],
    "naceCodes": ["código NACE 1", "código NACE 2"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_market_definition', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedDefinition;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedDefinition = JSON.parse(jsonString);

      if (!generatedDefinition.marketDefinition) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear definición del mercado ────────────────
    const formattedDefinition = {
      id: uuidv4(),
      problemStatement: generatedDefinition.marketDefinition.problemStatement || 'No especificado',
      targetAudience: generatedDefinition.marketDefinition.targetAudience || 'No especificado',
      geography: generatedDefinition.marketDefinition.geography || 'No especificado',
      sector: generatedDefinition.marketDefinition.sector || 'No especificado',
      keywords: Array.isArray(generatedDefinition.marketDefinition.keywords)
        ? generatedDefinition.marketDefinition.keywords
        : [],
      naicsCodes: Array.isArray(generatedDefinition.marketDefinition.naicsCodes)
        ? generatedDefinition.marketDefinition.naicsCodes
        : [],
      naceCodes: Array.isArray(generatedDefinition.marketDefinition.naceCodes)
        ? generatedDefinition.marketDefinition.naceCodes
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Definición del mercado generada exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      marketDefinition: formattedDefinition,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateDefinicionMercadoWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar definición del mercado con Gemini'
    });
  }
};

// @desc    Generate market segmentation and buyer personas using Gemini
// @route   POST /api/projects/:id/generate-segmentation
// @access  Private
const generateSegmentacionWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de segmentación y buyer personas con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en segmentación de mercado y buyer personas. Analiza cómo se divide la demanda y crea perfiles tipo.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Identifica los principales segmentos de mercado
2. Crea buyer personas detalladas
3. Estima TAM, SAM y SOM para cada segmento
4. Incluye datos demográficos y firmográficos
5. Considera clasificaciones SIC/NAICS

**Formato de respuesta (JSON válido)**
{
  "segmentation": {
    "segments": [
      {
        "name": "Nombre del segmento",
        "description": "Descripción del segmento",
        "tam": "Total Addressable Market",
        "sam": "Serviceable Addressable Market",
        "som": "Serviceable Obtainable Market",
        "characteristics": ["Característica 1", "Característica 2"]
      }
    ],
    "buyerPersonas": [
      {
        "name": "Nombre de la persona",
        "role": "Rol o posición",
        "demographics": {
          "age": "Rango de edad",
          "income": "Nivel de ingresos",
          "education": "Nivel educativo",
          "location": "Ubicación geográfica"
        },
        "painPoints": ["Dolor 1", "Dolor 2"],
        "goals": ["Objetivo 1", "Objetivo 2"],
        "buyingBehavior": "Comportamiento de compra"
      }
    ]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_segmentation', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedSegmentation;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedSegmentation = JSON.parse(jsonString);

      if (!generatedSegmentation.segmentation) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear segmentación ────────────────
    const formattedSegmentation = {
      id: uuidv4(),
      segments: Array.isArray(generatedSegmentation.segmentation.segments)
        ? generatedSegmentation.segmentation.segments.map(segment => ({
            name: segment.name || 'Segmento sin nombre',
            description: segment.description || 'Sin descripción',
            tam: segment.tam || 'No especificado',
            sam: segment.sam || 'No especificado',
            som: segment.som || 'No especificado',
            characteristics: Array.isArray(segment.characteristics) ? segment.characteristics : []
          }))
        : [],
      buyerPersonas: Array.isArray(generatedSegmentation.segmentation.buyerPersonas)
        ? generatedSegmentation.segmentation.buyerPersonas.map(persona => ({
            name: persona.name || 'Persona sin nombre',
            role: persona.role || 'Rol no especificado',
            demographics: {
              age: persona.demographics?.age || 'No especificado',
              income: persona.demographics?.income || 'No especificado',
              education: persona.demographics?.education || 'No especificado',
              location: persona.demographics?.location || 'No especificado'
            },
            painPoints: Array.isArray(persona.painPoints) ? persona.painPoints : [],
            goals: Array.isArray(persona.goals) ? persona.goals : [],
            buyingBehavior: persona.buyingBehavior || 'No especificado'
          }))
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Segmentación y buyer personas generados exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      segmentation: formattedSegmentation,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateSegmentacionWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar segmentación con Gemini'
    });
  }
};

// @desc    Generate market size analysis using Gemini
// @route   POST /api/projects/:id/generate-market-size
// @access  Private
const generateTamanoMercadoWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de tamaño de mercado con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en análisis de mercado y sizing. Calcula el tamaño de mercado TAM, SAM y SOM.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Calcula TAM (Total Addressable Market)
2. Calcula SAM (Serviceable Addressable Market)
3. Calcula SOM (Serviceable Obtainable Market)
4. Proporciona series temporales históricas estimadas
5. Incluye metodología de cálculo
6. Cita fuentes típicas de datos

**Formato de respuesta (JSON válido)**
{
  "marketSize": {
    "tam": {
      "value": "Valor en USD",
      "description": "Descripción del TAM",
      "methodology": "Metodología de cálculo"
    },
    "sam": {
      "value": "Valor en USD",
      "description": "Descripción del SAM",
      "methodology": "Metodología de cálculo"
    },
    "som": {
      "value": "Valor en USD",
      "description": "Descripción del SOM",
      "methodology": "Metodología de cálculo"
    },
    "historicalData": [
      {
        "year": 2020,
        "marketValue": "Valor del mercado"
      }
    ],
    "dataSources": ["Fuente 1", "Fuente 2"],
    "assumptions": ["Asunción 1", "Asunción 2"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_market_size', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedMarketSize;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedMarketSize = JSON.parse(jsonString);

      if (!generatedMarketSize.marketSize) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear tamaño de mercado ────────────────
    const formattedMarketSize = {
      id: uuidv4(),
      tam: {
        value: generatedMarketSize.marketSize.tam?.value || 'No especificado',
        description: generatedMarketSize.marketSize.tam?.description || 'No especificado',
        methodology: generatedMarketSize.marketSize.tam?.methodology || 'No especificado'
      },
      sam: {
        value: generatedMarketSize.marketSize.sam?.value || 'No especificado',
        description: generatedMarketSize.marketSize.sam?.description || 'No especificado',
        methodology: generatedMarketSize.marketSize.sam?.methodology || 'No especificado'
      },
      som: {
        value: generatedMarketSize.marketSize.som?.value || 'No especificado',
        description: generatedMarketSize.marketSize.som?.description || 'No especificado',
        methodology: generatedMarketSize.marketSize.som?.methodology || 'No especificado'
      },
      historicalData: Array.isArray(generatedMarketSize.marketSize.historicalData)
        ? generatedMarketSize.marketSize.historicalData
        : [],
      dataSources: Array.isArray(generatedMarketSize.marketSize.dataSources)
        ? generatedMarketSize.marketSize.dataSources
        : [],
      assumptions: Array.isArray(generatedMarketSize.marketSize.assumptions)
        ? generatedMarketSize.marketSize.assumptions
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Tamaño de mercado generado exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      marketSize: formattedMarketSize,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateTamanoMercadoWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar tamaño de mercado con Gemini'
    });
  }
};

// @desc    Generate market trends and growth analysis using Gemini
// @route   POST /api/projects/:id/generate-trends
// @access  Private
const generateTendenciasWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de tendencias y crecimiento con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en análisis de tendencias de mercado y proyecciones de crecimiento. Analiza CAGR, drivers y barreras.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Calcula CAGR (Compound Annual Growth Rate) estimado
2. Identifica drivers de crecimiento principales
3. Identifica barreras y limitaciones
4. Analiza tendencias tecnológicas relevantes
5. Considera factores macroeconómicos
6. Incluye fuentes de datos típicas

**Formato de respuesta (JSON válido)**
{
  "trends": {
    "cagr": {
      "value": "Porcentaje CAGR",
      "period": "Período de análisis",
      "methodology": "Metodología de cálculo"
    },
    "growthDrivers": [
      {
        "driver": "Nombre del driver",
        "description": "Descripción del impacto",
        "impact": "Alto/Medio/Bajo"
      }
    ],
    "barriers": [
      {
        "barrier": "Nombre de la barrera",
        "description": "Descripción del impacto",
        "severity": "Alto/Medio/Bajo"
      }
    ],
    "techTrends": ["Tendencia 1", "Tendencia 2"],
    "macroFactors": ["Factor 1", "Factor 2"],
    "dataSources": ["Google Trends", "PitchBook", "FMI", "BCE"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_trends', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedTrends;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedTrends = JSON.parse(jsonString);

      if (!generatedTrends.trends) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear tendencias ────────────────
    const formattedTrends = {
      id: uuidv4(),
      cagr: {
        value: generatedTrends.trends.cagr?.value || 'No especificado',
        period: generatedTrends.trends.cagr?.period || 'No especificado',
        methodology: generatedTrends.trends.cagr?.methodology || 'No especificado'
      },
      growthDrivers: Array.isArray(generatedTrends.trends.growthDrivers)
        ? generatedTrends.trends.growthDrivers.map(driver => ({
            driver: driver.driver || 'Driver sin nombre',
            description: driver.description || 'Sin descripción',
            impact: driver.impact || 'No especificado'
          }))
        : [],
      barriers: Array.isArray(generatedTrends.trends.barriers)
        ? generatedTrends.trends.barriers.map(barrier => ({
            barrier: barrier.barrier || 'Barrera sin nombre',
            description: barrier.description || 'Sin descripción',
            severity: barrier.severity || 'No especificado'
          }))
        : [],
      techTrends: Array.isArray(generatedTrends.trends.techTrends)
        ? generatedTrends.trends.techTrends
        : [],
      macroFactors: Array.isArray(generatedTrends.trends.macroFactors)
        ? generatedTrends.trends.macroFactors
        : [],
      dataSources: Array.isArray(generatedTrends.trends.dataSources)
        ? generatedTrends.trends.dataSources
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Tendencias y crecimiento generados exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      trends: formattedTrends,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateTendenciasWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar tendencias con Gemini'
    });
  }
};

// @desc    Generate competition analysis using Gemini
// @route   POST /api/projects/:id/generate-competition
// @access  Private
const generateCompetenciaWithGemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación de análisis de competencia con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración faltante',
        message: 'La API key de Google Gemini no está configurada'
      });
    }

    // ────────────────── 3. Instanciar cliente ───────────────
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ────────────────── 4. Construir prompt ─────────────────
    const prompt = `
Eres un experto en análisis competitivo. Identifica competidores, cuotas de mercado y diferenciadores.

**Información del Proyecto**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Stack Tecnológico: ${project.techStack?.join(', ') || 'No especificado'}

**Instrucciones**
1. Identifica competidores directos e indirectos
2. Estima cuotas de mercado
3. Analiza diferenciadores clave
4. Crea matriz comparativa precio-valor
5. Identifica fortalezas y debilidades
6. Sugiere fuentes de datos empresariales

**Formato de respuesta (JSON válido)**
{
  "competition": {
    "directCompetitors": [
      {
        "name": "Nombre del competidor",
        "description": "Descripción breve",
        "marketShare": "Cuota de mercado estimada",
        "strengths": ["Fortaleza 1", "Fortaleza 2"],
        "weaknesses": ["Debilidad 1", "Debilidad 2"],
        "pricing": "Estrategia de precios",
        "valueProposition": "Propuesta de valor"
      }
    ],
    "indirectCompetitors": [
      {
        "name": "Nombre del competidor indirecto",
        "description": "Descripción y por qué es indirecto",
        "threat": "Alto/Medio/Bajo"
      }
    ],
    "competitiveMatrix": {
      "factors": ["Factor 1", "Factor 2", "Factor 3"],
      "ourPosition": "Descripción de nuestra posición"
    },
    "marketGaps": ["Oportunidad 1", "Oportunidad 2"],
    "dataSources": ["SABI/Orbis", "Crunchbase", "Web scraping"]
  }
}

Responde **solo** con el JSON.
    `.trim();

    // ────────────────── 5. Llamar a Gemini ──────────────────
    const result = await client.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: prompt
    });
    const responseText = result.text;
    await writeGeminiResponseToFile(responseText, 'generate_competition', project._id);

    // ────────────────── 6. Parsear respuesta ────────────────
    let generatedCompetition;
    try {
      const jsonString = (responseText.match(/\{[\s\S]*\}/) || [])[0] || responseText;
      generatedCompetition = JSON.parse(jsonString);

      if (!generatedCompetition.competition) {
        throw new Error('Formato de respuesta inválido');
      }
    } catch (err) {
      console.error('❌ Error al parsear JSON de Gemini:', err);
      return res.status(500).json({
        error: 'Error al procesar respuesta',
        message: 'La respuesta de Gemini no tiene el formato JSON esperado'
      });
    }

    // ────────────────── 7. Formatear análisis de competencia ────────────────
    const formattedCompetition = {
      id: uuidv4(),
      directCompetitors: Array.isArray(generatedCompetition.competition.directCompetitors)
        ? generatedCompetition.competition.directCompetitors.map(competitor => ({
            name: competitor.name || 'Competidor sin nombre',
            description: competitor.description || 'Sin descripción',
            marketShare: competitor.marketShare || 'No especificado',
            strengths: Array.isArray(competitor.strengths) ? competitor.strengths : [],
            weaknesses: Array.isArray(competitor.weaknesses) ? competitor.weaknesses : [],
            pricing: competitor.pricing || 'No especificado',
            valueProposition: competitor.valueProposition || 'No especificado'
          }))
        : [],
      indirectCompetitors: Array.isArray(generatedCompetition.competition.indirectCompetitors)
        ? generatedCompetition.competition.indirectCompetitors.map(competitor => ({
            name: competitor.name || 'Competidor sin nombre',
            description: competitor.description || 'Sin descripción',
            threat: competitor.threat || 'No especificado'
          }))
        : [],
      competitiveMatrix: {
        factors: Array.isArray(generatedCompetition.competition.competitiveMatrix?.factors)
          ? generatedCompetition.competition.competitiveMatrix.factors
          : [],
        ourPosition: generatedCompetition.competition.competitiveMatrix?.ourPosition || 'No especificado'
      },
      marketGaps: Array.isArray(generatedCompetition.competition.marketGaps)
        ? generatedCompetition.competition.marketGaps
        : [],
      dataSources: Array.isArray(generatedCompetition.competition.dataSources)
        ? generatedCompetition.competition.dataSources
        : [],
      createdAt: new Date(),
      generatedByAI: true
    };

    // ────────────────── 8. Responder ────────────────────────
    res.json({
      message: 'Análisis de competencia generado exitosamente con Gemini',
      project: { id: project._id, name: project.name },
      competition: formattedCompetition,
      metadata: {
        generatedAt: new Date(),
        aiModel: 'gemini-2.5-pro-preview-06-05',
        basedOn: {
          projectName: project.name,
          projectDescription: project.description,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateCompetenciaWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis de competencia con Gemini'
    });
  }
};

// 7. Función para generar Pricing & Disposición a Pagar
const generatePricingWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en pricing y análisis de mercado, genera un análisis completo de pricing y disposición a pagar para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS REQUERIDO:**

1. **Rangos de Precios del Mercado**
   - Precios mínimos, promedio y máximos
   - Segmentación por tipo de cliente
   - Modelos de pricing predominantes

2. **Elasticidad de Precio**
   - Sensibilidad al precio del mercado objetivo
   - Puntos de resistencia
   - Factores que influyen en la elasticidad

3. **Análisis de Competidores**
   - Estrategias de pricing de competidores principales
   - Posicionamiento por precio
   - Diferenciación de valor

4. **Disposición a Pagar**
   - Rangos por segmento de cliente
   - Factores que incrementan disposición a pagar
   - Métodos de captura de valor

5. **Recomendación de Precio**
   - Precio recomendado inicial
   - Estrategia de pricing sugerida
   - Justificación basada en valor

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "rangosPrecios": {
    "minimo": "valor",
    "promedio": "valor",
    "maximo": "valor",
    "segmentacion": ["segmento1", "segmento2"]
  },
  "elasticidad": {
    "nivel": "alta/media/baja",
    "factores": ["factor1", "factor2"],
    "puntosResistencia": ["punto1", "punto2"]
  },
  "competidores": [
    {
      "nombre": "Competidor",
      "precio": "valor",
      "estrategia": "descripción"
    }
  ],
  "disposicionPagar": {
    "segmentoAlto": "rango",
    "segmentoMedio": "rango",
    "segmentoBajo": "rango",
    "factoresIncremento": ["factor1", "factor2"]
  },
  "recomendacion": {
    "precioInicial": "valor",
    "estrategia": "descripción",
    "justificacion": "explicación"
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let pricingData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      pricingData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_pricing', text);

    res.json({
      success: true,
      message: 'Análisis de pricing generado exitosamente',
      data: {
        pricing: pricingData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generatePricingWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis de pricing con Gemini'
    });
  }
};

// 8. Función para generar Canales de Distribución
const generateCanalesDistribucionWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en canales de distribución y estrategia comercial, genera un análisis completo de canales de distribución para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS REQUERIDO:**

1. **Canales Actuales del Mercado**
   - Canales predominantes en la industria
   - Participación de mercado por canal
   - Tendencias de crecimiento

2. **Análisis de Efectividad**
   - ROI por canal
   - Costos de adquisición de clientes
   - Tiempo de conversión

3. **Canales Digitales**
   - Marketplaces relevantes
   - Plataformas de ecommerce
   - Canales de marketing digital

4. **Canales Tradicionales**
   - Distribuidores físicos
   - Retail tradicional
   - Canales B2B

5. **Recomendación de Estrategia**
   - Mix de canales óptimo
   - Priorización por fase
   - Métricas de seguimiento

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "canalesActuales": [
    {
      "nombre": "Canal",
      "participacion": "porcentaje",
      "tendencia": "creciente/estable/decreciente"
    }
  ],
  "efectividad": {
    "mejorROI": "canal",
    "menorCAC": "canal",
    "mayorConversion": "canal"
  },
  "canalesDigitales": [
    {
      "plataforma": "nombre",
      "relevancia": "alta/media/baja",
      "costoIngreso": "descripción"
    }
  ],
  "canalesTradicionales": [
    {
      "tipo": "nombre",
      "accesibilidad": "alta/media/baja",
      "requisitos": "descripción"
    }
  ],
  "recomendacion": {
    "mixOptimo": ["canal1", "canal2", "canal3"],
    "priorizacion": {
      "fase1": ["canal1"],
      "fase2": ["canal2"],
      "fase3": ["canal3"]
    },
    "metricas": ["metrica1", "metrica2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let canalesData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      canalesData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_canales_distribucion', text);

    res.json({
      success: true,
      message: 'Análisis de canales de distribución generado exitosamente',
      data: {
        canales: canalesData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateCanalesDistribucionWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis de canales de distribución con Gemini'
    });
  }
};

// 9. Función para generar Regulación & Barreras de Entrada
const generateRegulacionBarrerasWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en regulación y análisis de barreras de entrada, genera un análisis completo para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS REQUERIDO:**

1. **Marco Regulatorio**
   - Licencias requeridas
   - Normativas aplicables
   - Organismos reguladores

2. **Barreras de Entrada**
   - Barreras legales
   - Barreras económicas
   - Barreras tecnológicas
   - Barreras de mercado

3. **Riesgos Legales**
   - Riesgos de cumplimiento
   - Penalizaciones potenciales
   - Cambios regulatorios esperados

4. **Requisitos de Entrada**
   - Capital mínimo
   - Certificaciones necesarias
   - Tiempo de tramitación

5. **Estrategias de Mitigación**
   - Plan de cumplimiento
   - Estrategias de entrada
   - Contingencias legales

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "marcoRegulatorio": {
    "licencias": ["licencia1", "licencia2"],
    "normativas": ["norma1", "norma2"],
    "organismos": ["organismo1", "organismo2"]
  },
  "barrerasEntrada": {
    "legales": [
      {
        "barrera": "descripción",
        "impacto": "alto/medio/bajo",
        "dificultad": "alta/media/baja"
      }
    ],
    "economicas": ["barrera1", "barrera2"],
    "tecnologicas": ["barrera1", "barrera2"],
    "mercado": ["barrera1", "barrera2"]
  },
  "riesgosLegales": [
    {
      "riesgo": "descripción",
      "probabilidad": "alta/media/baja",
      "impacto": "alto/medio/bajo",
      "mitigacion": "estrategia"
    }
  ],
  "requisitosEntrada": {
    "capitalMinimo": "cantidad",
    "certificaciones": ["cert1", "cert2"],
    "tiempoTramitacion": "periodo"
  },
  "estrategiasMitigacion": {
    "planCumplimiento": "descripción",
    "estrategiaEntrada": "descripción",
    "contingencias": ["plan1", "plan2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let regulacionData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      regulacionData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_regulacion_barreras', text);

    res.json({
      success: true,
      message: 'Análisis de regulación y barreras generado exitosamente',
      data: {
        regulacion: regulacionData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateRegulacionBarrerasWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis de regulación y barreras con Gemini'
    });
  }
};

// 10. Función para generar Análisis PESTLE
const generateAnalisisPESTLEWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en análisis estratégico, genera un análisis PESTLE completo para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS PESTLE REQUERIDO:**

1. **Factores Políticos**
   - Estabilidad política
   - Políticas gubernamentales
   - Regulaciones comerciales

2. **Factores Económicos**
   - Crecimiento económico
   - Inflación y tipos de cambio
   - Poder adquisitivo

3. **Factores Sociales**
   - Demografía
   - Cambios culturales
   - Estilo de vida

4. **Factores Tecnológicos**
   - Innovación tecnológica
   - Automatización
   - I+D

5. **Factores Legales**
   - Legislación laboral
   - Protección de datos
   - Propiedad intelectual

6. **Factores Ecológicos**
   - Sostenibilidad
   - Cambio climático
   - Regulaciones ambientales

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "politicos": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "economicos": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "sociales": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "tecnologicos": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "legales": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "ecologicos": [
    {
      "factor": "descripción",
      "impacto": "positivo/negativo/neutro",
      "intensidad": "alta/media/baja",
      "probabilidad": "alta/media/baja"
    }
  ],
  "resumen": {
    "oportunidadesPrincipales": ["oportunidad1", "oportunidad2"],
    "amenazasPrincipales": ["amenaza1", "amenaza2"],
    "recomendaciones": ["recomendacion1", "recomendacion2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let pestleData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      pestleData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_analisis_pestle', text);

    res.json({
      success: true,
      message: 'Análisis PESTLE generado exitosamente',
      data: {
        pestle: pestleData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateAnalisisPESTLEWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis PESTLE con Gemini'
    });
  }
};

// 11. Función para generar Porter 5 Fuerzas / SWOT
const generatePorterSWOTWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en análisis estratégico, genera un análisis completo de Porter 5 Fuerzas y SWOT para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS REQUERIDO:**

**PORTER 5 FUERZAS:**
1. **Poder de Negociación de Proveedores**
2. **Poder de Negociación de Clientes**
3. **Amenaza de Nuevos Entrantes**
4. **Amenaza de Productos Sustitutos**
5. **Rivalidad entre Competidores**

**ANÁLISIS SWOT:**
1. **Fortalezas (Strengths)**
2. **Debilidades (Weaknesses)**
3. **Oportunidades (Opportunities)**
4. **Amenazas (Threats)**

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "porter5Fuerzas": {
    "poderProveedores": {
      "nivel": "alto/medio/bajo",
      "factores": ["factor1", "factor2"],
      "impacto": "descripción"
    },
    "poderClientes": {
      "nivel": "alto/medio/bajo",
      "factores": ["factor1", "factor2"],
      "impacto": "descripción"
    },
    "amenazaNuevosEntrantes": {
      "nivel": "alto/medio/bajo",
      "factores": ["factor1", "factor2"],
      "impacto": "descripción"
    },
    "amenazaSustitutos": {
      "nivel": "alto/medio/bajo",
      "factores": ["factor1", "factor2"],
      "impacto": "descripción"
    },
    "rivalidadCompetidores": {
      "nivel": "alto/medio/bajo",
      "factores": ["factor1", "factor2"],
      "impacto": "descripción"
    }
  },
  "swot": {
    "fortalezas": [
      {
        "fortaleza": "descripción",
        "impacto": "alto/medio/bajo",
        "aprovechamiento": "estrategia"
      }
    ],
    "debilidades": [
      {
        "debilidad": "descripción",
        "impacto": "alto/medio/bajo",
        "mitigacion": "estrategia"
      }
    ],
    "oportunidades": [
      {
        "oportunidad": "descripción",
        "potencial": "alto/medio/bajo",
        "estrategia": "como aprovecharla"
      }
    ],
    "amenazas": [
      {
        "amenaza": "descripción",
        "probabilidad": "alta/media/baja",
        "contingencia": "plan de respuesta"
      }
    ]
  },
  "estrategiasIntegradas": {
    "fortalezasOportunidades": ["estrategia1", "estrategia2"],
    "debilidadesOportunidades": ["estrategia1", "estrategia2"],
    "fortalezasAmenazas": ["estrategia1", "estrategia2"],
    "debilidadesAmenazas": ["estrategia1", "estrategia2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let porterSwotData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      porterSwotData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_porter_swot', text);

    res.json({
      success: true,
      message: 'Análisis Porter 5 Fuerzas y SWOT generado exitosamente',
      data: {
        analisisEstrategico: porterSwotData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generatePorterSWOTWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar análisis Porter y SWOT con Gemini'
    });
  }
};

// 12. Función para generar Proyección de Demanda
const generateProyeccionDemandaWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en proyección de demanda y análisis predictivo, genera una proyección completa de demanda para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**PROYECCIÓN REQUERIDA:**

1. **Análisis Histórico**
   - Tendencias de mercado pasadas
   - Patrones estacionales
   - Factores de crecimiento

2. **Proyección a 3-5 años**
   - Escenario conservador
   - Escenario base
   - Escenario optimista

3. **Factores de Demanda**
   - Drivers de crecimiento
   - Limitantes del mercado
   - Variables externas

4. **Segmentación de Demanda**
   - Por tipo de cliente
   - Por región geográfica
   - Por canal de venta

5. **Metodología y Supuestos**
   - Modelos utilizados
   - Supuestos clave
   - Nivel de confianza

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "analisisHistorico": {
    "tendenciaGeneral": "creciente/estable/decreciente",
    "tasaCrecimientoAnual": "porcentaje",
    "patronesEstacionales": ["patron1", "patron2"],
    "factoresCrecimiento": ["factor1", "factor2"]
  },
  "proyeccion": {
    "año1": {
      "conservador": "valor",
      "base": "valor",
      "optimista": "valor"
    },
    "año2": {
      "conservador": "valor",
      "base": "valor",
      "optimista": "valor"
    },
    "año3": {
      "conservador": "valor",
      "base": "valor",
      "optimista": "valor"
    },
    "año4": {
      "conservador": "valor",
      "base": "valor",
      "optimista": "valor"
    },
    "año5": {
      "conservador": "valor",
      "base": "valor",
      "optimista": "valor"
    }
  },
  "factoresDemanda": {
    "driversCrecimiento": ["driver1", "driver2"],
    "limitantes": ["limitante1", "limitante2"],
    "variablesExternas": ["variable1", "variable2"]
  },
  "segmentacion": {
    "porCliente": [
      {
        "segmento": "nombre",
        "participacion": "porcentaje",
        "crecimientoEsperado": "porcentaje"
      }
    ],
    "porRegion": [
      {
        "region": "nombre",
        "participacion": "porcentaje",
        "potencial": "alto/medio/bajo"
      }
    ],
    "porCanal": [
      {
        "canal": "nombre",
        "participacion": "porcentaje",
        "tendencia": "creciente/estable/decreciente"
      }
    ]
  },
  "metodologia": {
    "modelosUtilizados": ["modelo1", "modelo2"],
    "supuestosClave": ["supuesto1", "supuesto2"],
    "nivelConfianza": "porcentaje",
    "limitaciones": ["limitacion1", "limitacion2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let proyeccionData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      proyeccionData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_proyeccion_demanda', text);

    res.json({
      success: true,
      message: 'Proyección de demanda generada exitosamente',
      data: {
        proyeccion: proyeccionData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateProyeccionDemandaWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar proyección de demanda con Gemini'
    });
  }
};

// 13. Función para generar Conclusiones & Recomendaciones
const generateConclusionesRecomendacionesWithGemini = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        error: 'API key de Gemini requerida',
        message: 'Por favor proporciona tu API key de Gemini'
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto especificado no existe'
      });
    }

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const prompt = `
Como experto en análisis estratégico y consultoría de negocios, genera conclusiones y recomendaciones finales para:

**INFORMACIÓN DEL PROYECTO:**
- Nombre: ${project.name}
- Descripción: ${project.description}
- Industria: ${project.industry}
- Tipo: ${project.type}
- Stack Tecnológico: ${project.techStack}

**ANÁLISIS FINAL REQUERIDO:**

1. **Viabilidad del Proyecto**
   - Análisis Go/No-Go
   - Factores críticos de éxito
   - Riesgos principales

2. **Segmentos Prioritarios**
   - Nichos más atractivos
   - Criterios de priorización
   - Estrategia de entrada

3. **Estrategia de Pricing**
   - Precio recomendado
   - Modelo de pricing
   - Estrategia de penetración

4. **Plan de Acción**
   - Fases de implementación
   - Hitos clave
   - Recursos necesarios

5. **Métricas de Seguimiento**
   - KPIs principales
   - Frecuencia de medición
   - Umbrales de alerta

**FORMATO DE RESPUESTA:**
Responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "viabilidad": {
    "decision": "go/no-go/condicional",
    "puntuacion": "1-10",
    "justificacion": "explicación detallada",
    "factoresCriticos": ["factor1", "factor2"],
    "riesgosPrincipales": [
      {
        "riesgo": "descripción",
        "impacto": "alto/medio/bajo",
        "probabilidad": "alta/media/baja",
        "mitigacion": "estrategia"
      }
    ]
  },
  "segmentosPrioritarios": [
    {
      "segmento": "nombre",
      "prioridad": "alta/media/baja",
      "potencial": "descripción",
      "estrategiaEntrada": "descripción",
      "recursosNecesarios": ["recurso1", "recurso2"]
    }
  ],
  "estrategiaPricing": {
    "precioRecomendado": "valor",
    "modeloPricing": "descripción",
    "estrategiaPenetracion": "descripción",
    "elasticidadEsperada": "alta/media/baja",
    "competitividadPrecio": "alta/media/baja"
  },
  "planAccion": {
    "fase1": {
      "duracion": "periodo",
      "objetivos": ["objetivo1", "objetivo2"],
      "actividades": ["actividad1", "actividad2"],
      "recursos": ["recurso1", "recurso2"]
    },
    "fase2": {
      "duracion": "periodo",
      "objetivos": ["objetivo1", "objetivo2"],
      "actividades": ["actividad1", "actividad2"],
      "recursos": ["recurso1", "recurso2"]
    },
    "fase3": {
      "duracion": "periodo",
      "objetivos": ["objetivo1", "objetivo2"],
      "actividades": ["actividad1", "actividad2"],
      "recursos": ["recurso1", "recurso2"]
    }
  },
  "metricas": {
    "kpisPrincipales": [
      {
        "kpi": "nombre",
        "descripcion": "que mide",
        "frecuencia": "diaria/semanal/mensual",
        "umbralAlerta": "valor",
        "responsable": "quien mide"
      }
    ],
    "dashboard": {
      "herramientaRecomendada": "nombre",
      "frecuenciaReporte": "periodo",
      "audiencia": ["stakeholder1", "stakeholder2"]
    }
  },
  "recomendacionesFinales": {
    "accionesInmediatas": ["accion1", "accion2"],
    "inversionRequerida": "estimación",
    "tiempoROI": "periodo",
    "factoresExito": ["factor1", "factor2"],
    "siguientesPasos": ["paso1", "paso2"]
  }
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    let conclusionesData;
    try {
      const cleanedText = text.replace(/```json\n?|```\n?/g, '').trim();
      conclusionesData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('❌ Error al parsear respuesta de Gemini:', parseError);
      return res.status(500).json({
        error: 'Error al procesar respuesta de Gemini',
        message: 'La respuesta no tiene el formato JSON esperado',
        rawResponse: text
      });
    }

    await writeGeminiResponseToFile(project._id, 'generate_conclusiones_recomendaciones', text);

    res.json({
      success: true,
      message: 'Conclusiones y recomendaciones generadas exitosamente',
      data: {
        conclusiones: conclusionesData,
        projectInfo: {
          id: project._id,
          name: project.name,
          description: project.description,
          industry: project.industry,
          type: project.type,
          techStack: project.techStack
        }
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateConclusionesRecomendacionesWithGemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar conclusiones y recomendaciones con Gemini'
    });
  }
};

// @desc    Generate market study using Gemini
// @route   POST /api/projects/:id/generate-market-study
// @access  Private
const generateestudiodemercadowithgemini = async (req, res) => {
  try {
    console.log('🚀 Iniciando generación completa de estudio de mercado con Gemini');

    // ────────────────── 1. Cargar proyecto ──────────────────
    const project = await Project.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      isActive: true
    });
    if (!project) {
      return res.status(404).json({
        error: 'Proyecto no encontrado',
        message: 'El proyecto no existe o no tienes permisos para modificarlo'
      });
    }

    // ────────────────── 2. Validar API-KEY de entorno ──────────────────
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Configuración del servidor incompleta',
        message: 'La API key de Gemini no está configurada en el servidor'
      });
    }

    // ────────────────── 3. Ejecutar análisis secuencialmente ──────────────────
    const resultados = {};
    const errores = [];

    // Lista de funciones a ejecutar en orden
    const funcionesAnalisis = [
      { nombre: 'Resumen Ejecutivo', funcion: generateResumenEjecutivoWithGemini, key: 'resumenEjecutivo' },
      { nombre: 'Definición del Mercado', funcion: generateDefinicionMercadoWithGemini, key: 'definicionMercado' },
      { nombre: 'Segmentación', funcion: generateSegmentacionWithGemini, key: 'segmentacion' },
      { nombre: 'Tamaño de Mercado', funcion: generateTamanoMercadoWithGemini, key: 'tamanoMercado' },
      { nombre: 'Tendencias', funcion: generateTendenciasWithGemini, key: 'tendencias' },
      { nombre: 'Competencia', funcion: generateCompetenciaWithGemini, key: 'competencia' },
      { nombre: 'Pricing', funcion: generatePricingWithGemini, key: 'pricing' },
      { nombre: 'Canales de Distribución', funcion: generateCanalesDistribucionWithGemini, key: 'canalesDistribucion' },
      { nombre: 'Regulación y Barreras', funcion: generateRegulacionBarrerasWithGemini, key: 'regulacionBarreras' },
      { nombre: 'Análisis PESTLE', funcion: generateAnalisisPESTLEWithGemini, key: 'analisisPESTLE' },
      { nombre: 'Porter y SWOT', funcion: generatePorterSWOTWithGemini, key: 'porterSWOT' },
      { nombre: 'Proyección de Demanda', funcion: generateProyeccionDemandaWithGemini, key: 'proyeccionDemanda' },
      { nombre: 'Conclusiones y Recomendaciones', funcion: generateConclusionesRecomendacionesWithGemini, key: 'conclusionesRecomendaciones' }
    ];

    console.log(`📊 Ejecutando ${funcionesAnalisis.length} análisis de mercado...`);

    // Ejecutar cada función secuencialmente
    for (let i = 0; i < funcionesAnalisis.length; i++) {
      const { nombre, funcion, key } = funcionesAnalisis[i];
      
      try {
        console.log(`🔄 Ejecutando ${i + 1}/${funcionesAnalisis.length}: ${nombre}`);
        
        // Crear un mock request/response para cada función
        const mockReq = {
          params: { id: project._id }, // Cambiar 'projectId' por 'id'
          user: { userId: req.user.userId }, // Agregar el objeto user
          body: {} // Ya no necesitamos enviar apiKey
        };
        
        const mockRes = {
          json: (data) => data,
          status: (code) => ({ json: (data) => ({ status: code, ...data }) })
        };

        // Ejecutar la función
        const resultado = await funcion(mockReq, mockRes);
        
        if (resultado && resultado.message) {
          resultados[key] = resultado;
          console.log(`✅ ${nombre} completado exitosamente`);
        } else {
          console.log(`⚠️ ${nombre} falló:`, resultado?.message || 'Error desconocido');
          errores.push({ seccion: nombre, error: resultado?.message || 'Error desconocido' });
        }
        
        // Pequeña pausa entre llamadas para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error en ${nombre}:`, error.message);
        errores.push({ seccion: nombre, error: error.message });
      }
    }

    // ────────────────── 4. Compilar estudio completo ──────────────────
    const estudioCompleto = {
      id: uuidv4(),
      proyecto: {
        id: project._id,
        nombre: project.name,
        descripcion: project.description,
        industria: project.industry,
        tipo: project.type,
        techStack: project.techStack
      },
      analisis: resultados,
      resumen: {
        seccionesCompletadas: Object.keys(resultados).length,
        seccionesTotales: funcionesAnalisis.length,
        errores: errores,
        porcentajeCompletado: Math.round((Object.keys(resultados).length / funcionesAnalisis.length) * 100)
      },
      metadata: {
        generadoEn: new Date(),
        modeloIA: 'gemini-2.0-flash-exp',
        tiempoGeneracion: 'Aproximadamente ' + funcionesAnalisis.length + ' minutos',
        version: '1.0'
      }
    };

    // ────────────────── 5. Guardar resultado completo ──────────────────
    const resumenCompleto = JSON.stringify(estudioCompleto, null, 2);
    await writeGeminiResponseToFile(project._id, 'estudio_mercado_completo', resumenCompleto);

    // ────────────────── 6. Responder ────────────────────────
    console.log(`🎉 Estudio de mercado completo generado. ${Object.keys(resultados).length}/${funcionesAnalisis.length} secciones completadas`);
    
    res.json({
      success: true,
      message: `Estudio de mercado completo generado exitosamente. ${Object.keys(resultados).length}/${funcionesAnalisis.length} secciones completadas.`,
      data: estudioCompleto,
      estadisticas: {
        seccionesExitosas: Object.keys(resultados).length,
        seccionesConError: errores.length,
        porcentajeExito: Math.round((Object.keys(resultados).length / funcionesAnalisis.length) * 100)
      }
    });

  } catch (error) {
    console.error('❌ Error general en generateestudiodemercadowithgemini:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      message: 'Error al generar estudio de mercado completo con Gemini',
      details: error.message
    });
  }
};

module.exports = {
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
  saveUserStoriesToPage,
  generateBackendFromAPI,
  getPaginasIa,
  actualizarPagina,
  generatePagesWithGemini,
  generateAdditionalPagesWithGemini,
  addMultiplePages,
  generarProyectoConIA,
  generarpromptinicial,
  generateestudiodemercadowithgemini
};