const { GoogleGenAI } = require('@google/genai');
const fs = require('fs-extra');
const path = require('path');
const simpleGit = require('simple-git');
const JSON5 = require('json5');
const { z } = require('zod');
const extractFunctions = require('./utils/extractFunctions');

// Helper function to write Gemini responses to files
const writeGeminiResponseToFile = async (responseText, fileName, projectId) => {
  try {
    const responseDir = path.join(__dirname, 'gemini-responses');
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

// Función principal para generar backend desde API
const generateBackendFromAPI = async (project, options = {}) => {
  const { outputPath = './generated-backend', includeDatabase = true, framework = 'express' } = options;
  const createAdvancedControllersPromptWithContext = (fileName, fileContent, framework, includeDatabase, existingModels = []) => {
    const modelsContext = existingModels.length > 0 
      ? `\n\nMODELOS YA GENERADOS (úsalos como referencia):\n${existingModels.map(m => `- ${m.name}: ${m.description || 'Modelo generado'}`).join('\n')}`
      : '';
  
    const modelImports = existingModels.length > 0
      ? `\n\nIMPORTS DE MODELOS DISPONIBLES:\n${existingModels.map(m => `const ${m.name} = require('../models/${m.fileName}');`).join('\n')}`
      : '';
  
    return `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera controladores con service layer en ${framework} con Node.js.
  
  Contenido del archivo:
  \`\`\`
  ${fileContent.substring(0, 4000)}
  \`\`\`${modelsContext}${modelImports}
  
  Instrucciones Específicas para CONTROLADORES Y SERVICIOS:
  1. USA LOS MODELOS YA GENERADOS como base para tus operaciones CRUD
  2. Crea servicios en services/ que interactúen directamente con los modelos
  3. Los controladores deben ser orquestadores que llamen a los servicios
  4. Cada endpoint debe soportar paginación (page, limit), filtros ?field=value, ordenación ?sort=-createdAt
  5. Usa transacciones de Mongoose cuando se escriban >1 colección
  6. Implementa respuesta estandarizada { data, meta, error }
  7. Manejo completo de errores con códigos HTTP apropiados
  8. Validación de entrada en servicios usando los esquemas de los modelos
  9. Logging estructurado con correlación de requests
  10. Separación clara de responsabilidades
  11. ASEGÚRATE de importar y usar los modelos existentes correctamente
  
  Formato de respuesta (JSON):
  \`\`\`json
  {
    "controllers": [
      {
        "name": "NombreController",
        "fileName": "nombreController.js",
        "content": "código del controlador como orquestador que usa los servicios",
        "description": "descripción del controlador"
      }
    ],
    "services": [
      {
        "name": "NombreService",
        "fileName": "nombreService.js",
        "content": "código del servicio con lógica de negocio que usa los modelos",
        "description": "descripción del servicio"
      }
    ]
  }
  \`\`\`
  
  Genera código production-ready que use coherentemente los modelos ya generados.`;
  };
  
  // Prompt mejorado para rutas CON CONTEXTO de modelos, controladores y servicios
  const createAdvancedRoutesPromptWithContext = (fileName, fileContent, framework, includeDatabase, existingModels = [], existingControllers = [], existingServices = []) => {
    const modelsContext = existingModels.length > 0 
      ? `\n\nMODELOS DISPONIBLES:\n${existingModels.map(m => `- ${m.name}: ${m.description || 'Modelo generado'}`).join('\n')}`
      : '';
  
    const controllersContext = existingControllers.length > 0
      ? `\n\nCONTROLADORES DISPONIBLES:\n${existingControllers.map(c => `- ${c.name}: ${c.description || 'Controlador generado'}`).join('\n')}`
      : '';
  
    const servicesContext = existingServices.length > 0
      ? `\n\nSERVICIOS DISPONIBLES:\n${existingServices.map(s => `- ${s.name}: ${s.description || 'Servicio generado'}`).join('\n')}`
      : '';
  
    const controllerImports = existingControllers.length > 0
      ? `\n\nIMPORTS DE CONTROLADORES DISPONIBLES:\n${existingControllers.map(c => `const ${c.name} = require('../controllers/${c.fileName}');`).join('\n')}`
      : '';
  
    return `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera rutas completas con seguridad en ${framework} con Node.js.
  
  Contenido del archivo:
  \`\`\`
  ${fileContent.substring(0, 4000)}
  \`\`\`${modelsContext}${controllersContext}${servicesContext}${controllerImports}
  
  Instrucciones Específicas para RUTAS AVANZADAS:
  1. USA LOS CONTROLADORES YA GENERADOS - conecta las rutas con los métodos correctos
  2. Para cada ruta agrega:
     - Middleware auth (JWT) con roles
     - validate(schema) usando zod-express basado en los modelos
     - rateLimiter (10 req/min)
     - prefijo /api/v1
  3. Implementa versioning de API
  4. Rate-limiting por IP
  5. Validación de esquema robusta basada en los modelos existentes
  6. Protección con JWT + roles (admin, user, etc.)
  7. Middleware de logging y métricas
  8. Documentación inline para Swagger
  9. Manejo de errores centralizado
  10. ASEGÚRATE de que las rutas llamen a los métodos correctos de los controladores
  11. Los parámetros de las rutas deben coincidir con los esperados por los controladores
  
  Formato de respuesta (JSON):
  \`\`\`json
  {
    "routes": [
      {
        "name": "NombreRoute",
        "fileName": "nombreRoute.js",
        "content": "código completo de las rutas que usa los controladores existentes",
        "description": "descripción de las rutas y su conexión con controladores"
      }
    ]
  }
  \`\`\`
  
  Genera rutas production-ready que se conecten coherentemente con los controladores y servicios ya generados.`;
  };
  const validateBackendCoherence = (backendStructure) => {
    const issues = [];
    const warnings = [];
    
    // Validar que los controladores usen modelos existentes
    const modelNames = backendStructure.models.map(m => m.name.toLowerCase());
    
    backendStructure.controllers.forEach(controller => {
      const content = controller.content.toLowerCase();
      const usedModels = modelNames.filter(modelName => 
        content.includes(modelName.toLowerCase()) || 
        content.includes(`require('../models/${modelName.toLowerCase()}`)
      );
      
      if (usedModels.length === 0) {
        warnings.push(`Controlador ${controller.name} no parece usar ningún modelo existente`);
      }
    });
    
    // Validar que las rutas usen controladores existentes
    const controllerNames = backendStructure.controllers.map(c => c.name.toLowerCase());
    
    backendStructure.routes.forEach(route => {
      const content = route.content.toLowerCase();
      const usedControllers = controllerNames.filter(controllerName => 
        content.includes(controllerName.toLowerCase()) ||
        content.includes(`require('../controllers/${controllerName.toLowerCase()}`)
      );
      
      if (usedControllers.length === 0) {
        warnings.push(`Ruta ${route.name} no parece usar ningún controlador existente`);
      }
    });
    
    // ✨ NUEVO: Validar que TODOS los declaredFns de cada apiFile existen ya
    apiFiles.forEach(f => {
      if (!f.declaredFns || !f.declaredFns.length) return;
      
      const allCode = [
        ...backendStructure.controllers.map(c => c.content),
        ...backendStructure.services.map(s => s.content)
      ].join(' ').toLowerCase();

      const notImplemented = f.declaredFns.filter(fn =>
        !allCode.includes(fn.toLowerCase())
      );
      
      if (notImplemented.length) {
        issues.push(`API ${f.name}: funciones sin implementar → ${notImplemented.join(', ')}`);
      }
    });
    
    return { issues, warnings };
  };
  
  
  console.log('🚀 generateBackendFromAPI - Iniciando generación de backend completo');
  console.log('📋 Parámetros:', { projectId: project._id, outputPath, includeDatabase, framework });

  // Verificar que la API key de Gemini esté configurada
  if (!process.env.GEMINI_API_KEY) {
    console.log('❌ API key de Gemini no configurada');
    throw new Error('La API key de Google Gemini no está configurada');
  }

  if (!project.githubUrl) {
    console.log('❌ URL de GitHub no configurada');
    throw new Error('El proyecto debe tener una URL de GitHub configurada');
  }

  console.log(`✅ Proyecto encontrado: ${project.name}`);
  console.log(`🔗 GitHub URL: ${project.githubUrl}`);

  // Crear directorio temporal para clonar el repositorio
  const tempDir = path.join(__dirname, 'temp', `backend_gen_${project._id}_${Date.now()}`);
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
      throw new Error('No se encontró una carpeta "api", "API", "routes" o "endpoints" en el repositorio');
    }
    console.log(`✅ Carpeta API encontrada: ${apiDir}`);

    // Analizar archivos API
    console.log('🔍 Analizando archivos API...');
    const apiFiles = await getAPIFiles(apiDir);
    console.log(`📄 Archivos API encontrados: ${apiFiles.length}`);
    
    if (apiFiles.length === 0) {
      console.log('❌ No se encontraron archivos API');
      throw new Error('No se encontraron archivos de API en el directorio especificado');
    }

    // Inicializar Google Gemini
    console.log('🤖 Inicializando Google Gemini...');
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log('✅ Cliente Gemini inicializado correctamente');
  
    const backendStructure = {
      models: [],
      controllers: [],
      routes: [],
      services: [],
      middleware: [],
      config: [],
      utils: [],
      tests: []
    };
    
    // Agregar esta línea:
    const generatedFiles = [];
    const createMissingFnsPrompt = (fileName, fileContent, missingFns, context) => `
Analiza nuevamente "${fileName}". Las **siguientes funciones** no tienen aún endpoint:
${missingFns.map(f => `- ${f}`).join('\n')}

CONSIDERA el backend ya generado (modelos, controladores y rutas existentes).
Solo debes generar lo mínimo para exponer estas funciones:

1. Métodos en el controlador (orquestador + llamado a service).
2. Services con la lógica correspondiente.
3. Rutas /api/v1/* que llamen a esos métodos.
4. Actualiza Swagger en memoria (no hace falta devolverlo aquí).

Contexto del backend existente:
- Modelos: ${context.models.map(m => m.name).join(', ')}
- Controladores: ${context.controllers.map(c => c.name).join(', ')}
- Servicios: ${context.services.map(s => s.name).join(', ')}

Formato de respuesta:
\`\`\`json
{
  "controllers": [
    {
      "name": "NombreController",
      "fileName": "nombreController.js",
      "content": "código del controlador que implementa las funciones faltantes",
      "description": "descripción"
    }
  ],
  "services": [
    {
      "name": "NombreService",
      "fileName": "nombreService.js",
      "content": "código del servicio con lógica para las funciones faltantes",
      "description": "descripción"
    }
  ],
  "routes": [
    {
      "name": "NombreRoute",
      "fileName": "nombreRoute.js",
      "content": "código de rutas para las funciones faltantes",
      "description": "descripción"
    }
  ]
}
\`\`\`
`;
        const createFilesFromResponse = async (analysis, outputPath, apiFileName) => {
      const createdFiles = [];
      const fullOutputPath = path.resolve(outputPath);
      
      try {
        // Crear directorio de salida si no existe
        await fs.ensureDir(fullOutputPath);
        
        // Crear directorios necesarios
        const directories = ['models', 'controllers', 'routes', 'services', 'middleware', 'config', 'utils', '__tests__'];
        for (const dir of directories) {
          await fs.ensureDir(path.join(fullOutputPath, dir));
        }
        
        // Crear archivos de modelos inmediatamente
        if (analysis.models && analysis.models.length > 0) {
          for (const model of analysis.models) {
            const filePath = path.join(fullOutputPath, 'models', model.fileName);
            await fs.writeFile(filePath, model.content, 'utf8');
            console.log(`✅ Modelo creado: ${model.fileName}`);
            createdFiles.push({
              type: 'model',
              name: model.name,
              fileName: model.fileName,
              path: filePath,
              description: model.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de controladores inmediatamente
        if (analysis.controllers && analysis.controllers.length > 0) {
          for (const controller of analysis.controllers) {
            const filePath = path.join(fullOutputPath, 'controllers', controller.fileName);
            await fs.writeFile(filePath, controller.content, 'utf8');
            console.log(`✅ Controlador creado: ${controller.fileName}`);
            createdFiles.push({
              type: 'controller',
              name: controller.name,
              fileName: controller.fileName,
              path: filePath,
              description: controller.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de servicios inmediatamente
        if (analysis.services && analysis.services.length > 0) {
          for (const service of analysis.services) {
            const filePath = path.join(fullOutputPath, 'services', service.fileName);
            await fs.writeFile(filePath, service.content, 'utf8');
            console.log(`✅ Servicio creado: ${service.fileName}`);
            createdFiles.push({
              type: 'service',
              name: service.name,
              fileName: service.fileName,
              path: filePath,
              description: service.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de rutas inmediatamente
        if (analysis.routes && analysis.routes.length > 0) {
          for (const route of analysis.routes) {
            const filePath = path.join(fullOutputPath, 'routes', route.fileName);
            await fs.writeFile(filePath, route.content, 'utf8');
            console.log(`✅ Ruta creada: ${route.fileName}`);
            createdFiles.push({
              type: 'route',
              name: route.name,
              fileName: route.fileName,
              path: filePath,
              description: route.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de middleware inmediatamente
        if (analysis.middleware && analysis.middleware.length > 0) {
          for (const middleware of analysis.middleware) {
            const filePath = path.join(fullOutputPath, 'middleware', middleware.fileName);
            await fs.writeFile(filePath, middleware.content, 'utf8');
            console.log(`✅ Middleware creado: ${middleware.fileName}`);
            createdFiles.push({
              type: 'middleware',
              name: middleware.name,
              fileName: middleware.fileName,
              path: filePath,
              description: middleware.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de configuración inmediatamente
        if (analysis.config && analysis.config.length > 0) {
          for (const config of analysis.config) {
            const filePath = path.join(fullOutputPath, 'config', config.fileName);
            await fs.writeFile(filePath, config.content, 'utf8');
            console.log(`✅ Configuración creada: ${config.fileName}`);
            createdFiles.push({
              type: 'config',
              name: config.name,
              fileName: config.fileName,
              path: filePath,
              description: config.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de utilidades inmediatamente
        if (analysis.utils && analysis.utils.length > 0) {
          for (const util of analysis.utils) {
            const filePath = path.join(fullOutputPath, 'utils', util.fileName);
            await fs.writeFile(filePath, util.content, 'utf8');
            console.log(`✅ Utilidad creada: ${util.fileName}`);
            createdFiles.push({
              type: 'util',
              name: util.name,
              fileName: util.fileName,
              path: filePath,
              description: util.description,
              source: apiFileName
            });
          }
        }
        
        // Crear archivos de tests inmediatamente
        if (analysis.tests && analysis.tests.length > 0) {
          for (const test of analysis.tests) {
            const filePath = path.join(fullOutputPath, '__tests__', test.fileName);
            await fs.writeFile(filePath, test.content, 'utf8');
            console.log(`✅ Test creado: ${test.fileName}`);
            createdFiles.push({
              type: 'test',
              name: test.name,
              fileName: test.fileName,
              path: filePath,
              description: test.description,
              source: apiFileName
            });
          }
        }
        
        return createdFiles;
        
      } catch (error) {
        console.error(`❌ Error creando archivos para ${apiFileName}:`, error.message);
        return [];
      }
    };
    // Procesar cada archivo API con prompts mejorados
    // Constantes para el sistema de cobertura
    const MAX_COVERAGE_PASSES = 3;
    const MAX_RETRIES_PER_FILE = 3; // ✨ NUEVO: máximo de reintentos por archivo
    
    // Procesar cada archivo API individualmente con múltiples reintentos
    for (const apiFile of apiFiles) {
      console.log(`\n🎯 === PROCESANDO ARCHIVO: ${apiFile.name} ===`);
      
      try {
        console.log(`📁 Ruta del archivo: ${apiFile.path}`);
        
        console.log('📖 Leyendo contenido del archivo...');
        const apiContent = await fs.readFile(apiFile.path, 'utf8');
        console.log(`📝 Contenido leído: ${apiContent.length} caracteres`);
        
        // ✨ Extraer funciones declaradas en el archivo API
        console.log('🔍 Extrayendo funciones declaradas...');
        const declaredFns = await extractFunctions(apiFile.path);
        apiFile.declaredFns = declaredFns;
        console.log(`📋 Funciones encontradas: [${declaredFns.join(', ')}]`);
    
        // --- PASO 1: Generar Modelos (solo una vez) ---
        console.log('📝 Creando prompt para Modelos avanzados...');
        const modelsPrompt = createAdvancedModelsPrompt(apiFile.name, apiContent, framework, includeDatabase);
        console.log(`🤖 Enviando solicitud a Gemini para Modelos...`);
        let response = await retryGeminiCall(client, modelsPrompt);
        
        // Escribir respuesta de Gemini en archivo
        await writeGeminiResponseToFile(response.text, `backend_modelos_${apiFile.name}`, project._id);
        
        let analysis = parseBackendAnalysisResponse(response.text);
        console.log(`📚 Análisis de Modelos completado para: ${apiFile.name}`);
        
        // Crear archivos de modelos inmediatamente
        const modelFiles = await createFilesFromResponse(analysis, outputPath, apiFile.name);
        generatedFiles.push(...modelFiles);
        
        // Crear archivos funcionales en el directorio principal de modelos
        if (analysis.models && analysis.models.length > 0) {
          for (const model of analysis.models) {
            const mainModelPath = path.join(__dirname, 'models', model.fileName);
            await fs.ensureDir(path.dirname(mainModelPath));
            await fs.writeFile(mainModelPath, model.content, 'utf8');
            console.log(`✅ Modelo funcional creado en directorio principal: ${model.fileName}`);
          }
        }
        
        if (analysis.models) backendStructure.models.push(...analysis.models);
        
        // ✨ NUEVO: Loop de reintentos para controladores y rutas
        let retryCount = 0;
        let currentMissingFns = [...declaredFns]; // Inicializar con todas las funciones
        
        while (retryCount < MAX_RETRIES_PER_FILE && currentMissingFns.length > 0) {
          retryCount++;
          console.log(`\n🔄 === INTENTO ${retryCount}/${MAX_RETRIES_PER_FILE} PARA ${apiFile.name} ===`);
          console.log(`🎯 Funciones pendientes: [${currentMissingFns.join(', ')}]`);
          
          if (retryCount === 1) {
            // --- PASO 2: Generar Servicios y Controladores (primer intento) ---
            console.log('📝 Creando prompt para Servicios y Controladores con contexto de modelos...');
            const controllersPrompt = createAdvancedControllersPromptWithContext(
              apiFile.name, 
              apiContent, 
              framework, 
              includeDatabase,
              analysis.models || []
            );
            console.log(`🤖 Enviando solicitud a Gemini para Controladores...`);
            response = await retryGeminiCall(client, controllersPrompt);
            
            // Escribir respuesta de Gemini en archivo
            await writeGeminiResponseToFile(response.text, `backend_controladores_${apiFile.name}`, project._id);
            
            analysis = parseBackendAnalysisResponse(response.text);
            console.log(`📚 Análisis de Controladores completado para: ${apiFile.name}`);
            
            // Crear archivos de controladores y servicios
            const controllerFiles = await createFilesFromResponse(analysis, outputPath, apiFile.name);
            generatedFiles.push(...controllerFiles);
            
            // Crear archivos funcionales en el directorio principal
            if (analysis.controllers && analysis.controllers.length > 0) {
              for (const controller of analysis.controllers) {
                const mainControllerPath = path.join(__dirname, 'controllers', controller.fileName);
                await fs.ensureDir(path.dirname(mainControllerPath));
                await fs.writeFile(mainControllerPath, controller.content, 'utf8');
                console.log(`✅ Controlador funcional creado en directorio principal: ${controller.fileName}`);
              }
            }
            
            if (analysis.services && analysis.services.length > 0) {
              await fs.ensureDir(path.join(__dirname, 'services'));
              for (const service of analysis.services) {
                const mainServicePath = path.join(__dirname, 'services', service.fileName);
                await fs.writeFile(mainServicePath, service.content, 'utf8');
                console.log(`✅ Servicio funcional creado en directorio principal: ${service.fileName}`);
              }
            }
            
            if (analysis.controllers) backendStructure.controllers.push(...analysis.controllers);
            if (analysis.services) backendStructure.services.push(...analysis.services);
        
            // --- PASO 3: Generar Rutas (primer intento) ---
            console.log('📝 Creando prompt para Rutas con contexto completo...');
            const routesPrompt = createAdvancedRoutesPromptWithContext(
              apiFile.name, 
              apiContent, 
              framework, 
              includeDatabase,
              backendStructure.models || [],
              analysis.controllers || [],
              analysis.services || []
            );
            console.log(`🤖 Enviando solicitud a Gemini para Rutas...`);
            response = await retryGeminiCall(client, routesPrompt);
            
            // Escribir respuesta de Gemini en archivo
            await writeGeminiResponseToFile(response.text, `backend_rutas_${apiFile.name}`, project._id);
            
            analysis = parseBackendAnalysisResponse(response.text);
            console.log(`📚 Análisis de Rutas completado para: ${apiFile.name}`);
            
            // Crear archivos de rutas
            const routeFiles = await createFilesFromResponse(analysis, outputPath, apiFile.name);
            generatedFiles.push(...routeFiles);
            
            // Crear archivos funcionales de rutas en el directorio principal
            if (analysis.routes && analysis.routes.length > 0) {
              for (const route of analysis.routes) {
                const mainRoutePath = path.join(__dirname, 'routes', route.fileName);
                await fs.ensureDir(path.dirname(mainRoutePath));
                await fs.writeFile(mainRoutePath, route.content, 'utf8');
                console.log(`✅ Ruta funcional creada en directorio principal: ${route.fileName}`);
              }
            }
            
            if (analysis.routes) backendStructure.routes.push(...analysis.routes);
            
          } else {
            // --- REINTENTOS: Usar prompt específico para funciones faltantes ---
            console.log(`🎯 Generando código específico para funciones faltantes (intento ${retryCount})...`);
            
            const missingPrompt = createMissingFnsPrompt(
              apiFile.name,
              apiContent,
              currentMissingFns,
              backendStructure
            );
            
            console.log('🤖 Enviando solicitud para funciones faltantes...');
            const resp = await retryGeminiCall(client, missingPrompt);
            
            // Escribir respuesta de Gemini a archivo
            await writeGeminiResponseToFile(
              resp.text,
              `backend_funciones_faltantes_${apiFile.name}_retry${retryCount}`,
              project._id
            );
            
            const extra = parseBackendAnalysisResponse(resp.text);
            
            // Escribir inmediatamente los archivos
            const newFiles = await createFilesFromResponse(extra, outputPath, `${apiFile.name}_retry${retryCount}`);
            generatedFiles.push(...newFiles);
            
            // Crear archivos funcionales adicionales en el directorio principal
            if (extra.controllers && extra.controllers.length > 0) {
              for (const controller of extra.controllers) {
                const mainControllerPath = path.join(__dirname, 'controllers', controller.fileName);
                await fs.ensureDir(path.dirname(mainControllerPath));
                await fs.writeFile(mainControllerPath, controller.content, 'utf8');
                console.log(`✅ Controlador adicional creado en directorio principal: ${controller.fileName}`);
              }
            }
            
            if (extra.services && extra.services.length > 0) {
              await fs.ensureDir(path.join(__dirname, 'services'));
              for (const service of extra.services) {
                const mainServicePath = path.join(__dirname, 'services', service.fileName);
                await fs.writeFile(mainServicePath, service.content, 'utf8');
                console.log(`✅ Servicio adicional creado en directorio principal: ${service.fileName}`);
              }
            }
            
            if (extra.routes && extra.routes.length > 0) {
              for (const route of extra.routes) {
                const mainRoutePath = path.join(__dirname, 'routes', route.fileName);
                await fs.ensureDir(path.dirname(mainRoutePath));
                await fs.writeFile(mainRoutePath, route.content, 'utf8');
                console.log(`✅ Ruta adicional creada en directorio principal: ${route.fileName}`);
              }
            }
            
            // Merge en la estructura en memoria
            ['controllers', 'services', 'routes'].forEach(k => {
              if (extra[k]?.length) {
                backendStructure[k].push(...extra[k]);
                console.log(`✅ Agregados ${extra[k].length} ${k} adicionales`);
              }
            });
          }
          
          // ✨ Verificar cobertura después de cada intento
          console.log('🔍 Analizando cobertura de funciones...');
          const implementedFns = [
            ...backendStructure.controllers.flatMap(c => Object.values(c).join(' ')),
            ...backendStructure.routes.flatMap(r => r.content)
          ].join(' ').toLowerCase();
          
          currentMissingFns = apiFile.declaredFns.filter(fn => 
            !implementedFns.includes(fn.toLowerCase())
          );
          
          if (currentMissingFns.length === 0) {
            console.log(`🎉 ¡Cobertura completa para ${apiFile.name} en el intento ${retryCount}!`);
            apiFile.missingFns = [];
            break;
          } else {
            console.warn(`[Coverage] ⚠️ Intento ${retryCount} - Funciones aún sin implementar: ${currentMissingFns.join(', ')}`);
            apiFile.missingFns = currentMissingFns;
            
            if (retryCount < MAX_RETRIES_PER_FILE) {
              console.log(`🔄 Preparando intento ${retryCount + 1}...`);
            } else {
              console.warn(`⚠️ Máximo de reintentos alcanzado para ${apiFile.name}. Funciones sin implementar: ${currentMissingFns.length}`);
            }
          }
        }
        
        // Reporte final para este archivo
        const total = apiFile.declaredFns?.length || 0;
        const missing = apiFile.missingFns?.length || 0;
        const implemented = total - missing;
        const percentage = total > 0 ? Math.round((implemented / total) * 100) : 100;
        
        console.log(`\n📊 REPORTE FINAL - ${apiFile.name}:`);
        console.log(`  ✅ Implementadas: ${implemented}/${total} funciones (${percentage}%)`);
        console.log(`  🔄 Intentos realizados: ${retryCount}`);
        if (missing > 0) {
          console.log(`  ⚠️ Funciones faltantes: [${apiFile.missingFns.join(', ')}]`);
        }
        
      } catch (error) {
        console.error(`❌ Error procesando archivo API ${apiFile.name}:`, error.message);
      }
    }
    
    // Reporte final global
    console.log(`\n📊 === REPORTE FINAL GLOBAL ===`);
    let totalFunctions = 0;
    let totalImplemented = 0;
    
    apiFiles.forEach(apiFile => {
      const total = apiFile.declaredFns?.length || 0;
      const missing = apiFile.missingFns?.length || 0;
      const implemented = total - missing;
      const percentage = total > 0 ? Math.round((implemented / total) * 100) : 100;
      
      totalFunctions += total;
      totalImplemented += implemented;
      
      console.log(`  📄 ${apiFile.name}: ${implemented}/${total} (${percentage}%)`);
    });
    
    const globalPercentage = totalFunctions > 0 ? Math.round((totalImplemented / totalFunctions) * 100) : 100;
    console.log(`\n🎯 COBERTURA GLOBAL: ${totalImplemented}/${totalFunctions} funciones (${globalPercentage}%)`);
    
    // ✨ NUEVO: Fusionar archivos duplicados
    console.log('\n🔀 Fusionando archivos duplicados...');
    const deduplicatedFiles = await mergeAndDeduplicateFiles(outputPath, generatedFiles);
    
    // Actualizar la lista de archivos generados
    generatedFiles.length = 0;
    generatedFiles.push(...deduplicatedFiles);
            
    // --- Generar infraestructura y utilidades ---
    console.log('\n🏗️ Generando infraestructura y utilidades...');
    const infraPrompt = createInfrastructurePrompt(backendStructure, framework, includeDatabase);
    const infraResponse = await retryGeminiCall(client, infraPrompt);
    
    // Escribir respuesta de Gemini en archivo
    await writeGeminiResponseToFile(infraResponse.text, 'backend_infraestructura', project._id);
    
    const infraAnalysis = parseBackendAnalysisResponse(infraResponse.text);
    
    // ✨ CREAR ARCHIVOS DE INFRAESTRUCTURA INMEDIATAMENTE
    const infraFiles = await createFilesFromResponse(infraAnalysis, outputPath, 'infrastructure');
    generatedFiles.push(...infraFiles);
    
    // Crear archivos funcionales de infraestructura en el directorio principal
    if (infraAnalysis.middleware && infraAnalysis.middleware.length > 0) {
      await fs.ensureDir(path.join(__dirname, 'middleware'));
      for (const middleware of infraAnalysis.middleware) {
        const mainMiddlewarePath = path.join(__dirname, 'middleware', middleware.fileName);
        await fs.writeFile(mainMiddlewarePath, middleware.content, 'utf8');
        console.log(`✅ Middleware funcional creado en directorio principal: ${middleware.fileName}`);
      }
    }
    
    if (infraAnalysis.config && infraAnalysis.config.length > 0) {
      await fs.ensureDir(path.join(__dirname, 'config'));
      for (const config of infraAnalysis.config) {
        const mainConfigPath = path.join(__dirname, 'config', config.fileName);
        await fs.writeFile(mainConfigPath, config.content, 'utf8');
        console.log(`✅ Configuración funcional creada en directorio principal: ${config.fileName}`);
      }
    }
    
    if (infraAnalysis.utils && infraAnalysis.utils.length > 0) {
      await fs.ensureDir(path.join(__dirname, 'utils'));
      for (const util of infraAnalysis.utils) {
        const mainUtilPath = path.join(__dirname, 'utils', util.fileName);
        await fs.writeFile(mainUtilPath, util.content, 'utf8');
        console.log(`✅ Utilidad funcional creada en directorio principal: ${util.fileName}`);
      }
    }
    
    if (infraAnalysis.tests && infraAnalysis.tests.length > 0) {
      await fs.ensureDir(path.join(__dirname, 'tests'));
      for (const test of infraAnalysis.tests) {
        const mainTestPath = path.join(__dirname, 'tests', test.fileName);
        await fs.writeFile(mainTestPath, test.content, 'utf8');
        console.log(`✅ Test funcional creado en directorio principal: ${test.fileName}`);
      }
    }
    
    if (infraAnalysis.middleware) backendStructure.middleware.push(...infraAnalysis.middleware);
    if (infraAnalysis.config) backendStructure.config.push(...infraAnalysis.config);
    if (infraAnalysis.utils) backendStructure.utils.push(...infraAnalysis.utils);
    if (infraAnalysis.tests) backendStructure.tests.push(...infraAnalysis.tests);
    
    // Generar archivos principales del proyecto (package.json, server.js, etc.)
    console.log('\n🏗️ Generando archivos principales del proyecto...');
    const mainFiles = await generateMainProjectFiles(outputPath, framework, includeDatabase, client);
    generatedFiles.push(...mainFiles);
    
    // Fusionar archivos duplicados
    console.log('\n🔀 Fusionando archivos duplicados...');
    const finalFiles = await mergeAndDeduplicateFiles(outputPath, generatedFiles);
    
    console.log('\n🧹 Limpiando directorio temporal...');
    try {
      await cleanupTempDir(tempDir);
      console.log('✅ Directorio temporal eliminado');
    } catch (cleanupError) {
      console.log('⚠️ Error limpiando directorio temporal:', cleanupError.message);
    }

    // Validar coherencia del backend generado
    console.log('\n🔍 Validando coherencia del backend generado...');
    const coherenceCheck = validateBackendCoherence(backendStructure);

    if (coherenceCheck.warnings.length > 0) {
      console.log('⚠️ Advertencias de coherencia encontradas:');
      coherenceCheck.warnings.forEach(warning => console.log(`  - ${warning}`));
    }

    if (coherenceCheck.issues.length > 0) {
      console.log('❌ Problemas de coherencia encontrados:');
      coherenceCheck.issues.forEach(issue => console.log(`  - ${issue}`));
    }

    if (coherenceCheck.warnings.length === 0 && coherenceCheck.issues.length === 0) {
      console.log('✅ Backend generado con coherencia completa');
    }

    console.log(`\n🎉 Generación de backend completada:`);
    console.log(`📄 Archivos API analizados: ${apiFiles.length}`);
    console.log(`🏗️ Archivos generados: ${generatedFiles.length}`);
    console.log(`🔍 Coherencia: ${coherenceCheck.issues.length} problemas, ${coherenceCheck.warnings.length} advertencias`);

    return {
      message: 'Backend generado exitosamente con funcionalidades avanzadas',
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
          services: backendStructure.services.length,
          middleware: backendStructure.middleware.length,
          config: backendStructure.config.length,
          utils: backendStructure.utils.length,
          tests: backendStructure.tests.length
        },
        files: finalFiles
      }
    };

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
};

// Función de retry para llamadas a Gemini con back-off exponencial
const retryGeminiCall = async (client, prompt, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 Intento ${attempt}/${maxRetries} - Enviando solicitud a Gemini...`);
      
      const response = await client.models.generateContent({
        model: 'gemini-2.5-pro-preview-06-05',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 0.8,
          maxOutputTokens: 8192
        }
      });
      
      if (!response || !response.text) {
        throw new Error('Respuesta vacía o inválida de Gemini');
      }
      
      const responseText = response.text;
      console.log(`✅ Respuesta recibida de Gemini (${responseText.length} caracteres)`);
      
      // Validar que la respuesta contiene JSON
      if (!responseText.includes('{') || !responseText.includes('}')) {
        throw new Error('La respuesta no contiene JSON válido');
      }
      
      return { text: responseText };
      
    } catch (error) {
      console.warn(`⚠️ Intento ${attempt}/${maxRetries} falló:`, error.message);
      
      if (attempt === maxRetries) {
        console.error('❌ Todos los intentos fallaron, lanzando error final');
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000; // Back-off exponencial
      console.log(`🔄 Reintentando en ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Prompt mejorado para modelos con relaciones y audit fields
const createAdvancedModelsPrompt = (fileName, fileContent, framework, includeDatabase) => {
  return `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera SOLO los modelos de datos avanzados en ${framework} con Node.js.

Contenido del archivo:
\`\`\`
${fileContent.substring(0, 4000)}
\`\`\`

Instrucciones Específicas para MODELOS AVANZADOS:
1. Identifica las entidades de datos y sus relaciones (1-N, N-N)
2. Si detectas claves foráneas, genera ref a otros esquemas usando ObjectId
3. Incluye timestamps: true para createdAt y updatedAt automáticos
4. Añade deletedAt opcional para soft-delete
5. Define índices adecuados para búsquedas y ordenación
6. Incluye validaciones robustas (required, min, max, enum, custom)
7. Agrega métodos de instancia y estáticos útiles
8. Implementa middleware pre/post para hooks
9. Usa Mongoose para modelos de MongoDB con esquemas completos

Formato de respuesta (JSON):
\`\`\`json
{
  "models": [
    {
      "name": "NombreModelo",
      "fileName": "nombreModelo.js",
      "content": "código completo del modelo con relaciones, índices y validaciones",
      "description": "descripción del modelo y sus características"
    }
  ]
}
\`\`\`

Asegúrate de usar las mejores prácticas de Mongoose y generar modelos production-ready.`;
};

// Prompt mejorado para controladores con service layer
const createAdvancedControllersPrompt = (fileName, fileContent, framework, includeDatabase) => {
  return `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera controladores con service layer en ${framework} con Node.js.

Contenido del archivo:
\`\`\`
${fileContent.substring(0, 4000)}
\`\`\`

Instrucciones Específicas para CONTROLADORES Y SERVICIOS:
1. Crea servicios en services/ y deja los controladores como orquestadores
2. Cada endpoint debe soportar paginación (page, limit), filtros ?field=value, ordenación ?sort=-createdAt
3. Usa transacciones de Mongoose cuando se escriban >1 colección
4. Implementa respuesta estandarizada { data, meta, error }
5. Manejo completo de errores con códigos HTTP apropiados
6. Validación de entrada en servicios
7. Logging estructurado con correlación de requests
8. Separación clara de responsabilidades

Formato de respuesta (JSON):
\`\`\`json
{
  "controllers": [
    {
      "name": "NombreController",
      "fileName": "nombreController.js",
      "content": "código del controlador como orquestador",
      "description": "descripción del controlador"
    }
  ],
  "services": [
    {
      "name": "NombreService",
      "fileName": "nombreService.js",
      "content": "código del servicio con lógica de negocio",
      "description": "descripción del servicio"
    }
  ]
}
\`\`\`

Genera código production-ready con todas las funcionalidades solicitadas.`;
};

// Prompt mejorado para rutas con autenticación y validación
const createAdvancedRoutesPrompt = (fileName, fileContent, framework, includeDatabase) => {
  return `Analiza el siguiente archivo de API/endpoint llamado "${fileName}" y genera rutas completas con seguridad en ${framework} con Node.js.

Contenido del archivo:
\`\`\`
${fileContent.substring(0, 4000)}
\`\`\`

Instrucciones Específicas para RUTAS AVANZADAS:
1. Para cada ruta agrega:
   - Middleware auth (JWT) con roles
   - validate(schema) usando zod-express
   - rateLimiter (10 req/min)
   - prefijo /api/v1
2. Implementa versioning de API
3. Rate-limiting por IP
4. Validación de esquema robusta
5. Protección con JWT + roles (admin, user, etc.)
6. Middleware de logging y métricas
7. Documentación inline para Swagger
8. Manejo de errores centralizado

Formato de respuesta (JSON):
\`\`\`json
{
  "routes": [
    {
      "name": "NombreRoute",
      "fileName": "nombreRoute.js",
      "content": "código completo de las rutas con middleware",
      "description": "descripción de las rutas y su seguridad"
    }
  ]
}
\`\`\`

Genera rutas production-ready con todas las medidas de seguridad.`;
};

// Prompt para infraestructura y utilidades
const createInfrastructurePrompt = (backendStructure, framework, includeDatabase) => {
  const modelsInfo = backendStructure.models.map(m => m.name).join(', ');
  const routesInfo = backendStructure.routes.map(r => r.name).join(', ');
  
  return `Con base en los modelos (${modelsInfo}) y rutas (${routesInfo}) generados, crea utilidades comunes, documentación y configuración para un backend ${framework} production-ready.

Genera en /middleware:
- logger.js (pino-http con correlación req.id)
- errorHandler.js (manejo centralizado de errores)
- rateLimiter.js (express-rate-limit)
- auth.js (JWT + roles)
- validate.js (zod-express)
- metrics.js (prom-client)

Genera en /config:
- database.js (conexión MongoDB con retry)
- env.js (validación de variables de entorno)
- swagger.js (configuración Swagger)

Genera en /utils:
- response.js (respuestas estandarizadas)
- logger.js (pino configurado)
- constants.js (constantes de la aplicación)

Genera archivos de configuración:
- .env.example (variables de entorno)
- Dockerfile (multi-stage build)
- docker-compose.yml (app + MongoDB)
- swagger.yaml (documentación API)
- seed.js (datos de ejemplo)
- .eslintrc.cjs + .prettierrc
- .github/workflows/ci.yml

Genera en /__tests__/:
- model.test.js, controller.test.js, route.test.js usando Jest + Supertest + MongoMemoryServer

Formato de respuesta (JSON):
\`\`\`json
{
  "middleware": [...],
  "config": [...],
  "utils": [...],
  "tests": [...]
}
\`\`\`

Incluye endpoints /health, /ready, /metrics y toda la observabilidad necesaria.`;
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

// Nueva función para prompts específicos
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
// Función auxiliar para parsear respuesta de análisis de backend
const parseBackendAnalysisResponse = (responseText = '') => {
  try {
    // 1. Limpiar la respuesta de manera más agresiva
    let cleanedText = responseText.trim();
    
    // Remover texto explicativo al inicio (común en respuestas de Gemini)
    // Buscar el primer '{' que indica el inicio del JSON
    const firstBraceIndex = cleanedText.indexOf('{');
    if (firstBraceIndex > 0) {
      cleanedText = cleanedText.substring(firstBraceIndex);
    }
    
    // Remover markdown code blocks si existen
    cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // Remover caracteres problemáticos comunes
    cleanedText = cleanedText.replace(/^[^{]*/, ''); // Todo antes del primer '{'
    cleanedText = cleanedText.replace(/[^}]*$/, '}'); // Todo después del último '}'
    
    // Buscar el JSON de manera más robusta
    let jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      // Intentar buscar solo el contenido entre llaves más externas
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonMatch = [cleanedText.substring(firstBrace, lastBrace + 1)];
      } else {
        throw new Error('No se encontró bloque JSON válido en la respuesta de Gemini');
      }
    }

    // 2. Limpiar el JSON extraído más agresivamente
    let jsonString = jsonMatch[0];
    
    // Remover caracteres problemáticos al inicio
    jsonString = jsonString.replace(/^[^{]*/, '');
    
    // Limpiar caracteres especiales que pueden causar problemas
    jsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Caracteres de control
    jsonString = jsonString.replace(/\\n/g, '\\n'); // Asegurar escape correcto de newlines
    jsonString = jsonString.replace(/\\r/g, '\\r'); // Asegurar escape correcto de returns
    
    // Asegurar que termine correctamente
    if (!jsonString.endsWith('}')) {
      const lastBraceIndex = jsonString.lastIndexOf('}');
      if (lastBraceIndex !== -1) {
        jsonString = jsonString.substring(0, lastBraceIndex + 1);
      }
    }

    // 3. Parsear con JSON5 (mucho más tolerante que JSON.parse)
    const rawObject = JSON5.parse(jsonString);

    // 4. Validar con Zod
    const schema = z.object({
      models:      z.array(z.any()).optional(),
      controllers: z.array(z.any()).optional(),
      routes:      z.array(z.any()).optional(),
      services:    z.array(z.any()).optional(),
      middleware:  z.array(z.any()).optional(),
      config:      z.array(z.any()).optional(),
      utils:       z.array(z.any()).optional(),
      tests:       z.array(z.any()).optional()
    });

    const result = schema.safeParse(rawObject);
    if (!result.success) {
      throw new Error(`Estructura inesperada: ${result.error}`);
    }

    // 5. Normalizar (garantizar todas las claves)
    const get = (k) => result.data[k] ?? [];
    return {
      models:      get('models'),
      controllers: get('controllers'),
      routes:      get('routes'),
      services:    get('services'),
      middleware:  get('middleware'),
      config:      get('config'),
      utils:       get('utils'),
      tests:       get('tests')
    };

  } catch (err) {
    console.error('❌ Error parseando respuesta Gemini:', err.message);
    console.error('📝 Respuesta problemática (primeros 500 chars):', responseText.substring(0, 500));
    console.error('📝 Respuesta problemática (últimos 500 chars):', responseText.substring(Math.max(0, responseText.length - 500)));

    // 6. Intentar extracción parcial como fallback
    const partialData = extractPartialData(responseText);
    if (partialData) {
      console.log('✅ Extracción parcial exitosa');
      return partialData;
    }

    // 7. Fallback seguro: devolver estructura vacía
    console.warn('⚠️ Usando estructura vacía como último recurso');
    return {
      models: [], controllers: [], routes: [], services: [],
      middleware: [], config: [], utils: [], tests: []
    };
  }
};

const extractPartialData = (responseText) => {
  const result = {
    models: [],
    controllers: [],
    routes: [],
    services: [],
    middleware: [],
    config: [],
    utils: [],
    tests: []
  };
  
  try {
    // Primero intentar encontrar el JSON completo ignorando texto explicativo
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonSection = responseText.substring(jsonStart, jsonEnd + 1);
      
      // Buscar patrones específicos en el texto JSON
      const patterns = {
        models: /"models"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        controllers: /"controllers"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        routes: /"routes"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        services: /"services"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        middleware: /"middleware"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        config: /"config"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        utils: /"utils"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/,
        tests: /"tests"\s*:\s*\[([\s\S]*?)\](?=\s*,\s*"\w+"|\s*\})/
      };
      
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = jsonSection.match(pattern);
        if (match) {
          try {
            const arrayContent = `[${match[1]}]`;
            result[key] = JSON5.parse(arrayContent);
            console.log(`✅ Extraído ${key}: ${result[key].length} elementos`);
          } catch (e) {
            console.log(`⚠️ No se pudo parsear ${key} parcialmente:`, e.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error en extracción parcial:', error.message);
  }
  
  // Verificar si se extrajo algo útil
  const hasData = Object.values(result).some(arr => arr.length > 0);
  return hasData ? result : null;
};
// Función para fusionar archivos duplicados del mismo tipo
const mergeAndDeduplicateFiles = async (outputPath, generatedFiles) => {
  console.log('🔄 Iniciando fusión de archivos duplicados...');
  
  const fileGroups = {};
  const filesToRemove = [];
  const mergedFiles = [];
  
  // Agrupar archivos por tipo y nombre base
  generatedFiles.forEach(file => {
    if (['controller', 'route', 'service'].includes(file.type)) {
      const baseName = file.fileName.replace(/\.(controller|route|service)\.js$/i, '').toLowerCase();
      const key = `${file.type}_${baseName}`;
      
      if (!fileGroups[key]) {
        fileGroups[key] = [];
      }
      fileGroups[key].push(file);
    }
  });
  
  // Procesar cada grupo de archivos duplicados
  for (const [groupKey, files] of Object.entries(fileGroups)) {
    if (files.length > 1) {
      console.log(`🔀 Fusionando ${files.length} archivos del grupo: ${groupKey}`);
      
      const [type, baseName] = groupKey.split('_');
      const mergedContent = await mergeFileContents(files, type);
      
      // Determinar el nombre del archivo fusionado
      const mergedFileName = `${baseName}.${type}.js`;
      const mergedFilePath = path.join(outputPath, `${type}s`, mergedFileName);
      
      // Escribir archivo fusionado
      await fs.writeFile(mergedFilePath, mergedContent, 'utf8');
      console.log(`✅ Archivo fusionado creado: ${mergedFileName}`);
      
      // Marcar archivos originales para eliminación
      files.forEach(file => {
        if (file.path !== mergedFilePath) {
          filesToRemove.push(file.path);
        }
      });
      
      // Agregar archivo fusionado a la lista
      mergedFiles.push({
        type: type,
        name: `${baseName.charAt(0).toUpperCase() + baseName.slice(1)}${type.charAt(0).toUpperCase() + type.slice(1)}`,
        fileName: mergedFileName,
        path: mergedFilePath,
        description: `Archivo fusionado de ${files.length} ${type}s`,
        source: files.map(f => f.source).join(', '),
        merged: true
      });
    }
  }
  
  // Eliminar archivos duplicados
  for (const filePath of filesToRemove) {
    try {
      await fs.remove(filePath);
      console.log(`🗑️ Archivo duplicado eliminado: ${path.basename(filePath)}`);
    } catch (error) {
      console.warn(`⚠️ No se pudo eliminar ${filePath}: ${error.message}`);
    }
  }
  
  // Actualizar lista de archivos generados
  const updatedFiles = generatedFiles.filter(file => 
    !filesToRemove.includes(file.path)
  ).concat(mergedFiles);
  
  console.log(`✅ Fusión completada: ${filesToRemove.length} archivos eliminados, ${mergedFiles.length} archivos fusionados`);
  return updatedFiles;
};

// Función para fusionar el contenido de archivos del mismo tipo
const mergeFileContents = async (files, type) => {
  let mergedContent = '';
  const imports = new Set();
  const exports = new Set();
  let mainContent = '';
  
  for (const file of files) {
    try {
      const content = await fs.readFile(file.path, 'utf8');
      
      // Extraer imports
      const importMatches = content.match(/^const .+ = require\(.+\);$/gm) || [];
      importMatches.forEach(imp => imports.add(imp));
      
      // Extraer exports
      const exportMatches = content.match(/^module\.exports = .+$/gm) || [];
      exportMatches.forEach(exp => exports.add(exp));
      
      // Extraer contenido principal (sin imports y exports)
      let cleanContent = content
        .replace(/^const .+ = require\(.+\);$/gm, '')
        .replace(/^module\.exports = .+$/gm, '')
        .replace(/^\s*$/gm, '')
        .trim();
      
      if (cleanContent) {
        mainContent += `\n\n// === Contenido de ${file.fileName} ===\n${cleanContent}`;
      }
    } catch (error) {
      console.warn(`⚠️ Error leyendo archivo ${file.fileName}: ${error.message}`);
    }
  }
  
  // Construir contenido fusionado
  mergedContent = Array.from(imports).join('\n');
  mergedContent += mainContent;
  
  // Fusionar exports (para rutas, usar router; para controladores, usar objeto)
  if (type === 'route') {
    mergedContent += '\n\nmodule.exports = router;';
  } else if (type === 'controller') {
    mergedContent += '\n\nmodule.exports = { ' + 
      files.map(f => f.name.replace('Controller', '')).join(', ') + 
      ' };';
  } else {
    mergedContent += '\n\n' + Array.from(exports).join('\n');
  }
  
  return mergedContent;
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
    const packageJsonContent = await generateAdvancedPackageJson(framework, includeDatabase);
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
const generateAdvancedPackageJson = async (framework, includeDatabase) => {
    const packageJson = {
      "name": "generated-backend",
      "version": "1.0.0",
      "description": "Backend generado automáticamente con funcionalidades avanzadas",
      "main": "server.js",
      "scripts": {
        "start": "node server.js",
        "dev": "nodemon server.js",
        "test": "jest --detectOpenHandles",
        "test:watch": "jest --watch",
        "test:coverage": "jest --coverage",
        "lint": "eslint . --ext .js,.jsx,.ts,.tsx",
        "lint:fix": "eslint . --ext .js,.jsx,.ts,.tsx --fix",
        "format": "prettier --write .",
        "seed": "node seed.js",
        "docker:build": "docker build -t generated-backend .",
        "docker:run": "docker-compose up -d",
        "docs:generate": "swagger-jsdoc -d swaggerDef.js -o swagger.yaml"
      },
      "dependencies": {
        "express": "^4.18.2",
        "helmet": "^7.1.0",
        "cors": "^2.8.5",
        "express-rate-limit": "^7.1.5",
        "express-slow-down": "^2.0.1",
        "zod": "^3.22.4",
        "zod-express-middleware": "^1.4.0",
        "celebrate": "^15.0.1",
        "jsonwebtoken": "^9.0.2",
        "bcryptjs": "^2.4.3",
        "dotenv": "^16.3.1",
        "pino": "^8.16.2",
        "pino-http": "^8.5.1",
        "prom-client": "^15.0.0",
        "swagger-jsdoc": "^6.2.8",
        "swagger-ui-express": "^5.0.0"
      },
      "devDependencies": {
        "nodemon": "^3.0.2",
        "jest": "^29.7.0",
        "supertest": "^6.3.3",
        "mongodb-memory-server": "^9.1.3",
        "eslint": "^8.55.0",
        "prettier": "^3.1.1",
        "@types/jest": "^29.5.8"
      }
    };
  
    if (includeDatabase) {
      packageJson.dependencies.mongoose = "^8.0.3";
    }
  
    return JSON.stringify(packageJson, null, 2);
  };
  
  // Función para generar server.js avanzado con todas las medidas de seguridad
  const generateAdvancedServer = async (framework, includeDatabase) => {
    return `const express = require('express');
  const helmet = require('helmet');
  const cors = require('cors');
  const rateLimit = require('express-rate-limit');
  const slowDown = require('express-slow-down');
  const { celebrate, errors } = require('celebrate');
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const pino = require('pino');
  const pinoHttp = require('pino-http');
  const promClient = require('prom-client');
  require('dotenv').config();
  
  // Importar configuraciones
  const { connectDB } = require('./config/database');
  const logger = require('./utils/logger');
  const { standardResponse } = require('./utils/response');
  const errorHandler = require('./middleware/errorHandler');
  const authMiddleware = require('./middleware/auth');
  const rbacMiddleware = require('./middleware/rbac');
  const metricsMiddleware = require('./middleware/metrics');
  
  // Importar rutas
  const apiRoutes = require('./routes');
  
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  // Configuración de métricas Prometheus
  const collectDefaultMetrics = promClient.collectDefaultMetrics;
  collectDefaultMetrics({ timeout: 5000 });
  
  // Configuración de seguridad avanzada con Helmet
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    crossOriginEmbedderPolicy: false
  }));
  
  // CORS dinámico desde variables de entorno
  const corsOptions = {
    origin: function (origin, callback) {
      const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
        process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];
      
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  };
  app.use(cors(corsOptions));
  
  // Rate limiting avanzado
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.RATE_LIMIT_MAX || 100,
    message: {
      error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.',
      retryAfter: '15 minutos'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Saltar rate limiting para health checks
      return req.path === '/health' || req.path === '/ready';
    }
  });
  
  // Slow down para requests frecuentes
  const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutos
    delayAfter: 50, // permitir 50 requests por ventana sin delay
    delayMs: 500 // agregar 500ms de delay por request después del límite
  });
  
  app.use('/api', limiter);
  app.use('/api', speedLimiter);
  
  // Logging estructurado
  app.use(pinoHttp({ logger }));
  
  // Middleware de métricas
  app.use(metricsMiddleware);
  
  // Parseo de JSON
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Conectar a la base de datos
  if (${includeDatabase}) {
    connectDB();
  }
  
  // Documentación Swagger
  try {
    const swaggerDocument = YAML.load('./swagger.yaml');
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Documentation'
    }));
  } catch (error) {
    logger.warn('No se pudo cargar la documentación Swagger:', error.message);
  }
  
  // Health checks
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });
  
  app.get('/ready', async (req, res) => {
    try {
      // Verificar conexión a base de datos si está habilitada
      if (${includeDatabase}) {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
          throw new Error('Base de datos no conectada');
        }
      }
      
      res.status(200).json({
        status: 'Ready',
        timestamp: new Date().toISOString(),
        database: ${includeDatabase} ? 'connected' : 'disabled'
      });
    } catch (error) {
      res.status(503).json({
        status: 'Not Ready',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Métricas Prometheus
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    } catch (error) {
      res.status(500).end(error.message);
    }
  });
  
  // Rutas de la API
  app.use('/api/v1', apiRoutes);
  
  // Middleware de manejo de errores de Celebrate
  app.use(errors());
  
  // Middleware de manejo de errores personalizado
  app.use(errorHandler);
  
  // Ruta 404
  app.use('*', (req, res) => {
    res.status(404).json(standardResponse(null, 'Ruta no encontrada', 404));
  });
  
  // Manejo de errores no capturados
  process.on('uncaughtException', (error) => {
    logger.fatal('Excepción no capturada:', error);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('Promesa rechazada no manejada:', { reason, promise });
    process.exit(1);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM recibido, cerrando servidor...');
    server.close(() => {
      logger.info('Servidor cerrado');
      process.exit(0);
    });
  });
  
  const server = app.listen(PORT, () => {
    logger.info(\`🚀 Servidor ejecutándose en puerto \${PORT}\`);
    logger.info(\`📚 Documentación disponible en http://localhost:\${PORT}/docs\`);
    logger.info(\`❤️ Health check en http://localhost:\${PORT}/health\`);
    logger.info(\`📊 Métricas en http://localhost:\${PORT}/metrics\`);
  });
  
  module.exports = app;`;
  };
  
  // Función para generar middleware RBAC
  const generateRBACMiddleware = () => {
    return `const jwt = require('jsonwebtoken');
  const { standardResponse } = require('../utils/response');
  const logger = require('../utils/logger');
  
  // Mapa de roles y permisos
  const rolePermissions = {
    admin: ['*'], // Acceso total
    editor: [
      'users:read', 'users:write',
      'posts:read', 'posts:write', 'posts:delete',
      'categories:read', 'categories:write'
    ],
    moderator: [
      'users:read',
      'posts:read', 'posts:write',
      'comments:read', 'comments:write', 'comments:delete'
    ],
    user: [
      'profile:read', 'profile:write',
      'posts:read',
      'comments:read', 'comments:write'
    ],
    guest: ['posts:read', 'categories:read']
  };
  
  // Función para verificar si un rol tiene un permiso específico
  const hasPermission = (userRole, requiredPermission) => {
    const permissions = rolePermissions[userRole] || [];
    
    // Si el rol tiene acceso total
    if (permissions.includes('*')) {
      return true;
    }
    
    // Verificar permiso específico
    if (permissions.includes(requiredPermission)) {
      return true;
    }
    
    // Verificar permisos con wildcards
    const [resource, action] = requiredPermission.split(':');
    const wildcardPermission = \`\${resource}:*\`;
    
    return permissions.includes(wildcardPermission);
  };
  
  // Middleware de autorización por roles
  const authorize = (...allowedRoles) => {
    return (req, res, next) => {
      try {
        // Verificar si el usuario está autenticado
        if (!req.user) {
          return res.status(401).json(
            standardResponse(null, 'Token de autenticación requerido', 401)
          );
        }
        
        const userRole = req.user.role || 'guest';
        
        // Verificar si el rol del usuario está en los roles permitidos
        if (allowedRoles.includes(userRole)) {
          return next();
        }
        
        // Log del intento de acceso no autorizado
        logger.warn('Intento de acceso no autorizado', {
          userId: req.user.id,
          userRole,
          requiredRoles: allowedRoles,
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        
        return res.status(403).json(
          standardResponse(
            null, 
            \`Acceso denegado. Roles requeridos: \${allowedRoles.join(', ')}\`,
            403
          )
        );
      } catch (error) {
        logger.error('Error en middleware de autorización:', error);
        return res.status(500).json(
          standardResponse(null, 'Error interno del servidor', 500)
        );
      }
    };
  };
  
  // Middleware de autorización por permisos específicos
  const requirePermission = (permission) => {
    return (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json(
            standardResponse(null, 'Token de autenticación requerido', 401)
          );
        }
        
        const userRole = req.user.role || 'guest';
        
        if (hasPermission(userRole, permission)) {
          return next();
        }
        
        logger.warn('Intento de acceso sin permisos suficientes', {
          userId: req.user.id,
          userRole,
          requiredPermission: permission,
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        
        return res.status(403).json(
          standardResponse(
            null, 
            \`Permiso insuficiente. Se requiere: \${permission}\`,
            403
          )
        );
      } catch (error) {
        logger.error('Error en middleware de permisos:', error);
        return res.status(500).json(
          standardResponse(null, 'Error interno del servidor', 500)
        );
      }
    };
  };
  
  // Función para verificar si el usuario es propietario del recurso
  const requireOwnership = (getResourceOwnerId) => {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json(
            standardResponse(null, 'Token de autenticación requerido', 401)
          );
        }
        
        // Los admins pueden acceder a cualquier recurso
        if (req.user.role === 'admin') {
          return next();
        }
        
        const resourceOwnerId = await getResourceOwnerId(req);
        
        if (req.user.id === resourceOwnerId) {
          return next();
        }
        
        logger.warn('Intento de acceso a recurso no propio', {
          userId: req.user.id,
          resourceOwnerId,
          path: req.path,
          method: req.method,
          ip: req.ip
        });
        
        return res.status(403).json(
          standardResponse(
            null, 
            'Solo puedes acceder a tus propios recursos',
            403
          )
        );
      } catch (error) {
        logger.error('Error en middleware de propiedad:', error);
        return res.status(500).json(
          standardResponse(null, 'Error interno del servidor', 500)
        );
      }
    };
  };
  
  module.exports = {
    authorize,
    requirePermission,
    requireOwnership,
    hasPermission,
    rolePermissions
  };`;
  };
  
  // Función para generar documentación Swagger
  const generateSwaggerDocumentation = (backendStructure) => {
    const models = backendStructure.models || [];
    const routes = backendStructure.routes || [];
    
    const swaggerDoc = {
      openapi: '3.0.0',
      info: {
        title: 'Generated Backend API',
        version: '1.0.0',
        description: 'API generada automáticamente con funcionalidades completas',
        contact: {
          name: 'API Support',
          email: 'support@example.com'
        }
      },
      servers: [
        {
          url: 'http://localhost:3000/api/v1',
          description: 'Servidor de desarrollo'
        },
        {
          url: 'https://api.example.com/api/v1',
          description: 'Servidor de producción'
        }
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        },
        schemas: {},
        responses: {
          UnauthorizedError: {
            description: 'Token de acceso faltante o inválido',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Token de autenticación requerido' },
                    statusCode: { type: 'number', example: 401 }
                  }
                }
              }
            }
          },
          ForbiddenError: {
            description: 'Acceso denegado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Acceso denegado' },
                    statusCode: { type: 'number', example: 403 }
                  }
                }
              }
            }
          },
          ValidationError: {
            description: 'Error de validación',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    message: { type: 'string', example: 'Datos de entrada inválidos' },
                    statusCode: { type: 'number', example: 400 },
                    errors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          field: { type: 'string' },
                          message: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      security: [
        {
          bearerAuth: []
        }
      ],
      paths: {}
    };
    
    // Generar esquemas para modelos
    models.forEach(model => {
      const schemaName = model.name;
      swaggerDoc.components.schemas[schemaName] = {
        type: 'object',
        properties: {
          _id: {
            type: 'string',
            description: 'ID único del documento',
            example: '507f1f77bcf86cd799439011'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Fecha de creación'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Fecha de última actualización'
          }
        },
        required: ['_id']
      };
    });
    
    // Generar paths básicos para cada modelo
    models.forEach(model => {
      const modelName = model.name.toLowerCase();
      const pluralName = modelName + 's';
      
      // GET /models
      swaggerDoc.paths[`/${pluralName}`] = {
        get: {
          tags: [model.name],
          summary: `Obtener lista de ${pluralName}`,
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', minimum: 1, default: 1 },
              description: 'Número de página'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
              description: 'Elementos por página'
            },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', default: '-createdAt' },
              description: 'Campo de ordenación'
            }
          ],
          responses: {
            '200': {
              description: 'Lista obtenida exitosamente',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'array',
                        items: { $ref: `#/components/schemas/${model.name}` }
                      },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          page: { type: 'integer' },
                          limit: { type: 'integer' },
                          totalPages: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/UnauthorizedError' },
            '403': { $ref: '#/components/responses/ForbiddenError' }
          }
        },
        post: {
          tags: [model.name],
          summary: `Crear nuevo ${modelName}`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${model.name}` }
              }
            }
          },
          responses: {
            '201': {
              description: `${model.name} creado exitosamente`,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: `#/components/schemas/${model.name}` },
                      message: { type: 'string', example: `${model.name} creado exitosamente` }
                    }
                  }
                }
              }
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/UnauthorizedError' },
            '403': { $ref: '#/components/responses/ForbiddenError' }
          }
        }
      };
      
      // GET, PUT, DELETE /models/:id
      swaggerDoc.paths[`/${pluralName}/{id}`] = {
        get: {
          tags: [model.name],
          summary: `Obtener ${modelName} por ID`,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: `ID del ${modelName}`
            }
          ],
          responses: {
            '200': {
              description: `${model.name} encontrado`,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: { $ref: `#/components/schemas/${model.name}` }
                    }
                  }
                }
              }
            },
            '404': {
              description: `${model.name} no encontrado`
            },
            '401': { $ref: '#/components/responses/UnauthorizedError' }
          }
        },
        put: {
          tags: [model.name],
          summary: `Actualizar ${modelName}`,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: `ID del ${modelName}`
            }
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${model.name}` }
              }
            }
          },
          responses: {
            '200': {
              description: `${model.name} actualizado exitosamente`
            },
            '400': { $ref: '#/components/responses/ValidationError' },
            '401': { $ref: '#/components/responses/UnauthorizedError' },
            '403': { $ref: '#/components/responses/ForbiddenError' },
            '404': {
              description: `${model.name} no encontrado`
            }
          }
        },
        delete: {
          tags: [model.name],
          summary: `Eliminar ${modelName}`,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: `ID del ${modelName}`
            }
          ],
          responses: {
            '200': {
              description: `${model.name} eliminado exitosamente`
            },
            '401': { $ref: '#/components/responses/UnauthorizedError' },
            '403': { $ref: '#/components/responses/ForbiddenError' },
            '404': {
              description: `${model.name} no encontrado`
            }
          }
        }
      };
    });
    
    return swaggerDoc;
  };
  
  // Función para generar README completo
  const generateAdvancedReadme = async (framework, includeDatabase) => {
    return `# Generated Backend API
  
  ## 📋 Descripción
  
  Backend generado automáticamente con funcionalidades empresariales completas, incluyendo:
  
  - 🔐 **Seguridad avanzada**: Helmet, CORS dinámico, Rate limiting
  - 🛡️ **Autenticación y autorización**: JWT + RBAC
  - ✅ **Validación robusta**: Zod/Celebrate para todos los inputs
  - 📊 **Observabilidad**: Logging estructurado, métricas Prometheus
  - 📚 **Documentación**: Swagger/OpenAPI automática
  - 🧪 **Testing**: Jest + Supertest + MongoDB Memory Server
  - 🐳 **Containerización**: Docker + Docker Compose
  
  ## 🚀 Inicio Rápido
  
  ### Prerrequisitos
  
  - Node.js >= 18.0.0
  - npm >= 8.0.0
  ${includeDatabase ? '- MongoDB >= 5.0.0 (o usar Docker)' : ''}
  - Docker (opcional)
  
  ### Instalación
  
  \`\`\`bash
  # Clonar el repositorio
  git clone <repository-url>
  cd generated-backend
  
  # Instalar dependencias
  npm install
  
  # Configurar variables de entorno
  cp .env.example .env
  # Editar .env con tus configuraciones
  \`\`\`
  
  ### Variables de Entorno
  
  Copia \`.env.example\` a \`.env\` y configura:
  
  \`\`\`env
  # Servidor
  PORT=3000
  NODE_ENV=development
  
  # Base de datos${includeDatabase ? '\nMONGODB_URI=mongodb://localhost:27017/generated-backend' : ''}
  
  # JWT
  JWT_SECRET=tu-jwt-secret-muy-seguro
  JWT_EXPIRES_IN=7d
  
  # CORS
  ALLOWED_ORIGINS=http://localhost:3000,https://astrocode-eba407d9ef8a.herokuapp.com
  
  # Rate Limiting
  RATE_LIMIT_MAX=100
  
  # Logging
  LOG_LEVEL=info
  \`\`\`
  
  ## 🏃‍♂️ Ejecución
  
  ### Desarrollo
  
  \`\`\`bash
  # Modo desarrollo con hot reload
  npm run dev
  
  # Ejecutar con datos de ejemplo
  npm run seed
  npm run dev
  \`\`\`
  
  ### Producción
  
  \`\`\`bash
  # Construir y ejecutar
  npm start
  \`\`\`
  
  ### Con Docker
  
  \`\`\`bash
  # Construir imagen
  npm run docker:build
  
  # Ejecutar con Docker Compose (incluye MongoDB)
  npm run docker:run
  
  # O manualmente
  docker-compose up -d
  \`\`\`
  
  ## 🧪 Cómo Ejecutar Tests
  
  ### Tests Unitarios
  
  \`\`\`bash
  # Ejecutar todos los tests
  npm test
  
  # Tests en modo watch
  npm run test:watch
  
  # Tests con coverage
  npm run test:coverage
  \`\`\`
  
  ### Tests de Integración
  
  \`\`\`bash
  # Los tests de integración usan MongoDB Memory Server
  # No necesitas una instancia real de MongoDB
  npm test
  \`\`\`
  
  ### Estructura de Tests
  
  \`\`\`
  __tests__/
  ├── models/           # Tests de modelos
  ├── controllers/      # Tests de controladores
  ├── routes/          # Tests de rutas (integración)
  ├── middleware/      # Tests de middleware
  └── utils/           # Tests de utilidades
  \`\`\`
  
  ## 🐳 Cómo Desplegar con Docker
  
  ### Desarrollo
  
  \`\`\`bash
  # Construir imagen de desarrollo
  docker build -t generated-backend:dev .
  
  # Ejecutar con docker-compose
  docker-compose -f docker-compose.dev.yml up -d
  \`\`\`
  
  ### Producción
  
  \`\`\`bash
  # Construir imagen optimizada
  docker build -f Dockerfile.prod -t generated-backend:prod .
  
  # Ejecutar en producción
  docker-compose -f docker-compose.prod.yml up -d
  \`\`\`
  
  ### Variables de Entorno en Docker
  
  \`\`\`bash
  # Crear archivo .env.docker
  cp .env.example .env.docker
  
  # Editar configuraciones para Docker
  # MongoDB URI: mongodb://mongo:27017/generated-backend
  \`\`\`
  
  ## 📁 Diagrama de Carpetas
  
  \`\`\`
  generated-backend/
  ├── 📁 config/              # Configuraciones
  │   ├── database.js         # Conexión a BD
  │   ├── env.js             # Validación de env vars
  │   └── swagger.js         # Config Swagger
  ├── 📁 controllers/         # Controladores (orquestadores)
  ├── 📁 services/           # Lógica de negocio
  ├── 📁 models/             # Modelos de datos (Mongoose)
  ├── 📁 routes/             # Definición de rutas
  ├── 📁 middleware/         # Middleware personalizado
  │   ├── auth.js           # Autenticación JWT
  │   ├── rbac.js           # Control de acceso por roles
  │   ├── errorHandler.js   # Manejo de errores
  │   ├── logger.js         # Logging middleware
  │   ├── rateLimiter.js    # Rate limiting
  │   ├── validate.js       # Validación con Zod
  │   └── metrics.js        # Métricas Prometheus
  ├── 📁 utils/              # Utilidades
  │   ├── response.js       # Respuestas estandarizadas
  │   ├── logger.js         # Logger configurado
  │   └── constants.js      # Constantes
  ├── 📁 __tests__/          # Tests
  │   ├── models/
  │   ├── controllers/
  │   ├── routes/
  │   └── middleware/
  ├── 📁 .github/workflows/  # CI/CD
  │   └── ci.yml
  ├── 📄 server.js           # Punto de entrada
  ├── 📄 seed.js             # Datos de ejemplo
  ├── 📄 swagger.yaml        # Documentación API
  ├── 📄 Dockerfile          # Imagen Docker
  ├── 📄 docker-compose.yml  # Orquestación
  ├── 📄 .env.example        # Variables de entorno
  ├── 📄 .eslintrc.cjs       # Configuración ESLint
  ├── 📄 .prettierrc         # Configuración Prettier
  └── 📄 package.json        # Dependencias y scripts
  \`\`\`
  
  ## 📚 Documentación API
  
  ### Swagger UI
  
  La documentación interactiva está disponible en:
  
  - **Desarrollo**: http://localhost:3000/docs
  - **Producción**: https://tu-dominio.com/docs
  
  ### Endpoints Principales
  
  - \`GET /health\` - Health check
  - \`GET /ready\` - Readiness check
  - \`GET /metrics\` - Métricas Prometheus
  - \`GET /docs\` - Documentación Swagger
  - \`/api/v1/*\` - Endpoints de la API
  
  ## 🔐 Seguridad
  
  ### Autenticación
  
  \`\`\`javascript
  // Obtener token
  POST /api/v1/auth/login
  {
    "email": "user@example.com",
    "password": "password"
  }
  
  // Usar token en headers
  Authorization: Bearer <jwt-token>
  \`\`\`
  
  ### Roles y Permisos
  
  - **admin**: Acceso total
  - **editor**: Gestión de contenido
  - **moderator**: Moderación
  - **user**: Acceso básico
  - **guest**: Solo lectura
  
  ### Rate Limiting
  
  - **API**: 100 requests/15min por IP
  - **Slow down**: Delay progresivo después de 50 requests
  - **Health checks**: Sin límite
  
  ## 📊 Monitoreo
  
  ### Métricas Prometheus
  
  \`\`\`bash
  # Métricas disponibles en /metrics
  curl http://localhost:3000/metrics
  \`\`\`
  
  ### Logging
  
  - **Formato**: JSON estructurado (Pino)
  - **Niveles**: fatal, error, warn, info, debug, trace
  - **Correlación**: Request ID automático
  
  ### Health Checks
  
  \`\`\`bash
  # Health check básico
  curl http://localhost:3000/health
  
  # Readiness check (incluye BD)
  curl http://localhost:3000/ready
  \`\`\`
  
  ## 🛠️ Desarrollo
  
  ### Scripts Disponibles
  
  \`\`\`bash
  npm run dev          # Desarrollo con nodemon
  npm test             # Ejecutar tests
  npm run test:watch   # Tests en modo watch
  npm run test:coverage # Coverage de tests
  npm run lint         # Linter ESLint
  npm run lint:fix     # Fix automático ESLint
  npm run format       # Formatear con Prettier
  npm run seed         # Cargar datos de ejemplo
  npm run docker:build # Construir imagen Docker
  npm run docker:run   # Ejecutar con Docker Compose
  \`\`\`
  
  ### Agregar Nuevos Endpoints
  
  1. **Crear modelo** en \`models/\`
  2. **Crear servicio** en \`services/\`
  3. **Crear controlador** en \`controllers/\`
  4. **Definir rutas** en \`routes/\`
  5. **Agregar tests** en \`__tests__/\`
  6. **Actualizar Swagger** en \`swagger.yaml\`
  
  ## 🤝 Contribución
  
  1. Fork el proyecto
  2. Crear rama feature (\`git checkout -b feature/nueva-funcionalidad\`)
  3. Commit cambios (\`git commit -am 'Agregar nueva funcionalidad'\`)
  4. Push a la rama (\`git push origin feature/nueva-funcionalidad\`)
  5. Crear Pull Request
  
  ## 📝 Licencia
  
  Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.
  
  ## 🆘 Soporte
  
  Para soporte y preguntas:
  
  - 📧 Email: support@example.com
  - 📚 Documentación: http://localhost:3000/docs
  - 🐛 Issues: [GitHub Issues](https://github.com/tu-repo/issues)
  
  ---
  
  **Generado automáticamente** 🤖 | **Listo para producción** 🚀`;
  };
  
  // Función para generar archivo .env.example
  const generateEnvExample = () => {
    return `# ==============================================
  # CONFIGURACIÓN DEL SERVIDOR
  # ==============================================
  PORT=3000
  NODE_ENV=development
  
  # ==============================================
  # BASE DE DATOS
  # ==============================================
  MONGODB_URI=mongodb://localhost:27017/generated-backend
  MONGODB_TEST_URI=mongodb://localhost:27017/generated-backend-test
  
  # ==============================================
  # AUTENTICACIÓN JWT
  # ==============================================
  JWT_SECRET=tu-jwt-secret-muy-seguro-cambialo-en-produccion
  JWT_EXPIRES_IN=7d
  JWT_REFRESH_SECRET=tu-refresh-secret-muy-seguro
  JWT_REFRESH_EXPIRES_IN=30d
  
  # ==============================================
  # CORS - Orígenes permitidos (separados por coma)
  # ==============================================
  ALLOWED_ORIGINS=http://localhost:3000,https://astrocode-eba407d9ef8a.herokuapp.com,http://localhost:5173
  
  # ==============================================
  # RATE LIMITING
  # ==============================================
  RATE_LIMIT_MAX=100
  RATE_LIMIT_WINDOW_MS=900000
  
  # ==============================================
  # LOGGING
  # ==============================================
  LOG_LEVEL=info
  LOG_FILE=logs/app.log
  
  # ==============================================
  # EMAIL (opcional)
  # ==============================================
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=tu-email@gmail.com
  SMTP_PASS=tu-password-de-aplicacion
  FROM_EMAIL=noreply@tu-dominio.com
  FROM_NAME=Tu Aplicación
  
  # ==============================================
  # ALMACENAMIENTO (opcional)
  # ==============================================
  CLOUDINARY_CLOUD_NAME=tu-cloud-name
  CLOUDINARY_API_KEY=tu-api-key
  CLOUDINARY_API_SECRET=tu-api-secret
  
  # AWS S3 (alternativa a Cloudinary)
  AWS_ACCESS_KEY_ID=tu-access-key
  AWS_SECRET_ACCESS_KEY=tu-secret-key
  AWS_REGION=us-east-1
  AWS_S3_BUCKET=tu-bucket-name
  
  # ==============================================
  # REDIS (opcional - para caché y sesiones)
  # ==============================================
  REDIS_URL=redis://localhost:6379
  REDIS_PASSWORD=
  
  # ==============================================
  # MONITOREO Y MÉTRICAS
  # ==============================================
  PROMETHEUS_ENABLED=true
  METRICS_PATH=/metrics
  
  # ==============================================
  # NOTIFICACIONES (opcional)
  # ==============================================
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
  
  # ==============================================
  # APIS EXTERNAS (opcional)
  # ==============================================
  GOOGLE_CLIENT_ID=tu-google-client-id
  GOOGLE_CLIENT_SECRET=tu-google-client-secret
  
  FACEBOOK_APP_ID=tu-facebook-app-id
  FACEBOOK_APP_SECRET=tu-facebook-app-secret
  
  # ==============================================
  # DESARROLLO Y TESTING
  # ==============================================
  DEBUG=app:*
  TEST_TIMEOUT=30000
  COVERAGE_THRESHOLD=80
  
  # ==============================================
  # PRODUCCIÓN
  # ==============================================
  SSL_CERT_PATH=/path/to/cert.pem
  SSL_KEY_PATH=/path/to/key.pem
  TRUST_PROXY=true
  SESSION_SECRET=tu-session-secret-muy-seguro`;
  };

  module.exports = {
    generateBackendFromAPI,
    findAPIDirectory,
    getAPIFiles,
    createTargetedBackendAnalysisPrompt,
    createBackendAnalysisPrompt,
    parseBackendAnalysisResponse,
    generateBackendFiles,
    generateAdvancedPackageJson,
    generateAdvancedServer,
    generateRBACMiddleware,
    generateSwaggerDocumentation,
    generateAdvancedReadme,
    generateEnvExample,
    retryGeminiCall,
    mergeAndDeduplicateFiles,
    mergeFileContents
  };