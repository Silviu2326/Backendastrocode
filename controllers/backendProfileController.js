const BackendProfile = require('../models/BackendProfile');
const Project = require('../models/Project');
const mongoose = require('mongoose');
const crypto = require('crypto');
const yaml = require('js-yaml');
const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

// ============================================================================
// CRUD PRINCIPAL
// ============================================================================

/**
 * POST /backend-profiles
 * Crea un documento BackendProfile a partir de un projectId, el YAML OpenAPI y la arquitectura elegida.
 */
const createProfile = async (req, res) => {
  try {
    const { projectId, openApi, architecture = 'microservices' } = req.body;

    // Validar que el Project exista
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proyecto no encontrado' 
      });
    }

    // Validar que aún no tenga perfil
    const existingProfile = await BackendProfile.findOne({ projectId });
    if (existingProfile) {
      return res.status(409).json({ 
        success: false, 
        message: 'El proyecto ya tiene un perfil de backend' 
      });
    }

    // Validar YAML OpenAPI
    let status = 'pending';
    try {
      if (typeof openApi === 'string') {
        yaml.load(openApi);
      }
      status = 'generated';
    } catch (yamlError) {
      console.warn('YAML OpenAPI inválido:', yamlError.message);
    }

    const profile = new BackendProfile({
      projectId,
      openApi,
      architecture,
      status,
      microservices: [],
      generatorRuns: []
    });

    await profile.save();

    res.status(201).json({
      success: true,
      data: profile,
      message: 'Perfil de backend creado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al crear el perfil de backend',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id
 * Devuelve el perfil completo.
 */
const getProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const { populate } = req.query;

    let query = BackendProfile.findById(id);
    
    if (populate === 'project') {
      query = query.populate('projectId', 'name status description');
    }

    const profile = await query;
    
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    res.json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener el perfil de backend',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles
 * Lista perfiles filtrados (paginación, búsqueda, estado).
 */
const listProfiles = async (req, res) => {
  try {
    const { 
      projectId, 
      status, 
      architecture,
      page = 1, 
      limit = 10,
      sort = '-createdAt'
    } = req.query;

    // Construir filtros
    const filters = {};
    if (projectId) filters.projectId = projectId;
    if (status) filters.status = status;
    if (architecture) filters.architecture = architecture;

    // Paginación
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [profiles, total] = await Promise.all([
      BackendProfile.find(filters)
        .populate('projectId', 'name status')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      BackendProfile.countDocuments(filters)
    ]);

    res.json({
      success: true,
      data: profiles,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al listar perfiles de backend',
      error: error.message
    });
  }
};

/**
 * PATCH /backend-profiles/:id
 * Permite cambiar campos de alto nivel.
 */
const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Campos permitidos para actualización
    const allowedUpdates = ['architecture', 'status', 'openApi'];
    const actualUpdates = {};
    
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        actualUpdates[key] = updates[key];
      }
    });

    const profile = await BackendProfile.findByIdAndUpdate(
      id,
      actualUpdates,
      { new: true, runValidators: true }
    );

    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    res.json({
      success: true,
      data: profile,
      message: 'Perfil actualizado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar el perfil',
      error: error.message
    });
  }
};

/**
 * DELETE /backend-profiles/:id
 * Borra el perfil y sus artefactos asociados.
 */
const deleteProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const profile = await BackendProfile.findById(id);
    
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Verificar si está desplegado
    if (profile.status === 'deployed' && force !== 'true') {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar un perfil desplegado sin confirmación',
        hint: 'Usa ?force=true para forzar la eliminación'
      });
    }

    await BackendProfile.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Perfil de backend eliminado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el perfil',
      error: error.message
    });
  }
};

// ============================================================================
// MICROSERVICIOS
// ============================================================================

/**
 * POST /backend-profiles/:id/microservices
 * Inserta un microservicio con puertos y endpoints vacíos.
 */
const addMicroservice = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, port, language = 'node20', dockerImage } = req.body;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Verificar colisión de puerto
    const portExists = profile.microservices.some(ms => ms.port === port);
    if (portExists) {
      return res.status(409).json({
        success: false,
        message: `El puerto ${port} ya está en uso por otro microservicio`
      });
    }

    const newMicroservice = {
      name,
      port,
      language,
      dockerImage,
      endpoints: [],
      status: 'draft'
    };

    profile.microservices.push(newMicroservice);
    await profile.save();

    const addedMicroservice = profile.microservices[profile.microservices.length - 1];

    res.status(201).json({
      success: true,
      data: addedMicroservice,
      message: 'Microservicio agregado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar microservicio',
      error: error.message
    });
  }
};

