import { logger } from '../../../shared/utils/logger';
import { llmOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { fileWriter } from '../../../shared/utils/fileWriter';
import { astUtils } from '../../../shared/utils/astUtils';
import { ProcessingJob } from '../../fe-manager/src/orchestrator';
import path from 'path';

interface ComponentDraft {
  componentName: string;
  filePath: string;
  code: string;
  imports: string[];
  exports: string[];
  props: ComponentProp[];
  hooks: string[];
  dependencies: string[];
}

interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: any;
}

class FeDraftGenerator {
  private processedCount = 0;
  private errorCount = 0;

  async generateComponentDraft(job: ProcessingJob): Promise<{
    success: boolean;
    componentDraft?: ComponentDraft;
    filePath?: string;
    error?: string;
  }> {
    try {
      logger.info('Starting component draft generation', {
        jobId: job.id,
        pageId: job.metadata.pageId,
        storiesCount: job.stories.length
      });

      // Preparar contexto para el LLM
      const context = this.prepareContext(job);
      
      // Generar borrador usando LLM
      const draftCode = await llmOrchestrator.generateComponent({
        template: 'fe-draft',
        context,
        options: {
          framework: 'react',
          typescript: true,
          styling: 'tailwind'
        }
      });

      // Analizar el código generado
      const analysis = await astUtils.analyzeComponent(draftCode);
      
      // Crear estructura del componente
      const componentDraft: ComponentDraft = {
        componentName: job.metadata.pageName.replace(/[^a-zA-Z0-9]/g, ''),
        filePath: this.generateFilePath(job.metadata.route, job.metadata.pageName),
        code: draftCode,
        imports: analysis.imports || [],
        exports: analysis.exports || [],
        props: this.extractProps(job.stories),
        hooks: analysis.hooks || [],
        dependencies: this.inferDependencies(job.stories)
      };

      // Escribir archivo
      const outputPath = path.join(process.cwd(), 'generated-frontend', componentDraft.filePath);
      await fileWriter.writeComponent(outputPath, componentDraft.code);

      this.processedCount++;
      
      logger.info('Component draft generated successfully', {
        jobId: job.id,
        componentName: componentDraft.componentName,
        filePath: outputPath
      });

      return {
        success: true,
        componentDraft,
        filePath: outputPath
      };
      
    } catch (error) {
      this.errorCount++;
      logger.error('Error generating component draft', {
        jobId: job.id,
        error: error.message,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  private prepareContext(job: ProcessingJob) {
    return {
      pageName: job.metadata.pageName,
      route: job.metadata.route,
      stories: job.stories.map(story => ({
        title: story.title,
        description: story.description,
        priority: story.priority,
        estimatedHours: story.estimatedHours
      })),
      projectId: job.metadata.projectId,
      requirements: this.extractRequirements(job.stories),
      features: this.extractFeatures(job.stories),
      interactions: this.extractInteractions(job.stories)
    };
  }

  private extractRequirements(stories: any[]): string[] {
    const requirements: string[] = [];
    
    stories.forEach(story => {
      const desc = story.description.toLowerCase();
      
      // Extraer requisitos funcionales
      if (desc.includes('must') || desc.includes('should') || desc.includes('required')) {
        requirements.push(story.title);
      }
      
      // Extraer requisitos de UI
      if (desc.includes('display') || desc.includes('show') || desc.includes('render')) {
        requirements.push(`Display: ${story.title}`);
      }
      
      // Extraer requisitos de interacción
      if (desc.includes('click') || desc.includes('submit') || desc.includes('select')) {
        requirements.push(`Interaction: ${story.title}`);
      }
    });
    
    return [...new Set(requirements)];
  }

  private extractFeatures(stories: any[]): string[] {
    const features: string[] = [];
    
    stories.forEach(story => {
      const desc = story.description.toLowerCase();
      
      // Identificar características principales
      const featureKeywords = [
        'form', 'table', 'list', 'grid', 'chart', 'modal', 'dropdown',
        'search', 'filter', 'sort', 'pagination', 'navigation', 'menu',
        'button', 'input', 'textarea', 'select', 'checkbox', 'radio'
      ];
      
      featureKeywords.forEach(keyword => {
        if (desc.includes(keyword)) {
          features.push(keyword);
        }
      });
    });
    
    return [...new Set(features)];
  }

  private extractInteractions(stories: any[]): string[] {
    const interactions: string[] = [];
    
    stories.forEach(story => {
      const desc = story.description.toLowerCase();
      
      // Identificar tipos de interacción
      const interactionPatterns = [
        { pattern: /click|tap/, action: 'onClick' },
        { pattern: /submit|send/, action: 'onSubmit' },
        { pattern: /change|update|edit/, action: 'onChange' },
        { pattern: /select|choose/, action: 'onSelect' },
        { pattern: /hover|mouse/, action: 'onHover' },
        { pattern: /focus|blur/, action: 'onFocus' },
        { pattern: /scroll/, action: 'onScroll' },
        { pattern: /resize/, action: 'onResize' }
      ];
      
      interactionPatterns.forEach(({ pattern, action }) => {
        if (pattern.test(desc)) {
          interactions.push(action);
        }
      });
    });
    
    return [...new Set(interactions)];
  }

  private extractProps(stories: any[]): ComponentProp[] {
    const props: ComponentProp[] = [];
    const propSet = new Set<string>();
    
    stories.forEach(story => {
      const desc = story.description.toLowerCase();
      
      // Props comunes basados en el contenido
      const propPatterns = [
        { pattern: /data|content|items/, name: 'data', type: 'any[]', required: true },
        { pattern: /loading|spinner/, name: 'isLoading', type: 'boolean', required: false },
        { pattern: /error|fail/, name: 'error', type: 'string | null', required: false },
        { pattern: /title|heading/, name: 'title', type: 'string', required: true },
        { pattern: /id|identifier/, name: 'id', type: 'string', required: true },
        { pattern: /disabled|readonly/, name: 'disabled', type: 'boolean', required: false },
        { pattern: /visible|show|hide/, name: 'isVisible', type: 'boolean', required: false },
        { pattern: /callback|handler/, name: 'onAction', type: '() => void', required: false }
      ];
      
      propPatterns.forEach(({ pattern, name, type, required }) => {
        if (pattern.test(desc) && !propSet.has(name)) {
          props.push({
            name,
            type,
            required,
            description: `Inferred from: ${story.title}`
          });
          propSet.add(name);
        }
      });
    });
    
    return props;
  }

  private inferDependencies(stories: any[]): string[] {
    const dependencies = new Set(['react']);
    
    stories.forEach(story => {
      const desc = story.description.toLowerCase();
      
      // Mapeo de características a dependencias
      const depMap = {
        'form': ['react-hook-form', '@hookform/resolvers', 'zod'],
        'router': ['react-router-dom'],
        'state': ['zustand'],
        'api': ['axios', '@tanstack/react-query'],
        'chart': ['recharts'],
        'date': ['date-fns'],
        'icon': ['lucide-react'],
        'animation': ['framer-motion'],
        'table': ['@tanstack/react-table'],
        'modal': ['@radix-ui/react-dialog'],
        'toast': ['react-hot-toast'],
        'dropdown': ['@radix-ui/react-dropdown-menu']
      };
      
      Object.entries(depMap).forEach(([keyword, deps]) => {
        if (desc.includes(keyword)) {
          deps.forEach(dep => dependencies.add(dep));
        }
      });
    });
    
    return Array.from(dependencies);
  }

  private generateFilePath(route: string, pageName: string): string {
    const cleanRoute = route.replace(/^\//g, '').replace(/\//g, '-') || 'home';
    const componentName = pageName.replace(/[^a-zA-Z0-9]/g, '');
    return `src/pages/${cleanRoute}/${componentName}.tsx`;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}

export const draftGenerator = new FeDraftGenerator();
export { ComponentDraft, ComponentProp };