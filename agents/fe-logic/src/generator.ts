import { ContextualLogger } from '../../shared/utils/logger';
import { LLMOrchestrator } from '../../shared/llm/llmOrchestrator';
import { AstUtils } from '../../shared/utils/astUtils';
import { FileWriter } from '../../shared/utils/fileWriter';
import { config } from '../../shared/config/env';

interface LogicGenerationJob {
  userStory: {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    priority: number;
    complexity: number;
  };
  component: {
    name: string;
    path: string;
    type: 'page' | 'component' | 'layout';
    existingCode?: string;
    props?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
    hooks?: string[];
    dependencies?: string[];
  };
  project: {
    framework: string;
    typescript: boolean;
    styling: string;
    stateManagement?: string;
    apiClient?: string;
  };
  requirements: {
    businessLogic: string[];
    stateManagement: string[];
    dataFetching: string[];
    eventHandling: string[];
    validation: string[];
    errorHandling: string[];
  };
}

interface LogicGenerationResult {
  success: boolean;
  componentPath: string;
  generatedCode: string;
  hooks: string[];
  stateVariables: string[];
  eventHandlers: string[];
  apiCalls: string[];
  validationRules: string[];
  errorBoundaries: string[];
  performance: {
    memoization: string[];
    optimization: string[];
  };
  testing: {
    unitTests: string;
    integrationTests: string;
  };
  documentation: string;
  metrics: {
    complexity: number;
    linesOfCode: number;
    cyclomaticComplexity: number;
  };
}