/**
 * PATCH /backend-profiles/:id/microservices/:msId
 * Cambia nombre, puerto, imagen o status de un microservicio.
 */
const updateMicroservice = async (req, res) => {
  try {
    const { id, msId } = req.params;
    const updates = req.body;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const microservice = profile.microservices.id(msId);
    if (!microservice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Microservicio no encontrado' 
      });
    }

    // Verificar colisión de puerto si se está actualizando
    if (updates.port && updates.port !== microservice.port) {
      const portExists = profile.microservices.some(ms => 
        ms._id.toString() !== msId && ms.port === updates.port
      );
      if (portExists) {
        return res.status(409).json({
          success: false,
          message: `El puerto ${updates.port} ya está en uso por otro microservicio`
        });
      }
    }

    // Actualizar campos permitidos
    const allowedUpdates = ['name', 'port', 'language', 'dockerImage', 'status'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        microservice[field] = updates[field];
      }
    });

    await profile.save();

    res.json({
      success: true,
      data: microservice,
      message: 'Microservicio actualizado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar microservicio',
      error: error.message
    });
  }
};

/**
 * DELETE /backend-profiles/:id/microservices/:msId
 * Elimina un microservicio completo.
 */
const removeMicroservice = async (req, res) => {
  try {
    const { id, msId } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Rechazar si es monolítico
    if (profile.architecture === 'monolith') {
      return res.status(409).json({
        success: false,
        message: 'No se puede eliminar microservicios en arquitectura monolítica'
      });
    }

    const microservice = profile.microservices.id(msId);
    if (!microservice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Microservicio no encontrado' 
      });
    }

    profile.microservices.pull(msId);
    await profile.save();

    res.json({
      success: true,
      message: 'Microservicio eliminado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar microservicio',
      error: error.message
    });
  }
};

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /backend-profiles/:id/microservices/:msId/endpoints
 * Agrega un endpoint.
 */
const addEndpoint = async (req, res) => {
  try {
    const { id, msId } = req.params;
    const { operationId, method, route, summary, schemas } = req.body;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const microservice = profile.microservices.id(msId);
    if (!microservice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Microservicio no encontrado' 
      });
    }

    // Validar unicidad de operationId
    const operationExists = microservice.endpoints.some(ep => ep.operationId === operationId);
    if (operationExists) {
      return res.status(409).json({
        success: false,
        message: `El operationId '${operationId}' ya existe en este microservicio`
      });
    }

    const newEndpoint = {
      operationId,
      method: method.toUpperCase(),
      route,
      summary,
      schemas: schemas || { request: null, response: null }
    };

    microservice.endpoints.push(newEndpoint);
    await profile.save();

    const addedEndpoint = microservice.endpoints[microservice.endpoints.length - 1];

    res.status(201).json({
      success: true,
      data: addedEndpoint,
      message: 'Endpoint agregado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al agregar endpoint',
      error: error.message
    });
  }
};

/**
 * PATCH /backend-profiles/:id/microservices/:msId/endpoints/:epId
 * Edita ruta, summary o schemas del endpoint.
 */
const updateEndpoint = async (req, res) => {
  try {
    const { id, msId, epId } = req.params;
    const updates = req.body;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const microservice = profile.microservices.id(msId);
    if (!microservice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Microservicio no encontrado' 
      });
    }

    const endpoint = microservice.endpoints.id(epId);
    if (!endpoint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Endpoint no encontrado' 
      });
    }

    // Actualizar campos permitidos
    const allowedUpdates = ['route', 'summary', 'schemas', 'method'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'method') {
          endpoint[field] = updates[field].toUpperCase();
        } else {
          endpoint[field] = updates[field];
        }
      }
    });

    await profile.save();

    res.json({
      success: true,
      data: endpoint,
      message: 'Endpoint actualizado exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al actualizar endpoint',
      error: error.message
    });
  }
};

