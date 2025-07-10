import { ContextualLogger } from '../../../shared/utils/logger';
import { LLMOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { FileWriter } from '../../../shared/utils/fileWriter';
import { config } from '../../../shared/config/env';

interface StyleGenerationJob {
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
    designTokens?: {
      colors: Record<string, string>;
      spacing: Record<string, string>;
      typography: Record<string, any>;
      breakpoints: Record<string, string>;
    };
  };
  project: {
    framework: string;
    styling: 'css' | 'scss' | 'tailwind' | 'styled-components';
    designSystem?: {
      theme: Record<string, any>;
      components: Record<string, any>;
    };
  };
  requirements: {
    responsive: boolean;
    darkMode: boolean;
    animations: string[];
    accessibility: string[];
    browserSupport: string[];
  };
}

interface StyleGenerationResult {
  success: boolean;
  stylePath: string;
  generatedStyles: string;
  cssVariables: Record<string, string>;
  mediaQueries: string[];
  animations: string[];
  accessibility: {
    focusStyles: string[];
    colorContrast: Record<string, number>;
    screenReaderSupport: string[];
  };
  performance: {
    optimizations: string[];
    bundleSize: number;
  };
  documentation: string;
  metrics: {
    linesOfCSS: number;
    selectorsCount: number;
    mediaQueriesCount: number;
  };
}

