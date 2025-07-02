import ejs from 'ejs';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger';

interface PromptContext {
  userStory: {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    priority: number;
    complexity: number;
    tags: string[];
    epic?: {
      id: string;
      title: string;
      description: string;
    };
  };
  component?: {
    name: string;
    type: 'page' | 'component' | 'layout' | 'hook' | 'util';
    path: string;
    props?: Record<string, any>;
    dependencies?: string[];
  };
  project?: {
    name: string;
    framework: 'react' | 'vue' | 'angular';
    typescript: boolean;
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components';
    stateManagement?: 'redux' | 'zustand' | 'context' | 'none';
    routing?: 'react-router' | 'next-router' | 'vue-router';
  };
  context?: {
    relatedStories?: any[];
    existingComponents?: string[];
    designSystem?: Record<string, any>;
    apiEndpoints?: string[];
  };
  metadata?: Record<string, any>;
}

interface PromptTemplate {
  name: string;
  path: string;
  description: string;
  requiredContext: string[];
  optionalContext: string[];
  outputFormat: 'code' | 'json' | 'markdown' | 'text';
}

class PromptEngine {
  private templatesCache: Map<string, string> = new Map();
  private templatesDir: string;
  private registeredTemplates: Map<string, PromptTemplate> = new Map();

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir || path.join(__dirname, '../prompts');
    this.initializeTemplates();
  }

  /**
   * Inicializa y registra todas las plantillas disponibles
   */
  private async initializeTemplates(): Promise<void> {
    try {
      const templates: PromptTemplate[] = [
        {
          name: 'fe-draft',
          path: 'fe-draft.ejs',
          description: 'Genera el borrador inicial de un componente React',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-logic',
          path: 'fe-logic.ejs',
          description: 'Implementa la lógica de negocio del componente',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-style',
          path: 'fe-style.ejs',
          description: 'Genera estilos CSS/SCSS para el componente',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-a11y',
          path: 'fe-a11y.ejs',
          description: 'Añade características de accesibilidad',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-test',
          path: 'fe-test.ejs',
          description: 'Genera tests unitarios para el componente',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-typefix',
          path: 'fe-typefix.ejs',
          description: 'Corrige errores de TypeScript',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'code'
        },
        {
          name: 'fe-report',
          path: 'fe-report.ejs',
          description: 'Genera reporte de análisis del componente',
          requiredContext: ['userStory', 'component', 'project'],
          optionalContext: ['context', 'metadata'],
          outputFormat: 'markdown'
        }
      ];

      for (const template of templates) {
        this.registeredTemplates.set(template.name, template);
      }

      logger.info('Prompt templates initialized', {
        templatesCount: templates.length,
        templatesDir: this.templatesDir
      });

    } catch (error) {
      logger.error('Error initializing prompt templates', {
        error: error.message,
        templatesDir: this.templatesDir
      });
      throw error;
    }
  }

  /**
   * Renderiza un prompt usando una plantilla específica
   */
  async renderPrompt(
    templateName: string,
    context: PromptContext
  ): Promise<{ prompt: string; metadata: Record<string, any> }> {
    try {
      const template = this.registeredTemplates.get(templateName);
      if (!template) {
        throw new Error(`Template '${templateName}' not found`);
      }

      // Validar contexto requerido
      this.validateContext(template, context);

      // Obtener contenido de la plantilla
      const templateContent = await this.getTemplateContent(template.path);

      // Preparar contexto extendido
      const extendedContext = this.prepareContext(context, template);

      // Renderizar plantilla
      const prompt = await ejs.render(templateContent, extendedContext, {
        filename: path.join(this.templatesDir, template.path),
        async: true
      });

      // Limpiar y formatear prompt
      const cleanPrompt = this.cleanPrompt(prompt);

      const metadata = {
        templateName,
        templatePath: template.path,
        outputFormat: template.outputFormat,
        contextKeys: Object.keys(context),
        promptLength: cleanPrompt.length,
        renderedAt: new Date().toISOString()
      };

      logger.info('Prompt rendered successfully', {
        templateName,
        promptLength: cleanPrompt.length,
        contextKeys: Object.keys(context)
      });

      return {
        prompt: cleanPrompt,
        metadata
      };

    } catch (error) {
      logger.error('Error rendering prompt', {
        templateName,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Renderiza múltiples prompts en lote
   */
  async renderBatch(
    requests: Array<{ templateName: string; context: PromptContext }>
  ): Promise<Array<{ prompt: string; metadata: Record<string, any>; error?: string }>> {
    const results = [];

    logger.info('Starting batch prompt rendering', {
      requestsCount: requests.length
    });

    for (const request of requests) {
      try {
        const result = await this.renderPrompt(request.templateName, request.context);
        results.push(result);
      } catch (error) {
        results.push({
          prompt: '',
          metadata: {
            templateName: request.templateName,
            error: error.message,
            renderedAt: new Date().toISOString()
          },
          error: error.message
        });
      }
    }

    const successful = results.filter(r => !r.error).length;
    const failed = results.length - successful;

    logger.info('Batch prompt rendering completed', {
      total: requests.length,
      successful,
      failed
    });

    return results;
  }

  /**
   * Obtiene información sobre una plantilla
   */
  getTemplateInfo(templateName: string): PromptTemplate | null {
    return this.registeredTemplates.get(templateName) || null;
  }

  /**
   * Lista todas las plantillas disponibles
   */
  listTemplates(): PromptTemplate[] {
    return Array.from(this.registeredTemplates.values());
  }

  /**
   * Valida que el contexto contenga todos los campos requeridos
   */
  private validateContext(template: PromptTemplate, context: PromptContext): void {
    const missingFields = [];

    for (const required of template.requiredContext) {
      if (!(required in context) || context[required] === undefined) {
        missingFields.push(required);
      }
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required context fields for template '${template.name}': ${missingFields.join(', ')}`
      );
    }
  }

  /**
   * Obtiene el contenido de una plantilla (con cache)
   */
  private async getTemplateContent(templatePath: string): Promise<string> {
    if (this.templatesCache.has(templatePath)) {
      return this.templatesCache.get(templatePath)!;
    }

    const fullPath = path.join(this.templatesDir, templatePath);
    
    if (!(await fs.pathExists(fullPath))) {
      throw new Error(`Template file not found: ${fullPath}`);
    }

    const content = await fs.readFile(fullPath, 'utf8');
    this.templatesCache.set(templatePath, content);

    return content;
  }

  /**
   * Prepara el contexto extendido con utilidades adicionales
   */
  private prepareContext(context: PromptContext, template: PromptTemplate): any {
    return {
      ...context,
      // Utilidades para las plantillas
      utils: {
        formatDate: (date: Date) => date.toISOString(),
        capitalize: (str: string) => str.charAt(0).toUpperCase() + str.slice(1),
        camelCase: (str: string) => str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : ''),
        kebabCase: (str: string) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
        pascalCase: (str: string) => str.replace(/(?:^|[-_\s]+)(.)/g, (_, c) => c.toUpperCase()),
        indent: (text: string, spaces: number = 2) => {
          const indentation = ' '.repeat(spaces);
          return text.split('\n').map(line => line ? indentation + line : line).join('\n');
        },
        joinLines: (lines: string[]) => lines.filter(Boolean).join('\n'),
        escapeQuotes: (str: string) => str.replace(/"/g, '\\"'),
        truncate: (str: string, length: number = 100) => {
          return str.length > length ? str.substring(0, length) + '...' : str;
        }
      },
      // Metadata de la plantilla
      template: {
        name: template.name,
        description: template.description,
        outputFormat: template.outputFormat
      },
      // Timestamp de renderizado
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Limpia y formatea el prompt renderizado
   */
  private cleanPrompt(prompt: string): string {
    return prompt
      .replace(/\n{3,}/g, '\n\n') // Reducir líneas vacías múltiples
      .replace(/^\s+|\s+$/g, '') // Eliminar espacios al inicio y final
      .replace(/\t/g, '  ') // Convertir tabs a espacios
      .trim();
  }

  /**
   * Limpia la cache de plantillas
   */
  clearCache(): void {
    this.templatesCache.clear();
    logger.info('Prompt templates cache cleared');
  }

  /**
   * Recarga una plantilla específica
   */
  async reloadTemplate(templateName: string): Promise<void> {
    const template = this.registeredTemplates.get(templateName);
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Eliminar de cache
    this.templatesCache.delete(template.path);

    // Precargar nuevamente
    await this.getTemplateContent(template.path);

    logger.info('Template reloaded', { templateName });
  }

  /**
   * Valida la sintaxis de una plantilla
   */
  async validateTemplate(templateName: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const template = this.registeredTemplates.get(templateName);
      if (!template) {
        return {
          valid: false,
          errors: [`Template '${templateName}' not found`]
        };
      }

      const templateContent = await this.getTemplateContent(template.path);
      
      // Intentar compilar la plantilla con contexto de prueba
      const testContext = this.createTestContext();
      
      await ejs.render(templateContent, testContext, {
        filename: path.join(this.templatesDir, template.path),
        async: true
      });

      return { valid: true, errors: [] };

    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Crea un contexto de prueba para validación
   */
  private createTestContext(): PromptContext {
    return {
      userStory: {
        id: 'test-story-1',
        title: 'Test User Story',
        description: 'This is a test user story for template validation',
        acceptanceCriteria: ['Test criteria 1', 'Test criteria 2'],
        priority: 1,
        complexity: 3,
        tags: ['test', 'validation'],
        epic: {
          id: 'test-epic-1',
          title: 'Test Epic',
          description: 'Test epic description'
        }
      },
      component: {
        name: 'TestComponent',
        type: 'component',
        path: '/src/components/TestComponent.tsx',
        props: { title: 'string', onClick: 'function' },
        dependencies: ['react', 'react-dom']
      },
      project: {
        name: 'test-project',
        framework: 'react',
        typescript: true,
        styling: 'tailwind',
        stateManagement: 'zustand',
        routing: 'react-router'
      },
      context: {
        relatedStories: [],
        existingComponents: ['Button', 'Input', 'Modal'],
        designSystem: { colors: { primary: '#007bff' } },
        apiEndpoints: ['/api/users', '/api/posts']
      },
      metadata: {
        version: '1.0.0',
        author: 'test-author'
      }
    };
  }
}

export const promptEngine = new PromptEngine();
export { PromptContext, PromptTemplate };