export class FeLogicGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private astUtils: AstUtils;
  private fileWriter: FileWriter;

  constructor() {
    this.logger = new ContextualLogger('fe-logic-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.astUtils = new AstUtils();
    this.fileWriter = new FileWriter();
  }

  async generateComponentLogic(jobData: LogicGenerationJob): Promise<LogicGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting logic generation', {
      component: jobData.component.name,
      type: jobData.component.type
    });

    try {
      // Analyze existing code if provided
      let existingAnalysis = null;
      if (jobData.component.existingCode) {
        existingAnalysis = await this.analyzeExistingCode(jobData.component.existingCode);
        logger.info('Analyzed existing code', { analysis: existingAnalysis });
      }

      // Prepare context for LLM
      const context = this.prepareLLMContext(jobData, existingAnalysis);

      // Generate logic using LLM
      const generatedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-logic',
        context
      );

      logger.info('Generated component logic', { 
        codeLength: generatedCode.length 
      });

      // Analyze generated code
      const codeAnalysis = await this.analyzeGeneratedCode(generatedCode);

      // Extract logic components
      const logicComponents = this.extractLogicComponents(generatedCode, codeAnalysis);

      // Write component file
      const componentPath = await this.writeComponentFile(
        jobData.component.path,
        generatedCode,
        jobData.component.name
      );

      // Generate tests
      const tests = await this.generateTests(jobData, generatedCode, logicComponents);

      // Generate documentation
      const documentation = this.generateDocumentation(jobData, logicComponents);

      // Calculate metrics
      const metrics = this.calculateMetrics(generatedCode, codeAnalysis);

      logger.info('Logic generation completed successfully', {
        componentPath,
        metrics
      });

      return {
        success: true,
        componentPath,
        generatedCode,
        hooks: logicComponents.hooks,
        stateVariables: logicComponents.stateVariables,
        eventHandlers: logicComponents.eventHandlers,
        apiCalls: logicComponents.apiCalls,
        validationRules: logicComponents.validationRules,
        errorBoundaries: logicComponents.errorBoundaries,
        performance: logicComponents.performance,
        testing: tests,
        documentation,
        metrics
      };
    } catch (error) {
      logger.error('Logic generation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async enhanceExistingLogic(jobData: LogicGenerationJob): Promise<LogicGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'enhance'
    });

    logger.info('Enhancing existing logic');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for enhancement');
      }

      // Analyze current code
      const currentAnalysis = await this.analyzeExistingCode(jobData.component.existingCode);
      
      // Identify enhancement opportunities
      const enhancements = this.identifyEnhancements(currentAnalysis, jobData.requirements);
      
      // Prepare enhancement context
      const context = {
        ...this.prepareLLMContext(jobData, currentAnalysis),
        enhancements,
        mode: 'enhance'
      };

      // Generate enhanced code
      const enhancedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-logic',
        context
      );

      // Continue with similar processing as generateComponentLogic
      return await this.processGeneratedLogic(jobData, enhancedCode, 'enhanced');
    } catch (error) {
      logger.error('Logic enhancement failed', { error: error.message });
      throw error;
    }
  }

  async optimizePerformance(jobData: LogicGenerationJob): Promise<LogicGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'optimize'
    });

    logger.info('Optimizing component performance');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for optimization');
      }

      // Analyze performance bottlenecks
      const performanceAnalysis = await this.analyzePerformance(jobData.component.existingCode);
      
      // Prepare optimization context
      const context = {
        ...this.prepareLLMContext(jobData, null),
        performanceAnalysis,
        mode: 'optimize',
        optimizations: [
          'memoization',
          'lazy loading',
          'code splitting',
          'virtual scrolling',
          'debouncing',
          'throttling'
        ]
      };

      // Generate optimized code
      const optimizedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-logic',
        context
      );

      return await this.processGeneratedLogic(jobData, optimizedCode, 'optimized');
    } catch (error) {
      logger.error('Performance optimization failed', { error: error.message });
      throw error;
    }
  }

  async addErrorHandling(jobData: LogicGenerationJob): Promise<LogicGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'error-handling'
    });

    logger.info('Adding error handling to component');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for error handling enhancement');
      }

      // Analyze current error handling
      const errorAnalysis = await this.analyzeErrorHandling(jobData.component.existingCode);
      
      // Prepare error handling context
      const context = {
        ...this.prepareLLMContext(jobData, null),
        errorAnalysis,
        mode: 'error-handling',
        errorTypes: [
          'network errors',
          'validation errors',
          'runtime errors',
          'async errors',
          'boundary errors'
        ]
      };

      // Generate code with enhanced error handling
      const enhancedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-logic',
        context
      );

      return await this.processGeneratedLogic(jobData, enhancedCode, 'error-enhanced');
    } catch (error) {
      logger.error('Error handling enhancement failed', { error: error.message });
      throw error;
    }
  }

  private async analyzeExistingCode(code: string) {
    return await this.astUtils.analyzeComponent(code);
  }

  private async analyzeGeneratedCode(code: string) {
    return await this.astUtils.analyzeComponent(code);
  }

  private prepareLLMContext(jobData: LogicGenerationJob, existingAnalysis: any) {
    return {
      userStory: jobData.userStory,
      component: {
        ...jobData.component,
        analysis: existingAnalysis
      },
      project: jobData.project,
      requirements: jobData.requirements,
      timestamp: new Date().toISOString(),
      template: {
        name: 'fe-logic',
        version: '1.0.0',
        outputFormat: 'typescript-react'
      }
    };
  }

  private extractLogicComponents(code: string, analysis: any) {
    return {
      hooks: analysis.hooks || [],
      stateVariables: analysis.stateVariables || [],
      eventHandlers: analysis.eventHandlers || [],
      apiCalls: analysis.apiCalls || [],
      validationRules: analysis.validationRules || [],
      errorBoundaries: analysis.errorBoundaries || [],
      performance: {
        memoization: analysis.memoization || [],
        optimization: analysis.optimization || []
      }
    };
  }

  private async writeComponentFile(path: string, code: string, componentName: string): Promise<string> {
    const fullPath = `${path}/${componentName}.tsx`;
    
    await this.fileWriter.writeReactComponent({
      path: fullPath,
      content: code,
      componentName,
      validate: true,
      format: true
    });

    return fullPath;
  }

  private async generateTests(jobData: LogicGenerationJob, code: string, logicComponents: any) {
    const testContext = {
      component: jobData.component,
      userStory: jobData.userStory,
      logicComponents,
      testTypes: ['unit', 'integration']
    };

    const unitTests = await this.llmOrchestrator.generateFromTemplate(
      'fe-test',
      { ...testContext, testType: 'unit' }
    );

    const integrationTests = await this.llmOrchestrator.generateFromTemplate(
      'fe-test',
      { ...testContext, testType: 'integration' }
    );

    return {
      unitTests,
      integrationTests
    };
  }

  private generateDocumentation(jobData: LogicGenerationJob, logicComponents: any): string {
    return `
# ${jobData.component.name} Logic Documentation

## Overview
${jobData.userStory.description}

## State Management
${logicComponents.stateVariables.map(v => `- ${v}`).join('\n')}

## Event Handlers
${logicComponents.eventHandlers.map(h => `- ${h}`).join('\n')}

## API Calls
${logicComponents.apiCalls.map(api => `- ${api}`).join('\n')}

## Validation Rules
${logicComponents.validationRules.map(rule => `- ${rule}`).join('\n')}

## Performance Optimizations
${logicComponents.performance.optimization.map(opt => `- ${opt}`).join('\n')}
`;
  }

  private calculateMetrics(code: string, analysis: any) {
    return {
      complexity: analysis.complexity || 0,
      linesOfCode: code.split('\n').length,
      cyclomaticComplexity: analysis.cyclomaticComplexity || 0
    };
  }

  private identifyEnhancements(analysis: any, requirements: any) {
    const enhancements = [];
    
    if (!analysis.errorHandling) {
      enhancements.push('Add comprehensive error handling');
    }
    
    if (!analysis.memoization && requirements.businessLogic.length > 3) {
      enhancements.push('Add React.memo and useMemo for performance');
    }
    
    if (!analysis.validation && requirements.validation.length > 0) {
      enhancements.push('Add input validation');
    }
    
    return enhancements;
  }

  private async analyzePerformance(code: string) {
    const analysis = await this.astUtils.analyzeComponent(code);
    
    return {
      hasUseMemo: analysis.hooks?.includes('useMemo') || false,
      hasUseCallback: analysis.hooks?.includes('useCallback') || false,
      hasMemo: code.includes('React.memo'),
      hasLazyLoading: code.includes('lazy') || code.includes('Suspense'),
      rerenderTriggers: analysis.stateVariables?.length || 0,
      complexity: analysis.complexity || 0
    };
  }

  private async analyzeErrorHandling(code: string) {
    return {
      hasTryCatch: code.includes('try') && code.includes('catch'),
      hasErrorBoundary: code.includes('ErrorBoundary'),
      hasErrorStates: code.includes('error') || code.includes('Error'),
      hasValidation: code.includes('validate') || code.includes('schema')
    };
  }

  private async processGeneratedLogic(jobData: LogicGenerationJob, code: string, type: string): Promise<LogicGenerationResult> {
    const codeAnalysis = await this.analyzeGeneratedCode(code);
    const logicComponents = this.extractLogicComponents(code, codeAnalysis);
    
    const componentPath = await this.writeComponentFile(
      jobData.component.path,
      code,
      `${jobData.component.name}-${type}`
    );

    const tests = await this.generateTests(jobData, code, logicComponents);
    const documentation = this.generateDocumentation(jobData, logicComponents);
    const metrics = this.calculateMetrics(code, codeAnalysis);

    return {
      success: true,
      componentPath,
      generatedCode: code,
      hooks: logicComponents.hooks,
      stateVariables: logicComponents.stateVariables,
      eventHandlers: logicComponents.eventHandlers,
      apiCalls: logicComponents.apiCalls,
      validationRules: logicComponents.validationRules,
      errorBoundaries: logicComponents.errorBoundaries,
      performance: logicComponents.performance,
      testing: tests,
      documentation,
      metrics
    };
  }
}