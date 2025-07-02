import { logger } from '../../../shared/utils/logger';
import { BeDraftJobData } from '../../types/queues';
import * as fs from 'fs';
import * as path from 'path';

export interface BackendDraftResult {
  success: boolean;
  files: {
    [filePath: string]: string;
  };
  metadata: {
    framework: string;
    database: string;
    typescript: boolean;
    generatedFiles: string[];
    estimatedLines: number;
  };
  dependencies: string[];
  devDependencies: string[];
}

export class BeDraftGenerator {
  private processedCount = 0;
  private errorCount = 0;

  async generateApiDraft(data: BeDraftJobData): Promise<BackendDraftResult> {
    try {
      logger.info('Generating backend API draft', {
        apiName: data.api.name,
        apiType: data.api.type,
        framework: data.api.framework,
        database: data.api.database,
        hasTarget: !!data.userStory.target
      });

      // Check if we have a target for locate-or-create functionality
      if (data.userStory.target) {
        return this.handleLocateOrCreate(data);
      }

      const files: { [filePath: string]: string } = {};
      const dependencies: string[] = [];
      const devDependencies: string[] = [];

      // Generate based on API type
      switch (data.api.type) {
        case 'controller':
          files[`src/controllers/${data.api.name}Controller.${data.api.typescript ? 'ts' : 'js'}`] = 
            this.generateController(data);
          break;
        case 'service':
          files[`src/services/${data.api.name}Service.${data.api.typescript ? 'ts' : 'js'}`] = 
            this.generateService(data);
          break;
        case 'model':
          files[`src/models/${data.api.name}.${data.api.typescript ? 'ts' : 'js'}`] = 
            this.generateModel(data);
          break;
        case 'route':
          files[`src/routes/${data.api.name}.${data.api.typescript ? 'ts' : 'js'}`] = 
            this.generateRoute(data);
          break;
        case 'middleware':
          files[`src/middleware/${data.api.name}.${data.api.typescript ? 'ts' : 'js'}`] = 
            this.generateMiddleware(data);
          break;
      }

      // Add framework dependencies
      this.addFrameworkDependencies(data.api.framework, dependencies);
      
      // Add database dependencies
      this.addDatabaseDependencies(data.api.database, dependencies);

      // Add TypeScript dependencies if needed
      if (data.api.typescript) {
        devDependencies.push('@types/node', '@types/express', 'typescript', 'ts-node');
      }

      // Add validation dependencies if required
      if (data.requirements?.validation) {
        dependencies.push('joi', 'express-validator');
      }

      // Add authentication dependencies if required
      if (data.requirements?.authentication) {
        dependencies.push('jsonwebtoken', 'bcryptjs');
        devDependencies.push('@types/jsonwebtoken', '@types/bcryptjs');
      }

      this.processedCount++;

      return {
        success: true,
        files,
        metadata: {
          framework: data.api.framework,
          database: data.api.database,
          typescript: data.api.typescript,
          generatedFiles: Object.keys(files),
          estimatedLines: Object.values(files).reduce((total, content) => 
            total + content.split('\n').length, 0)
        },
        dependencies,
        devDependencies
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Error generating backend draft', {
        error: error.message,
        apiName: data.api.name
      });
      throw error;
    }
  }

  private generateController(data: BeDraftJobData): string {
    const { name, framework, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Controller`;
    
    if (typescript) {
      return `import { Request, Response, NextFunction } from 'express';
import { ${name}Service } from '../services/${name}Service';
import { logger } from '../utils/logger';

export class ${className} {
  private ${name}Service: ${name}Service;

  constructor() {
    this.${name}Service = new ${name}Service();
  }

  // GET /${name.toLowerCase()}
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = await this.${name}Service.findAll();
      res.json({
        success: true,
        data: items,
        message: '${name} retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting ${name}', { error: error.message });
      next(error);
    }
  }

  // GET /${name.toLowerCase()}/:id
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const item = await this.${name}Service.findById(id);
      
      if (!item) {
        res.status(404).json({
          success: false,
          message: '${name} not found'
        });
        return;
      }

      res.json({
        success: true,
        data: item,
        message: '${name} retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting ${name} by ID', { error: error.message, id: req.params.id });
      next(error);
    }
  }

  // POST /${name.toLowerCase()}
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = await this.${name}Service.create(req.body);
      res.status(201).json({
        success: true,
        data: item,
        message: '${name} created successfully'
      });
    } catch (error) {
      logger.error('Error creating ${name}', { error: error.message, body: req.body });
      next(error);
    }
  }

  // PUT /${name.toLowerCase()}/:id
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const item = await this.${name}Service.update(id, req.body);
      
      if (!item) {
        res.status(404).json({
          success: false,
          message: '${name} not found'
        });
        return;
      }

      res.json({
        success: true,
        data: item,
        message: '${name} updated successfully'
      });
    } catch (error) {
      logger.error('Error updating ${name}', { error: error.message, id: req.params.id });
      next(error);
    }
  }

  // DELETE /${name.toLowerCase()}/:id
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await this.${name}Service.delete(id);
      
      if (!deleted) {
        res.status(404).json({
          success: false,
          message: '${name} not found'
        });
        return;
      }

      res.json({
        success: true,
        message: '${name} deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting ${name}', { error: error.message, id: req.params.id });
      next(error);
    }
  }
}