export class FeStyleGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private fileWriter: FileWriter;

  constructor() {
    this.logger = new ContextualLogger('fe-style-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.fileWriter = new FileWriter();
  }

  async generateComponentStyles(jobData: StyleGenerationJob): Promise<StyleGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting style generation', {
      component: jobData.component.name,
      styling: jobData.project.styling
    });

    try {
      // Analyze existing styles if provided
      let existingAnalysis = null;
      if (jobData.component.existingCode) {
        existingAnalysis = await this.analyzeExistingStyles(jobData.component.existingCode);
        logger.info('Analyzed existing styles', { analysis: existingAnalysis });
      }

      // Prepare context for LLM
      const context = this.prepareLLMContext(jobData, existingAnalysis);

      // Generate styles using LLM
      const generatedStyles = await this.llmOrchestrator.generateFromTemplate(
        'fe-style',
        context
      );

      logger.info('Generated component styles', { 
        stylesLength: generatedStyles.length 
      });

      // Analyze generated styles
      const styleAnalysis = await this.analyzeGeneratedStyles(generatedStyles);

      // Extract style components
      const styleComponents = this.extractStyleComponents(generatedStyles, styleAnalysis);

      // Write style file
      const stylePath = await this.writeStyleFile(
        jobData.component.path,
        generatedStyles,
        jobData.component.name,
        jobData.project.styling
      );

      // Generate documentation
      const documentation = this.generateDocumentation(jobData, styleComponents);

      // Calculate metrics
      const metrics = this.calculateMetrics(generatedStyles, styleAnalysis);

      logger.info('Style generation completed successfully', {
        stylePath,
        metrics
      });

      return {
        success: true,
        stylePath,
        generatedStyles,
        cssVariables: styleComponents.cssVariables,
        mediaQueries: styleComponents.mediaQueries,
        animations: styleComponents.animations,
        accessibility: styleComponents.accessibility,
        performance: styleComponents.performance,
        documentation,
        metrics
      };
    } catch (error) {
      logger.error('Style generation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async enhanceExistingStyles(jobData: StyleGenerationJob): Promise<StyleGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'enhance'
    });

    logger.info('Enhancing existing styles');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing styles provided for enhancement');
      }

      // Analyze current styles
      const currentAnalysis = await this.analyzeExistingStyles(jobData.component.existingCode);
      
      // Identify enhancement opportunities
      const enhancements = this.identifyStyleEnhancements(currentAnalysis, jobData.requirements);
      
      // Prepare enhancement context
      const context = {
        ...this.prepareLLMContext(jobData, currentAnalysis),
        enhancements,
        mode: 'enhance'
      };

      // Generate enhanced styles
      const enhancedStyles = await this.llmOrchestrator.generateFromTemplate(
        'fe-style',
        context
      );

      return await this.processGeneratedStyles(jobData, enhancedStyles, 'enhanced');
    } catch (error) {
      logger.error('Style enhancement failed', { error: error.message });
      throw error;
    }
  }

  async optimizePerformance(jobData: StyleGenerationJob): Promise<StyleGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'optimize'
    });

    logger.info('Optimizing style performance');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing styles provided for optimization');
      }

      // Analyze performance bottlenecks
      const performanceAnalysis = await this.analyzeStylePerformance(jobData.component.existingCode);
      
      // Prepare optimization context
      const context = {
        ...this.prepareLLMContext(jobData, null),
        performanceAnalysis,
        mode: 'optimize',
        optimizations: [
          'css minification',
          'unused css removal',
          'critical css extraction',
          'css-in-js optimization',
          'media query consolidation',
          'selector optimization'
        ]
      };

      // Generate optimized styles
      const optimizedStyles = await this.llmOrchestrator.generateFromTemplate(
        'fe-style',
        context
      );

      return await this.processGeneratedStyles(jobData, optimizedStyles, 'optimized');
    } catch (error) {
      logger.error('Style optimization failed', { error: error.message });
      throw error;
    }
  }

  private async analyzeExistingStyles(styleCode: string): Promise<any> {
    // Analyze existing CSS/SCSS/styled-components code
    return {
      selectors: this.extractSelectors(styleCode),
      properties: this.extractProperties(styleCode),
      mediaQueries: this.extractMediaQueries(styleCode),
      variables: this.extractCSSVariables(styleCode),
      animations: this.extractAnimations(styleCode),
      complexity: this.calculateStyleComplexity(styleCode)
    };
  }

  private async analyzeGeneratedStyles(styleCode: string): Promise<any> {
    return this.analyzeExistingStyles(styleCode);
  }

  private extractStyleComponents(styleCode: string, analysis: any): any {
    return {
      cssVariables: analysis.variables || {},
      mediaQueries: analysis.mediaQueries || [],
      animations: analysis.animations || [],
      accessibility: this.extractAccessibilityFeatures(styleCode),
      performance: this.extractPerformanceFeatures(styleCode)
    };
  }

  private extractSelectors(styleCode: string): string[] {
    const selectorRegex = /([.#]?[a-zA-Z][a-zA-Z0-9_-]*(?:\s*[>+~]\s*[a-zA-Z][a-zA-Z0-9_-]*)*)\s*{/g;
    const matches = styleCode.match(selectorRegex) || [];
    return matches.map(match => match.replace(/\s*{$/, '').trim());
  }

  private extractProperties(styleCode: string): string[] {
    const propertyRegex = /([a-zA-Z-]+)\s*:/g;
    const matches = styleCode.match(propertyRegex) || [];
    return [...new Set(matches.map(match => match.replace(':', '').trim()))];
  }

  private extractMediaQueries(styleCode: string): string[] {
    const mediaRegex = /@media\s*\([^)]+\)/g;
    return styleCode.match(mediaRegex) || [];
  }

  private extractCSSVariables(styleCode: string): Record<string, string> {
    const variableRegex = /--(\w+):\s*([^;]+);/g;
    const variables: Record<string, string> = {};
    let match;
    
    while ((match = variableRegex.exec(styleCode)) !== null) {
      variables[match[1]] = match[2].trim();
    }
    
    return variables;
  }

  private extractAnimations(styleCode: string): string[] {
    const animationRegex = /@keyframes\s+(\w+)/g;
    const matches = styleCode.match(animationRegex) || [];
    return matches.map(match => match.replace('@keyframes ', '').trim());
  }

  private calculateStyleComplexity(styleCode: string): number {
    const selectors = this.extractSelectors(styleCode).length;
    const properties = this.extractProperties(styleCode).length;
    const mediaQueries = this.extractMediaQueries(styleCode).length;
    
    return selectors + properties + (mediaQueries * 2);
  }

  private extractAccessibilityFeatures(styleCode: string): any {
    return {
      focusStyles: this.extractFocusStyles(styleCode),
      colorContrast: this.analyzeColorContrast(styleCode),
      screenReaderSupport: this.extractScreenReaderStyles(styleCode)
    };
  }

  private extractFocusStyles(styleCode: string): string[] {
    const focusRegex = /:focus[^{]*{[^}]*}/g;
    return styleCode.match(focusRegex) || [];
  }

  private analyzeColorContrast(styleCode: string): Record<string, number> {
    // Simplified color contrast analysis
    return {};
  }

  private extractScreenReaderStyles(styleCode: string): string[] {
    const srRegex = /\.sr-only[^{]*{[^}]*}/g;
    return styleCode.match(srRegex) || [];
  }

  private extractPerformanceFeatures(styleCode: string): any {
    return {
      optimizations: this.identifyOptimizations(styleCode),
      bundleSize: styleCode.length
    };
  }

  private identifyOptimizations(styleCode: string): string[] {
    const optimizations: string[] = [];
    
    if (styleCode.includes('will-change')) {
      optimizations.push('GPU acceleration');
    }
    
    if (styleCode.includes('transform3d')) {
      optimizations.push('3D transforms');
    }
    
    return optimizations;
  }

  private prepareLLMContext(jobData: StyleGenerationJob, existingAnalysis: any): any {
    return {
      userStory: jobData.userStory,
      component: jobData.component,
      project: jobData.project,
      requirements: jobData.requirements,
      existingAnalysis,
      designTokens: jobData.component.designTokens,
      designSystem: jobData.project.designSystem
    };
  }

  private async writeStyleFile(
    componentPath: string,
    styleCode: string,
    componentName: string,
    styling: string
  ): Promise<string> {
    const extension = this.getStyleExtension(styling);
    const stylePath = componentPath.replace('.tsx', extension);
    
    await this.fileWriter.writeFile(stylePath, styleCode);
    return stylePath;
  }

  private getStyleExtension(styling: string): string {
    switch (styling) {
      case 'scss': return '.scss';
      case 'css': return '.css';
      case 'styled-components': return '.styles.ts';
      case 'tailwind': return '.module.css';
      default: return '.css';
    }
  }

  private identifyStyleEnhancements(analysis: any, requirements: any): string[] {
    const enhancements: string[] = [];
    
    if (requirements.responsive && !analysis.mediaQueries.length) {
      enhancements.push('Add responsive design');
    }
    
    if (requirements.darkMode && !analysis.variables['dark-mode']) {
      enhancements.push('Add dark mode support');
    }
    
    if (requirements.animations.length && !analysis.animations.length) {
      enhancements.push('Add animations');
    }
    
    return enhancements;
  }

  private async analyzeStylePerformance(styleCode: string): Promise<any> {
    return {
      bundleSize: styleCode.length,
      selectorsCount: this.extractSelectors(styleCode).length,
      unusedRules: this.identifyUnusedRules(styleCode),
      criticalCSS: this.identifyCriticalCSS(styleCode)
    };
  }

  private identifyUnusedRules(styleCode: string): string[] {
    // Simplified unused rules detection
    return [];
  }

  private identifyCriticalCSS(styleCode: string): string[] {
    // Simplified critical CSS identification
    return [];
  }

  private async processGeneratedStyles(
    jobData: StyleGenerationJob,
    styleCode: string,
    mode: string
  ): Promise<StyleGenerationResult> {
    const analysis = await this.analyzeGeneratedStyles(styleCode);
    const components = this.extractStyleComponents(styleCode, analysis);
    const stylePath = await this.writeStyleFile(
      jobData.component.path,
      styleCode,
      jobData.component.name,
      jobData.project.styling
    );
    
    return {
      success: true,
      stylePath,
      generatedStyles: styleCode,
      cssVariables: components.cssVariables,
      mediaQueries: components.mediaQueries,
      animations: components.animations,
      accessibility: components.accessibility,
      performance: components.performance,
      documentation: this.generateDocumentation(jobData, components),
      metrics: this.calculateMetrics(styleCode, analysis)
    };
  }

  private generateDocumentation(jobData: StyleGenerationJob, components: any): string {
    return `# Style Documentation for ${jobData.component.name}\n\n` +
           `## Generated for User Story: ${jobData.userStory.title}\n\n` +
           `### CSS Variables\n${Object.keys(components.cssVariables).join(', ')}\n\n` +
           `### Media Queries\n${components.mediaQueries.length} responsive breakpoints\n\n` +
           `### Animations\n${components.animations.join(', ')}\n\n`;
  }

  private calculateMetrics(styleCode: string, analysis: any): any {
    return {
      linesOfCSS: styleCode.split('\n').length,
      selectorsCount: analysis.selectors?.length || 0,
      mediaQueriesCount: analysis.mediaQueries?.length || 0
    };
  }
}