/**
 * DELETE /backend-profiles/:id/microservices/:msId/endpoints/:epId
 * Elimina un endpoint específico.
 */
const removeEndpoint = async (req, res) => {
  try {
    const { id, msId, epId } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const microservice = profile.microservices.id(msId);
    if (!microservice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Microservicio no encontrado' 
      });
    }

    const endpoint = microservice.endpoints.id(epId);
    if (!endpoint) {
      return res.status(404).json({ 
        success: false, 
        message: 'Endpoint no encontrado' 
      });
    }

    microservice.endpoints.pull(epId);
    await profile.save();

    // Sugerir borrar microservicio si queda sin endpoints
    const suggestion = microservice.endpoints.length === 0 ? 
      'El microservicio quedó sin endpoints. Considera eliminarlo.' : null;

    res.json({
      success: true,
      message: 'Endpoint eliminado exitosamente',
      suggestion
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al eliminar endpoint',
      error: error.message
    });
  }
};

// ============================================================================
// GENERATOR RUNS
// ============================================================================

/**
 * POST /backend-profiles/:id/generate
 * Lanza el pipeline y guarda un nuevo generatorRun.
 */
const triggerGeneration = async (req, res) => {
  try {
    const { id } = req.params;
    const { openApiChecksum } = req.body;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Crear nuevo run
    const runData = {
      startedAt: new Date(),
      status: 'success', // Cambiar a 'failed' si hay error
      logPath: `/logs/generation-${id}-${Date.now()}.log`,
      openApiChecksum: openApiChecksum || crypto.createHash('sha256').update(JSON.stringify(profile.openApi)).digest('hex')
    };

    // Simular proceso de generación (aquí iría la lógica real)
    try {
      // TODO: Implementar pipeline real con Gemini + templates
      console.log('Iniciando generación para perfil:', id);
      
      // Finalizar run exitosamente
      runData.finishedAt = new Date();
      runData.status = 'success';
      
      // Actualizar estado del perfil
      profile.status = 'generated';
    } catch (generationError) {
      runData.finishedAt = new Date();
      runData.status = 'failed';
      profile.status = 'failed';
    }

    await profile.addGeneratorRun(runData);

    res.json({
      success: true,
      data: {
        profileStatus: profile.status,
        lastRun: profile.getLastGeneratorRun()
      },
      message: 'Generación completada'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al ejecutar la generación',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id/runs
 * Devuelve el historial completo.
 */
const getGeneratorRuns = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Paginación inversa
    const sortedRuns = profile.generatorRuns.sort((a, b) => b.startedAt - a.startedAt);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedRuns = sortedRuns.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: paginatedRuns,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(sortedRuns.length / parseInt(limit)),
        total: sortedRuns.length,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener historial de generaciones',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id/last-run
 * Devuelve el objeto creado por getLastGeneratorRun().
 */
const getLastRun = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const lastRun = profile.getLastGeneratorRun();

    res.json({
      success: true,
      data: lastRun,
      message: lastRun ? 'Última ejecución encontrada' : 'No hay ejecuciones registradas'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener la última ejecución',
      error: error.message
    });
  }
};

// ============================================================================
// ARTEFACTOS
// ============================================================================

/**
 * GET /backend-profiles/:id/openapi
 * Sirve el YAML/JSON OpenAPI almacenado.
 */
const downloadOpenApi = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'yaml' } = req.query;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    let content = profile.openApi;
    let contentType = 'text/yaml';
    let filename = `openapi-${id}.yaml`;

    if (format === 'json') {
      if (typeof content === 'string') {
        content = JSON.stringify(yaml.load(content), null, 2);
      } else {
        content = JSON.stringify(content, null, 2);
      }
      contentType = 'application/json';
      filename = `openapi-${id}.json`;
    } else {
      if (typeof content !== 'string') {
        content = yaml.dump(content);
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al descargar OpenAPI',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id/compose
 * Devuelve el docker-compose.yml generado.
 */
const downloadDockerCompose = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Generar docker-compose.yml on-the-fly
    const composeContent = generateDockerCompose(profile);

    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', `attachment; filename="docker-compose-${id}.yml"`);
    res.send(composeContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al generar docker-compose',
      error: error.message
    });
  }
};

// ============================================================================
// ESTADÍSTICAS
// ============================================================================

