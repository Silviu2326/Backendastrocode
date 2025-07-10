import { logger } from '../../../shared/utils/logger';
import { BeLogicJobData } from '../../types/queues';

export interface BackendLogicResult {
  success: boolean;
  files: {
    [filePath: string]: string;
  };
  metadata: {
    businessRules: string[];
    validationRules: string[];
    integrations: string[];
    generatedFiles: string[];
    complexity: 'low' | 'medium' | 'high';
    estimatedLines: number;
  };
  dependencies: string[];
  devDependencies: string[];
}

export class BeLogicGenerator {
  private processedCount = 0;
  private errorCount = 0;

  async generateBusinessLogic(data: BeLogicJobData): Promise<BackendLogicResult> {
    try {
      logger.info('Generating backend business logic', {
        apiName: data.api.name,
        businessRules: data.businessRules?.length || 0,
        validationRules: data.validationRules?.length || 0,
        integrations: data.integrations?.length || 0
      });

      const files: { [filePath: string]: string } = {};
      const dependencies: string[] = [];
      const devDependencies: string[] = [];

      // Generate business logic files
      if (data.businessRules && data.businessRules.length > 0) {
        files[`src/business/${data.api.name}Business.${data.api.typescript ? 'ts' : 'js'}`] = 
          this.generateBusinessRules(data);
      }

      // Generate validation logic
      if (data.validationRules && data.validationRules.length > 0) {
        files[`src/validators/${data.api.name}Validator.${data.api.typescript ? 'ts' : 'js'}`] = 
          this.generateValidationRules(data);
        dependencies.push('joi', 'express-validator');
      }

      // Generate integration logic
      if (data.integrations && data.integrations.length > 0) {
        files[`src/integrations/${data.api.name}Integration.${data.api.typescript ? 'ts' : 'js'}`] = 
          this.generateIntegrationLogic(data);
        dependencies.push('axios', 'node-fetch');
      }

      // Generate utility functions
      files[`src/utils/${data.api.name}Utils.${data.api.typescript ? 'ts' : 'js'}`] = 
        this.generateUtilityFunctions(data);

      // Generate error handling
      files[`src/errors/${data.api.name}Errors.${data.api.typescript ? 'ts' : 'js'}`] = 
        this.generateErrorHandling(data);

      // Add TypeScript dependencies if needed
      if (data.api.typescript) {
        devDependencies.push('@types/node', '@types/express', 'typescript', 'ts-node');
      }

      // Add testing dependencies
      devDependencies.push('jest', '@types/jest', 'supertest', '@types/supertest');

      // Calculate complexity
      const complexity = this.calculateComplexity(data);

      this.processedCount++;

      return {
        success: true,
        files,
        metadata: {
          businessRules: data.businessRules || [],
          validationRules: data.validationRules || [],
          integrations: data.integrations || [],
          generatedFiles: Object.keys(files),
          complexity,
          estimatedLines: Object.values(files).reduce((total, content) => 
            total + content.split('\n').length, 0)
        },
        dependencies,
        devDependencies
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Error generating backend logic', {
        error: error.message,
        apiName: data.api.name
      });
      throw error;
    }
  }

  private generateBusinessRules(data: BeLogicJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Business`;
    
    if (typescript) {
      return `import { logger } from '../utils/logger';
import { ${name}Model } from '../models/${name}';
import { ValidationError, BusinessLogicError } from '../errors/${name}Errors';

export class ${className} {
  ${data.businessRules?.map(rule => this.generateBusinessRule(rule, typescript)).join('\n\n  ') || ''}

  // Core business logic methods
  async processBusinessLogic(data: any): Promise<any> {
    try {
      logger.info('Processing business logic for ${name}', { data });
      
      // Apply business rules
      ${data.businessRules?.map(rule => `await this.${this.camelCase(rule)}(data);`).join('\n      ') || ''}
      
      return {
        success: true,
        processedData: data,
        appliedRules: [${data.businessRules?.map(rule => `'${rule}'`).join(', ') || ''}]
      };
    } catch (error) {
      logger.error('Business logic processing failed', { error: error.message, data });
      throw new BusinessLogicError(`Business logic failed: ${error.message}`);
    }
  }

  async validateBusinessConstraints(data: any): Promise<boolean> {
    try {
      // Implement business constraint validation
      ${data.businessRules?.map(rule => `
      if (!await this.validate${this.pascalCase(rule)}(data)) {
        throw new ValidationError('${rule} validation failed');
      }`).join('') || ''}
      
      return true;
    } catch (error) {
      logger.error('Business constraint validation failed', { error: error.message });
      throw error;
    }
  }

  private async validate${this.pascalCase(data.businessRules?.[0] || 'default')}(data: any): Promise<boolean> {
    // Implement specific validation logic
    return true;
  }
}

export const ${name}Business = new ${className}();
`;
    } else {
      return `const { logger } = require('../utils/logger');
const { ${name}Model } = require('../models/${name}');
const { ValidationError, BusinessLogicError } = require('../errors/${name}Errors');

class ${className} {
  ${data.businessRules?.map(rule => this.generateBusinessRule(rule, typescript)).join('\n\n  ') || ''}

  async processBusinessLogic(data) {
    try {
      logger.info('Processing business logic for ${name}', { data });
      
      // Apply business rules
      ${data.businessRules?.map(rule => `await this.${this.camelCase(rule)}(data);`).join('\n      ') || ''}
      
      return {
        success: true,
        processedData: data,
        appliedRules: [${data.businessRules?.map(rule => `'${rule}'`).join(', ') || ''}]
      };
    } catch (error) {
      logger.error('Business logic processing failed', { error: error.message, data });
      throw new BusinessLogicError(`Business logic failed: ${error.message}`);
    }
  }
}

module.exports = { ${className}, ${name}Business: new ${className}() };
`;
    }
  }

  private generateValidationRules(data: BeLogicJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Validator`;
    
    if (typescript) {
      return `import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ValidationError } from '../errors/${name}Errors';

export class ${className} {
  private schema = Joi.object({
    ${data.validationRules?.map(rule => this.generateJoiValidation(rule)).join(',\n    ') || ''}
  });

  async validate(data: any): Promise<any> {
    try {
      const { error, value } = this.schema.validate(data, { abortEarly: false });
      
      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
      }
      
      return value;
    } catch (error) {
      logger.error('Validation error', { error: error.message, data });
      throw error;
    }
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        req.body = await this.validate(req.body);
        next();
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message,
          type: 'validation_error'
        });
      }
    };
  }

  ${data.validationRules?.map(rule => this.generateCustomValidator(rule, typescript)).join('\n\n  ') || ''}
}

export const ${name}Validator = new ${className}();
`;
    } else {
      return `const Joi = require('joi');
const { logger } = require('../utils/logger');
const { ValidationError } = require('../errors/${name}Errors');

class ${className} {
  constructor() {
    this.schema = Joi.object({
      ${data.validationRules?.map(rule => this.generateJoiValidation(rule)).join(',\n      ') || ''}
    });
  }

  async validate(data) {
    try {
      const { error, value } = this.schema.validate(data, { abortEarly: false });
      
      if (error) {
        const errorMessages = error.details.map(detail => detail.message);
        throw new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
      }
      
      return value;
    } catch (error) {
      logger.error('Validation error', { error: error.message, data });
      throw error;
    }
  }
}

module.exports = { ${className}, ${name}Validator: new ${className}() };
`;
    }
  }

  private generateIntegrationLogic(data: BeLogicJobData): string {
    const { name, typescript } = data.api;
    const className = `${name.charAt(0).toUpperCase() + name.slice(1)}Integration`;
    
    if (typescript) {
      return `import axios, { AxiosResponse } from 'axios';
import { logger } from '../utils/logger';
import { IntegrationError } from '../errors/${name}Errors';

export class ${className} {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = process.env.${name.toUpperCase()}_API_URL || 'http://localhost:3000';
    this.timeout = parseInt(process.env.${name.toUpperCase()}_TIMEOUT || '5000');
  }

  ${data.integrations?.map(integration => this.generateIntegrationMethod(integration, typescript)).join('\n\n  ') || ''}

  private async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.${name.toUpperCase()}_API_KEY || ''}`
        },
        ...(data && { data })
      };

      const response: AxiosResponse = await axios(config);
      
      logger.info('Integration request successful', {
        method,
        endpoint,
        status: response.status
      });
      
      return response.data;
    } catch (error) {
      logger.error('Integration request failed', {
        method,
        endpoint,
        error: error.message
      });
      
      throw new IntegrationError(`Integration failed: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.makeRequest('GET', '/health');
      return true;
    } catch (error) {
      return false;
    }
  }
}

export const ${name}Integration = new ${className}();
`;
    } else {
      return `const axios = require('axios');
const { logger } = require('../utils/logger');
const { IntegrationError } = require('../errors/${name}Errors');

class ${className} {
  constructor() {
    this.baseURL = process.env.${name.toUpperCase()}_API_URL || 'http://localhost:3000';
    this.timeout = parseInt(process.env.${name.toUpperCase()}_TIMEOUT || '5000');
  }

  ${data.integrations?.map(integration => this.generateIntegrationMethod(integration, typescript)).join('\n\n  ') || ''}
}

module.exports = { ${className}, ${name}Integration: new ${className}() };
`;
    }
  }

  private generateUtilityFunctions(data: BeLogicJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `import { logger } from '../utils/logger';

export class ${name.charAt(0).toUpperCase() + name.slice(1)}Utils {
  static formatResponse(data: any, message: string = 'Success'): any {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  static formatError(error: Error, code: string = 'INTERNAL_ERROR'): any {
    return {
      success: false,
      error: {
        code,
        message: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }

  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input.trim().replace(/[<>"'&]/g, '');
    }
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    return input;
  }

  static async retry<T>(fn: () => Promise<T>, maxAttempts: number = 3, delay: number = 1000): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        logger.warn(`Attempt ${attempt} failed, retrying...`, { error: error.message });
        
        if (attempt < maxAttempts) {
          await this.delay(delay * attempt);
        }
      }
    }
    
    throw lastError!;
  }
}
`;
    } else {
      return `const { logger } = require('../utils/logger');

class ${name.charAt(0).toUpperCase() + name.slice(1)}Utils {
  static formatResponse(data, message = 'Success') {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString()
    };
  }

  static formatError(error, code = 'INTERNAL_ERROR') {
    return {
      success: false,
      error: {
        code,
        message: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = { ${name.charAt(0).toUpperCase() + name.slice(1)}Utils };
`;
    }
  }

  private generateErrorHandling(data: BeLogicJobData): string {
    const { name, typescript } = data.api;
    
    if (typescript) {
      return `export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BusinessLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

export class IntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationError';
  }
}

export class ${name.charAt(0).toUpperCase() + name.slice(1)}Error extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', statusCode: number = 500) {
    super(message);
    this.name = '${name.charAt(0).toUpperCase() + name.slice(1)}Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}
`;
    } else {
      return `class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

class BusinessLogicError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

class IntegrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IntegrationError';
  }
}

module.exports = {
  ValidationError,
  BusinessLogicError,
  IntegrationError
};
`;
    }
  }

  private generateBusinessRule(rule: string, typescript: boolean): string {
    const methodName = this.camelCase(rule);
    
    if (typescript) {
      return `async ${methodName}(data: any): Promise<void> {
    // Implement ${rule} business rule
    logger.info('Applying business rule: ${rule}', { data });
    
    // Add your business rule implementation here
    // Example: validate constraints, apply transformations, etc.
  }`;
    } else {
      return `async ${methodName}(data) {
    // Implement ${rule} business rule
    logger.info('Applying business rule: ${rule}', { data });
    
    // Add your business rule implementation here
  }`;
    }
  }

  private generateJoiValidation(rule: string): string {
    // Simple mapping of validation rules to Joi schemas
    const ruleMap: { [key: string]: string } = {
      'required': 'Joi.string().required()',
      'email': 'Joi.string().email().required()',
      'number': 'Joi.number().required()',
      'boolean': 'Joi.boolean().required()',
      'date': 'Joi.date().required()'
    };
    
    return `${this.camelCase(rule)}: ${ruleMap[rule] || 'Joi.any()'}`;
  }

  private generateCustomValidator(rule: string, typescript: boolean): string {
    const methodName = `validate${this.pascalCase(rule)}`;
    
    if (typescript) {
      return `async ${methodName}(value: any): Promise<boolean> {
    // Implement custom validation for ${rule}
    return true;
  }`;
    } else {
      return `async ${methodName}(value) {
    // Implement custom validation for ${rule}
    return true;
  }`;
    }
  }

  private generateIntegrationMethod(integration: string, typescript: boolean): string {
    const methodName = this.camelCase(integration);
    
    if (typescript) {
      return `async ${methodName}(data: any): Promise<any> {
    try {
      logger.info('Calling ${integration} integration', { data });
      
      const result = await this.makeRequest('POST', '/${integration.toLowerCase()}', data);
      
      return result;
    } catch (error) {
      logger.error('${integration} integration failed', { error: error.message });
      throw error;
    }
  }`;
    } else {
      return `async ${methodName}(data) {
    try {
      logger.info('Calling ${integration} integration', { data });
      
      const result = await this.makeRequest('POST', '/${integration.toLowerCase()}', data);
      
      return result;
    } catch (error) {
      logger.error('${integration} integration failed', { error: error.message });
      throw error;
    }
  }`;
    }
  }

  private calculateComplexity(data: BeLogicJobData): 'low' | 'medium' | 'high' {
    const rulesCount = (data.businessRules?.length || 0) + 
                      (data.validationRules?.length || 0) + 
                      (data.integrations?.length || 0);
    
    if (rulesCount <= 3) return 'low';
    if (rulesCount <= 7) return 'medium';
    return 'high';
  }

  private camelCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  private pascalCase(str: string): string {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word) => {
      return word.toUpperCase();
    }).replace(/\s+/g, '');
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}

export const beLogicGenerator = new BeLogicGenerator();