export const ${name}Controller = new ${className}();
`;
    } else {
      return `const { ${name}Service } = require('../services/${name}Service');
const { logger } = require('../utils/logger');

class ${className} {
  constructor() {
    this.${name}Service = new ${name}Service();
  }

  // GET /${name.toLowerCase()}
  async getAll(req, res, next) {
    try {
      const items = await this.${name}Service.findAll();
      res.json({
        success: true,
        data: items,
        message: '${name} retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting ${name}', { error: error.message });
      next(error);
    }
  }

  // Additional methods...
}

module.exports = { ${className}, ${name}Controller: new ${className}() };
`;
    }
  }

  private generateService(data: BeDraftJobData): string {
    const { name, database, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Service`;
    
    if (typescript) {
      return `import { ${name}Model } from '../models/${name}';
import { logger } from '../utils/logger';

export class ${className} {
  async findAll(): Promise<any[]> {
    try {
      return await ${name}Model.find();
    } catch (error) {
      logger.error('Error finding all ${name}', { error: error.message });
      throw error;
    }
  }

  async findById(id: string): Promise<any | null> {
    try {
      return await ${name}Model.findById(id);
    } catch (error) {
      logger.error('Error finding ${name} by ID', { error: error.message, id });
      throw error;
    }
  }

  async create(data: any): Promise<any> {
    try {
      const item = new ${name}Model(data);
      return await item.save();
    } catch (error) {
      logger.error('Error creating ${name}', { error: error.message, data });
      throw error;
    }
  }

  async update(id: string, data: any): Promise<any | null> {
    try {
      return await ${name}Model.findByIdAndUpdate(id, data, { new: true });
    } catch (error) {
      logger.error('Error updating ${name}', { error: error.message, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await ${name}Model.findByIdAndDelete(id);
      return !!result;
    } catch (error) {
      logger.error('Error deleting ${name}', { error: error.message, id });
      throw error;
    }
  }
}
`;
    } else {
      return `const { ${name}Model } = require('../models/${name}');
const { logger } = require('../utils/logger');

class ${className} {
  async findAll() {
    try {
      return await ${name}Model.find();
    } catch (error) {
      logger.error('Error finding all ${name}', { error: error.message });
      throw error;
    }
  }

  // Additional methods...
}

module.exports = { ${className} };
`;
    }
  }

  private generateModel(data: BeDraftJobData): string {
    const { name, database, typescript } = data.api;
    
    if (database === 'mongoose') {
      if (typescript) {
        return `import mongoose, { Document, Schema } from 'mongoose';

export interface I${name} extends Document {
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ${name}Schema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

export const ${name}Model = mongoose.model<I${name}>('${name}', ${name}Schema);
`;
      } else {
        return `const mongoose = require('mongoose');

const ${name}Schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = { ${name}Model: mongoose.model('${name}', ${name}Schema) };
`;
      }
    }
    
    return '// Model generation for other databases not implemented yet';
  }

  private generateRoute(data: BeDraftJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import { Router } from 'express';
import { ${name}Controller } from '../controllers/${name}Controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';

const router = Router();

// GET /${name.toLowerCase()}
router.get('/', ${name}Controller.getAll.bind(${name}Controller));

// GET /${name.toLowerCase()}/:id
router.get('/:id', ${name}Controller.getById.bind(${name}Controller));

// POST /${name.toLowerCase()}
router.post('/', 
  authenticate,
  validateRequest,
  ${name}Controller.create.bind(${name}Controller)
);

// PUT /${name.toLowerCase()}/:id
router.put('/:id', 
  authenticate,
  validateRequest,
  ${name}Controller.update.bind(${name}Controller)
);

// DELETE /${name.toLowerCase()}/:id
router.delete('/:id', 
  authenticate,
  ${name}Controller.delete.bind(${name}Controller)
);

export default router;
`;
    } else {
      return `const express = require('express');
const { ${name}Controller } = require('../controllers/${name}Controller');
const { validateRequest } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Routes
router.get('/', ${name}Controller.getAll.bind(${name}Controller));
router.get('/:id', ${name}Controller.getById.bind(${name}Controller));
router.post('/', authenticate, validateRequest, ${name}Controller.create.bind(${name}Controller));
router.put('/:id', authenticate, validateRequest, ${name}Controller.update.bind(${name}Controller));
router.delete('/:id', authenticate, ${name}Controller.delete.bind(${name}Controller));

module.exports = router;
`;
    }
  }

  private generateMiddleware(data: BeDraftJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const ${name}Middleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    logger.info('${name} middleware executed', {
      method: req.method,
      url: req.url,
      ip: req.ip
    });
    
    // Add your middleware logic here
    
    next();
  } catch (error) {
    logger.error('Error in ${name} middleware', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
`;
    } else {
      return `const { logger } = require('../utils/logger');

const ${name}Middleware = (req, res, next) => {
  try {
    logger.info('${name} middleware executed', {
      method: req.method,
      url: req.url,
      ip: req.ip
    });
    
    // Add your middleware logic here
    
    next();
  } catch (error) {
    logger.error('Error in ${name} middleware', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = { ${name}Middleware };
`;
    }
  }

  private addFrameworkDependencies(framework: string, dependencies: string[]): void {
    switch (framework) {
      case 'express':
        dependencies.push('express', 'cors', 'helmet', 'morgan');
        break;
      case 'fastify':
        dependencies.push('fastify', '@fastify/cors', '@fastify/helmet');
        break;
      case 'koa':
        dependencies.push('koa', 'koa-router', 'koa-cors', 'koa-helmet');
        break;
    }
  }

  private addDatabaseDependencies(database: string, dependencies: string[]): void {
    switch (database) {
      case 'mongoose':
        dependencies.push('mongoose');
        break;
      case 'prisma':
        dependencies.push('@prisma/client');
        break;
      case 'sequelize':
        dependencies.push('sequelize');
        break;
      case 'typeorm':
        dependencies.push('typeorm', 'reflect-metadata');
        break;
    }
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  private async handleLocateOrCreate(data: BeDraftJobData): Promise<BackendDraftResult> {
    const { target } = data.userStory;
    if (!target) {
      throw new Error('Target is required for locate-or-create functionality');
    }

    const filePath = path.resolve(target.file);
    const fileExists = fs.existsSync(filePath);

    logger.info('Locate-or-create mode', {
      file: target.file,
      function: target.function,
      createIfMissing: target.createIfMissing,
      fileExists
    });

    if (fileExists) {
      // PATCH MODE: File exists, patch it
      return this.patchExistingFile(data, target, filePath);
    } else if (target.createIfMissing) {
      // SCAFFOLD MODE: Create new file
      return this.scaffoldNewFile(data, target, filePath);
    } else {
      throw new Error(`File ${target.file} not found and createIfMissing is false`);
    }
  }

  private async patchExistingFile(
    data: BeDraftJobData,
    target: { file: string; function: string; createIfMissing?: boolean },
    filePath: string
  ): Promise<BackendDraftResult> {
    // Read existing file
    const existingContent = fs.readFileSync(filePath, 'utf8');
    
    // TODO: Implement AST parsing to locate and patch the function
    // For now, we'll add a comment indicating where the function should be modified
    const patchedContent = this.addFunctionPatch(existingContent, target.function, data);
    
    this.processedCount++;
    
    return {
      success: true,
      files: { [target.file]: patchedContent },
      metadata: {
        mode: 'patch',
        framework: data.api.framework,
        database: data.api.database,
        typescript: data.api.typescript,
        generatedFiles: [target.file],
        estimatedLines: patchedContent.split('\n').length
      },
      dependencies: [],
      devDependencies: []
    };
  }

  private async scaffoldNewFile(
    data: BeDraftJobData,
    target: { file: string; function: string; createIfMissing?: boolean },
    filePath: string
  ): Promise<BackendDraftResult> {
    // Create directory if it doesn't exist
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate scaffold content
    const content = this.generateScaffoldContent(data, target);
    const dependencies: string[] = [];
    const devDependencies: string[] = [];

    // Add framework dependencies
    this.addFrameworkDependencies(data.api.framework, dependencies);
    
    // Add TypeScript dependencies if needed
    if (data.api.typescript) {
      devDependencies.push('@types/node', '@types/express', 'typescript', 'ts-node');
    }

    this.processedCount++;

    return {
      success: true,
      files: { [target.file]: content },
      metadata: {
        mode: 'scaffold',
        framework: data.api.framework,
        database: data.api.database,
        typescript: data.api.typescript,
        generatedFiles: [target.file],
        estimatedLines: content.split('\n').length
      },
      dependencies,
      devDependencies
    };
  }

  private generateScaffoldContent(
    data: BeDraftJobData,
    target: { file: string; function: string; createIfMissing?: boolean }
  ): string {
    const { framework, typescript } = data.api;
    const { function: functionName } = target;
    const { description } = data.userStory;

    if (typescript) {
      return `import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * ${functionName}
 * ${description}
 */
export async function ${functionName}(req: Request, res: Response, next?: NextFunction): Promise<void> {
  try {
    // TODO: Implement logic - will be completed by BE-Logic agent
    logger.info('${functionName} called', { params: req.params, query: req.query });
    
    res.status(501).json({
      success: false,
      message: 'Not implemented yet - pending BE-Logic implementation'
    });
  } catch (error) {
    logger.error('Error in ${functionName}', { error: error.message });
    if (next) {
      next(error);
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

export default { ${functionName} };
`;
    } else {
      return `const { logger } = require('../utils/logger');

/**
 * ${functionName}
 * ${description}
 */
async function ${functionName}(req, res, next) {
  try {
    // TODO: Implement logic - will be completed by BE-Logic agent
    logger.info('${functionName} called', { params: req.params, query: req.query });
    
    res.status(501).json({
      success: false,
      message: 'Not implemented yet - pending BE-Logic implementation'
    });
  } catch (error) {
    logger.error('Error in ${functionName}', { error: error.message });
    if (next) {
      next(error);
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = { ${functionName} };
`;
    }
  }

  private addFunctionPatch(
    existingContent: string,
    functionName: string,
    data: BeDraftJobData
  ): string {
    // Simple implementation: add a comment indicating where the patch should be applied
    // In a real implementation, this would use AST parsing to locate and modify the function
    const patchComment = `\n// PATCH: Function '${functionName}' should be modified here\n// Story: ${data.userStory.description}\n// TODO: Implement actual AST-based patching\n`;
    
    // Look for the function and add the patch comment
    const functionRegex = new RegExp(`(function\\s+${functionName}|${functionName}\\s*[=:]|async\\s+function\\s+${functionName})`, 'i');
    
    if (functionRegex.test(existingContent)) {
      return existingContent.replace(functionRegex, `${patchComment}$1`);
    } else {
      // Function not found, add at the end
      return existingContent + patchComment;
    }
  }
}

export const beDraftGenerator = new BeDraftGenerator();