/**
 * GET /backend-profiles/:id/stats
 * Responde { totalEndpoints, microservicesByStatus, lastRun }.
 */
const getStats = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const stats = {
      totalEndpoints: profile.totalEndpoints,
      microservicesByStatus: profile.microservicesByStatus,
      lastRun: profile.getLastGeneratorRun(),
      totalMicroservices: profile.microservices.length,
      architecture: profile.architecture,
      status: profile.status,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
};

// ============================================================================
// PROMPTS GEMINI
// ============================================================================

/**
 * POST /backend-profiles/:id/prompts
 * Genera automáticamente todos los prompts necesarios para Gemini.
 */
const generatePrompts = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id).populate('projectId');
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    const project = profile.projectId;
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Proyecto asociado no encontrado' 
      });
    }

    // Crear directorio de prompts
    const promptsDir = path.join(process.cwd(), 'artifacts', id, 'prompts');
    await fs.mkdir(promptsDir, { recursive: true });

    // Obtener estructura de archivos del proyecto
    const fileStructure = project.fileStructure || { files: [] };
    const apiFiles = fileStructure.files.filter(file => 
      file.path && file.path.includes('src/features/') && file.path.endsWith('/api.ts')
    );

    // Extraer dominios únicos de los archivos API
    const domains = [...new Set(apiFiles.map(file => {
      const match = file.path.match(/src\/features\/([^\/]+)\//); 
      return match ? match[1] : 'default';
    }))];

    const prompts = [];

    // 1. 01_context.prompt (system)
    const contextPrompt = generateContextPrompt(project, profile);
    await fs.writeFile(path.join(promptsDir, '01_context.prompt'), contextPrompt);
    prompts.push({ name: '01_context.prompt', type: 'system' });

    // 2. 02_extract.prompt × n (uno por api.ts)
    for (let i = 0; i < apiFiles.length; i++) {
      const apiFile = apiFiles[i];
      const extractPrompt = generateExtractPrompt(apiFile, i + 1);
      const fileName = `02_extract_${String(i + 1).padStart(2, '0')}.prompt`;
      await fs.writeFile(path.join(promptsDir, fileName), extractPrompt);
      prompts.push({ name: fileName, type: 'extract', apiFile: apiFile.path });
    }

    // 3. 03_merge.prompt
    const mergePrompt = generateMergePrompt(apiFiles);
    await fs.writeFile(path.join(promptsDir, '03_merge.prompt'), mergePrompt);
    prompts.push({ name: '03_merge.prompt', type: 'merge' });

    // 4. 04_partition.prompt
    const partitionPrompt = generatePartitionPrompt(domains);
    await fs.writeFile(path.join(promptsDir, '04_partition.prompt'), partitionPrompt);
    prompts.push({ name: '04_partition.prompt', type: 'partition' });

    // 5. 05_scaffold.prompt × dominios
    for (const domain of domains) {
      const scaffoldPrompt = generateScaffoldPrompt(domain, profile.architecture);
      const fileName = `05_scaffold_${domain}.prompt`;
      await fs.writeFile(path.join(promptsDir, fileName), scaffoldPrompt);
      prompts.push({ name: fileName, type: 'scaffold', domain });
    }

    // 6. 06_orchestrate.prompt
    const orchestratePrompt = generateOrchestratePrompt(domains, profile);
    await fs.writeFile(path.join(promptsDir, '06_orchestrate.prompt'), orchestratePrompt);
    prompts.push({ name: '06_orchestrate.prompt', type: 'orchestrate' });

    // 7. 07_sdk.prompt
    const sdkPrompt = generateSdkPrompt(profile);
    await fs.writeFile(path.join(promptsDir, '07_sdk.prompt'), sdkPrompt);
    prompts.push({ name: '07_sdk.prompt', type: 'sdk' });

    // Actualizar el perfil con la ruta de prompts
    profile.promptsPath = promptsDir;
    await profile.save();

    res.json({
      success: true,
      data: {
        promptsPath: promptsDir,
        totalFiles: prompts.length,
        prompts
      },
      message: 'Prompts generados exitosamente'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al generar prompts',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id/prompts
 * Devuelve un JSON con el índice de prompts generados.
 */
const listPrompts = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    if (!profile.promptsPath) {
      return res.json({
        success: true,
        data: [],
        message: 'No se han generado prompts aún'
      });
    }

    try {
      const files = await fs.readdir(profile.promptsPath);
      const promptFiles = files.filter(file => file.endsWith('.prompt'));
      
      const promptsInfo = await Promise.all(
        promptFiles.map(async (file) => {
          const filePath = path.join(profile.promptsPath, file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime
          };
        })
      );

      res.json({
        success: true,
        data: promptsInfo.sort((a, b) => a.name.localeCompare(b.name)),
        total: promptsInfo.length
      });
    } catch (fsError) {
      res.json({
        success: true,
        data: [],
        message: 'Directorio de prompts no encontrado'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al listar prompts',
      error: error.message
    });
  }
};

/**
 * GET /backend-profiles/:id/prompts.zip
 * Comprime la carpeta y la envía como descarga.
 */
const downloadPromptBundle = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    if (!profile.promptsPath) {
      return res.status(404).json({
        success: false,
        message: 'No se han generado prompts para este perfil'
      });
    }

    try {
      // Verificar que el directorio existe
      await fs.access(profile.promptsPath);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'Directorio de prompts no encontrado'
      });
    }

    // Configurar headers para descarga
    const filename = `prompts_${id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Crear archivo ZIP
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      res.status(500).json({
        success: false,
        message: 'Error al crear archivo ZIP',
        error: err.message
      });
    });

    // Pipe del archivo al response
    archive.pipe(res);

    // Agregar todos los archivos .prompt al ZIP
    archive.directory(profile.promptsPath, false);

    // Finalizar el archivo
    await archive.finalize();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al descargar bundle de prompts',
      error: error.message
    });
  }
};

/**
 * POST /backend-profiles/:id/prompts/rebuild
 * Elimina los prompts anteriores y ejecuta de nuevo generatePrompts.
 */
const regeneratePrompts = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await BackendProfile.findById(id);
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Perfil de backend no encontrado' 
      });
    }

    // Eliminar prompts anteriores si existen
    if (profile.promptsPath) {
      try {
        const files = await fs.readdir(profile.promptsPath);
        const promptFiles = files.filter(file => file.endsWith('.prompt'));
        
        await Promise.all(
          promptFiles.map(file => 
            fs.unlink(path.join(profile.promptsPath, file))
          )
        );
      } catch (fsError) {
        console.warn('Error al eliminar prompts anteriores:', fsError.message);
      }
    }

    // Ejecutar generatePrompts nuevamente
    req.params.id = id;
    await generatePrompts(req, res);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al regenerar prompts',
      error: error.message
    });
  }
};

// ============================================================================
// FUNCIONES AUXILIARES PARA GENERACIÓN DE PROMPTS
// ============================================================================

function generateContextPrompt(project, profile) {
  return `# Context Prompt - Sistema de Generación de Backend

## Información del Proyecto
- **Nombre**: ${project.name}
- **Descripción**: ${project.description}
- **Arquitectura**: ${profile.architecture}
- **Tech Stack**: ${project.techStack?.join(', ') || 'No especificado'}

## Objetivo
Generar un backend completo basado en la especificación OpenAPI y la estructura del frontend.

## Instrucciones Generales
1. Mantener consistencia con la arquitectura elegida (${profile.architecture})
2. Seguir las mejores prácticas de desarrollo
3. Implementar validaciones robustas
4. Incluir manejo de errores apropiado
5. Documentar el código generado

## Microservicios Definidos
${profile.microservices.map(ms => `- **${ms.name}** (Puerto: ${ms.port}, Lenguaje: ${ms.language})`).join('\n')}

---
Este prompt establece el contexto para toda la generación de código backend.
`;
}

function generateExtractPrompt(apiFile, index) {
  return `# Extract Prompt ${String(index).padStart(2, '0')} - Análisis de API

## Archivo a Analizar
**Ruta**: ${apiFile.path}
**Nombre**: ${apiFile.name}

## Tarea
Analiza el archivo API TypeScript y extrae:

1. **Endpoints definidos**:
   - Métodos HTTP
   - Rutas
   - Parámetros
   - Tipos de request/response

2. **Modelos de datos**:
   - Interfaces
   - Types
   - Enums

3. **Validaciones**:
   - Esquemas de validación
   - Reglas de negocio

4. **Dependencias**:
   - Imports externos
   - Servicios utilizados

## Formato de Salida
Devuelve un JSON estructurado con toda la información extraída.

---
Procesa únicamente el archivo: ${apiFile.path}
`;
}

function generateMergePrompt(apiFiles) {
  return `# Merge Prompt - Consolidación de APIs

## Archivos Procesados
${apiFiles.map((file, i) => `${i + 1}. ${file.path}`).join('\n')}

## Tarea
Consolida toda la información extraída de los archivos API en una especificación OpenAPI unificada.

### Pasos:
1. **Combinar endpoints** evitando duplicados
2. **Unificar modelos** resolviendo conflictos
3. **Normalizar rutas** siguiendo convenciones REST
4. **Validar consistencia** entre endpoints relacionados
5. **Generar esquemas** OpenAPI 3.0 completos

### Consideraciones:
- Resolver conflictos de naming
- Mantener compatibilidad entre versiones
- Agrupar endpoints por dominio funcional
- Definir responses de error estándar

## Formato de Salida
Especificación OpenAPI 3.0 completa en formato YAML.

---
Consolida ${apiFiles.length} archivos API en una especificación unificada.
`;
}

function generatePartitionPrompt(domains) {
  return `# Partition Prompt - Particionado por Dominios

## Dominios Identificados
${domains.map((domain, i) => `${i + 1}. **${domain}**`).join('\n')}

## Tarea
Particiona la especificación OpenAPI unificada en microservicios por dominio.

### Criterios de Particionado:
1. **Cohesión funcional**: Endpoints relacionados en el mismo servicio
2. **Bajo acoplamiento**: Minimizar dependencias entre servicios
3. **Escalabilidad**: Permitir escalado independiente
4. **Responsabilidad única**: Cada servicio con propósito claro

### Para cada dominio generar:
- Lista de endpoints asignados
- Modelos de datos necesarios
- Dependencias externas
- Configuración de base de datos
- Puertos asignados

## Formato de Salida
JSON con la distribución de endpoints y recursos por microservicio.

---
Particiona en ${domains.length} dominios: ${domains.join(', ')}
`;
}

function generateScaffoldPrompt(domain, architecture) {
  return `# Scaffold Prompt - ${domain}

## Dominio: ${domain}
## Arquitectura: ${architecture}

## Tarea
Genera la estructura completa del microservicio para el dominio **${domain}**.

### Estructura a Generar:
\`\`\`
${domain}-service/
├── src/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   └── app.js
├── tests/
├── package.json
├── Dockerfile
└── README.md
\`\`\`

### Componentes a Implementar:
1. **Controllers**: Lógica de endpoints
2. **Models**: Esquemas de base de datos
3. **Routes**: Definición de rutas
4. **Services**: Lógica de negocio
5. **Middleware**: Validaciones y autenticación
6. **Tests**: Pruebas unitarias e integración

### Tecnologías:
- Node.js + Express
- Base de datos según configuración
- Validación con Joi/Yup
- Testing con Jest

## Formato de Salida
Código completo del microservicio con todos los archivos necesarios.

---
Genera microservicio completo para dominio: ${domain}
`;
}

function generateOrchestratePrompt(domains, profile) {
  return `# Orchestrate Prompt - Orquestación de Servicios

## Servicios a Orquestar
${domains.map((domain, i) => `${i + 1}. **${domain}-service**`).join('\n')}

## Arquitectura: ${profile.architecture}

## Tarea
Genera la configuración de orquestación para todos los microservicios.

### Componentes a Generar:
1. **docker-compose.yml**: Configuración de contenedores
2. **API Gateway**: Enrutamiento y balanceo
3. **Service Discovery**: Registro de servicios
4. **Load Balancer**: Distribución de carga
5. **Monitoring**: Logs y métricas
6. **Health Checks**: Verificación de estado

### Configuraciones:
- Redes Docker
- Volúmenes persistentes
- Variables de entorno
- Puertos y exposición
- Dependencias entre servicios

### Herramientas:
- Docker Compose
- Nginx (API Gateway)
- Consul (Service Discovery)
- Prometheus + Grafana (Monitoring)

## Formato de Salida
Archivos de configuración completos para orquestación.

---
Orquesta ${domains.length} microservicios en arquitectura ${profile.architecture}
`;
}

function generateSdkPrompt(profile) {
  return `# SDK Prompt - Cliente JavaScript/TypeScript

## Información del Backend
- **Arquitectura**: ${profile.architecture}
- **Microservicios**: ${profile.microservices.length}
- **Total Endpoints**: ${profile.totalEndpoints || 0}

## Tarea
Genera un SDK completo para consumir la API desde el frontend.

### Características del SDK:
1. **TypeScript**: Tipado fuerte
2. **Axios**: Cliente HTTP
3. **Interceptors**: Manejo de auth y errores
4. **Retry Logic**: Reintentos automáticos
5. **Caching**: Cache de respuestas
6. **Validation**: Validación de datos

### Estructura del SDK:
\`\`\`
sdk/
├── src/
│   ├── api/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   └── [domain].ts
│   ├── types/
│   ├── utils/
│   ├── client.ts
│   └── index.ts
├── package.json
└── README.md
\`\`\`

### Funcionalidades:
- Autenticación automática
- Manejo de errores centralizado
- Tipado de requests/responses
- Documentación de uso
- Ejemplos de implementación

## Formato de Salida
SDK completo con documentación y ejemplos.

---
Genera SDK para ${profile.microservices.length} microservicios
`;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Genera un docker-compose.yml basado en los microservicios del perfil
 */
function generateDockerCompose(profile) {
  const services = {};
  
  profile.microservices.forEach(ms => {
    services[ms.name] = {
      image: ms.dockerImage || `${ms.name}:latest`,
      ports: [`${ms.port}:${ms.port}`],
      environment: {
        NODE_ENV: 'production',
        PORT: ms.port
      }
    };

    // Agregar configuración de base de datos si existe
    if (ms.database) {
      const dbServiceName = `${ms.name}-db`;
      services[dbServiceName] = {
        image: getDbImage(ms.database.engine),
        environment: getDbEnvironment(ms.database),
        volumes: [`${ms.name}-db-data:/var/lib/${ms.database.engine}`]
      };
      
      services[ms.name].depends_on = [dbServiceName];
      services[ms.name].environment.DATABASE_URL = ms.database.connectionString;
    }
  });

  const compose = {
    version: '3.8',
    services,
    volumes: {}
  };

  // Agregar volúmenes para bases de datos
  profile.microservices.forEach(ms => {
    if (ms.database) {
      compose.volumes[`${ms.name}-db-data`] = {};
    }
  });

  return yaml.dump(compose);
}

function getDbImage(engine) {
  const images = {
    postgres: 'postgres:15',
    mysql: 'mysql:8.0',
    mongodb: 'mongo:6.0',
    sqlite: 'alpine:latest',
    redis: 'redis:7'
  };
  return images[engine] || 'postgres:15';
}

function getDbEnvironment(database) {
  const env = {};
  
  switch (database.engine) {
    case 'postgres':
      env.POSTGRES_DB = database.dbName;
      env.POSTGRES_USER = 'admin';
      env.POSTGRES_PASSWORD = 'password';
      break;
    case 'mysql':
      env.MYSQL_DATABASE = database.dbName;
      env.MYSQL_USER = 'admin';
      env.MYSQL_PASSWORD = 'password';
      env.MYSQL_ROOT_PASSWORD = 'rootpassword';
      break;
    case 'mongodb':
      env.MONGO_INITDB_DATABASE = database.dbName;
      env.MONGO_INITDB_ROOT_USERNAME = 'admin';
      env.MONGO_INITDB_ROOT_PASSWORD = 'password';
      break;
  }
  
  return env;
}

module.exports = {
  // CRUD principal
  createProfile,
  getProfileById,
  listProfiles,
  updateProfile,
  deleteProfile,
  
  // Microservicios
  addMicroservice,
  updateMicroservice,
  removeMicroservice,
  
  // Endpoints
  addEndpoint,
  updateEndpoint,
  removeEndpoint,
  
  // Generator runs
  triggerGeneration,
  getGeneratorRuns,
  getLastRun,
  
  // Artefactos
  downloadOpenApi,
  downloadDockerCompose,
  
  // Estadísticas
  getStats,
  
  // Prompts Gemini
  generatePrompts,
  listPrompts,
  downloadPromptBundle,
  regeneratePrompts
};