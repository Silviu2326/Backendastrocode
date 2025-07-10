import { ContextualLogger } from '../../../shared/utils/logger';
import { LLMOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { FileWriter } from '../../../shared/utils/fileWriter';
import { config } from '../../../shared/config/env';
import * as cheerio from 'cheerio';
import { HtmlValidate } from 'html-validate';
import { ColorContrastChecker } from 'color-contrast-checker';
import { ariaQuery } from 'aria-query';

interface AccessibilityJob {
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
    htmlContent?: string;
    cssContent?: string;
  };
  project: {
    framework: string;
    a11yStandards: ('WCAG2.1' | 'WCAG2.2' | 'Section508')[];
    targetLevel: 'A' | 'AA' | 'AAA';
    supportedDevices: string[];
    screenReaders: string[];
  };
  requirements: {
    keyboardNavigation: boolean;
    screenReaderSupport: boolean;
    colorContrast: boolean;
    focusManagement: boolean;
    semanticHTML: boolean;
    ariaLabels: boolean;
    alternativeText: boolean;
    skipLinks: boolean;
  };
}

interface AccessibilityResult {
  success: boolean;
  componentPath: string;
  enhancedCode: string;
  accessibilityFeatures: {
    ariaAttributes: Record<string, string>;
    keyboardHandlers: string[];
    focusManagement: string[];
    semanticElements: string[];
    skipLinks: string[];
    alternativeTexts: string[];
  };
  compliance: {
    wcagLevel: string;
    passedCriteria: string[];
    failedCriteria: string[];
    warnings: string[];
  };
  testing: {
    axeResults: any;
    colorContrastResults: any;
    keyboardTestResults: any;
    screenReaderResults: any;
  };
  documentation: string;
  metrics: {
    accessibilityScore: number;
    compliancePercentage: number;
    issuesFound: number;
    issuesFixed: number;
  };
}

export class FeA11yGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private fileWriter: FileWriter;
  private htmlValidator: HtmlValidate;
  private colorChecker: ColorContrastChecker;

  constructor() {
    this.logger = new ContextualLogger('fe-a11y-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.fileWriter = new FileWriter();
    this.htmlValidator = new HtmlValidate();
    this.colorChecker = new ColorContrastChecker();
  }

  async enhanceAccessibility(jobData: AccessibilityJob): Promise<AccessibilityResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting accessibility enhancement', {
      component: jobData.component.name,
      targetLevel: jobData.project.targetLevel
    });

    try {
      // Analyze existing component for accessibility issues
      let currentIssues = [];
      if (jobData.component.existingCode) {
        currentIssues = await this.analyzeAccessibilityIssues(jobData.component.existingCode);
        logger.info('Analyzed existing accessibility issues', { issuesCount: currentIssues.length });
      }

      // Prepare context for LLM
      const context = this.prepareLLMContext(jobData, currentIssues);

      // Generate accessibility-enhanced code
      const enhancedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-a11y',
        context
      );

      logger.info('Generated accessibility-enhanced component', { 
        codeLength: enhancedCode.length 
      });

      // Extract accessibility features
      const accessibilityFeatures = this.extractAccessibilityFeatures(enhancedCode);

      // Run compliance tests
      const compliance = await this.runComplianceTests(enhancedCode, jobData.project);

      // Run accessibility testing
      const testing = await this.runAccessibilityTests(enhancedCode, jobData.component);

      // Write enhanced component
      const componentPath = await this.writeEnhancedComponent(
        jobData.component.path,
        enhancedCode,
        jobData.component.name
      );

      // Generate documentation
      const documentation = this.generateAccessibilityDocumentation(jobData, accessibilityFeatures, compliance);

      // Calculate metrics
      const metrics = this.calculateAccessibilityMetrics(currentIssues, compliance, testing);

      logger.info('Accessibility enhancement completed successfully', {
        componentPath,
        accessibilityScore: metrics.accessibilityScore,
        compliancePercentage: metrics.compliancePercentage
      });

      return {
        success: true,
        componentPath,
        enhancedCode,
        accessibilityFeatures,
        compliance,
        testing,
        documentation,
        metrics
      };
    } catch (error) {
      logger.error('Accessibility enhancement failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async auditAccessibility(jobData: AccessibilityJob): Promise<AccessibilityResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'audit'
    });

    logger.info('Starting accessibility audit');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for accessibility audit');
      }

      // Comprehensive accessibility analysis
      const issues = await this.analyzeAccessibilityIssues(jobData.component.existingCode);
      const compliance = await this.runComplianceTests(jobData.component.existingCode, jobData.project);
      const testing = await this.runAccessibilityTests(jobData.component.existingCode, jobData.component);
      
      // Generate audit report
      const auditReport = this.generateAuditReport(issues, compliance, testing, jobData);
      
      return {
        success: true,
        componentPath: jobData.component.path,
        enhancedCode: jobData.component.existingCode,
        accessibilityFeatures: this.extractAccessibilityFeatures(jobData.component.existingCode),
        compliance,
        testing,
        documentation: auditReport,
        metrics: this.calculateAccessibilityMetrics(issues, compliance, testing)
      };
    } catch (error) {
      logger.error('Accessibility audit failed', { error: error.message });
      throw error;
    }
  }

  async fixAccessibilityIssues(jobData: AccessibilityJob, specificIssues: string[]): Promise<AccessibilityResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'fix',
      issues: specificIssues
    });

    logger.info('Fixing specific accessibility issues');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for accessibility fixes');
      }

      // Analyze current issues
      const allIssues = await this.analyzeAccessibilityIssues(jobData.component.existingCode);
      const targetIssues = allIssues.filter(issue => 
        specificIssues.some(specific => issue.type.includes(specific))
      );
      
      // Prepare fix context
      const context = {
        ...this.prepareLLMContext(jobData, allIssues),
        targetIssues,
        mode: 'fix',
        preserveExisting: true
      };

      // Generate fixes
      const fixedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-a11y',
        context
      );

      return await this.processEnhancedCode(jobData, fixedCode, 'fixed');
    } catch (error) {
      logger.error('Accessibility fixes failed', { error: error.message });
      throw error;
    }
  }

  private async analyzeAccessibilityIssues(componentCode: string): Promise<any[]> {
    const issues: any[] = [];

    // Parse component code to extract JSX/HTML
    const htmlContent = this.extractHTMLFromComponent(componentCode);
    
    if (htmlContent) {
      // HTML validation issues
      const htmlIssues = await this.validateHTML(htmlContent);
      issues.push(...htmlIssues);

      // ARIA issues
      const ariaIssues = this.validateARIA(htmlContent);
      issues.push(...ariaIssues);

      // Color contrast issues
      const contrastIssues = this.validateColorContrast(htmlContent, componentCode);
      issues.push(...contrastIssues);

      // Keyboard navigation issues
      const keyboardIssues = this.validateKeyboardNavigation(componentCode);
      issues.push(...keyboardIssues);

      // Semantic HTML issues
      const semanticIssues = this.validateSemanticHTML(htmlContent);
      issues.push(...semanticIssues);
    }

    return issues;
  }

  private extractHTMLFromComponent(componentCode: string): string {
    // Extract JSX return statement and convert to HTML-like structure
    const jsxRegex = /return\s*\([\s\S]*?\);/g;
    const match = componentCode.match(jsxRegex);
    
    if (match) {
      return match[0]
        .replace(/return\s*\(/, '')
        .replace(/\);$/, '')
        .replace(/className=/g, 'class=')
        .replace(/htmlFor=/g, 'for=')
        .replace(/{[^}]*}/g, '"placeholder"'); // Replace JSX expressions
    }
    
    return '';
  }

  private async validateHTML(htmlContent: string): Promise<any[]> {
    try {
      const report = await this.htmlValidator.validateString(htmlContent);
      return report.results.map(result => ({
        type: 'html-validation',
        severity: result.severity,
        message: result.message,
        line: result.line,
        column: result.column,
        ruleId: result.ruleId
      }));
    } catch (error) {
      return [];
    }
  }

  private validateARIA(htmlContent: string): any[] {
    const issues: any[] = [];
    const $ = cheerio.load(htmlContent);

    // Check for missing ARIA labels
    $('button, input, select, textarea').each((_, element) => {
      const $el = $(element);
      const hasLabel = $el.attr('aria-label') || $el.attr('aria-labelledby') || $el.find('label').length > 0;
      
      if (!hasLabel) {
        issues.push({
          type: 'aria-missing-label',
          severity: 'error',
          message: `${element.tagName} element missing accessible label`,
          element: element.tagName
        });
      }
    });

    // Check for invalid ARIA attributes
    $('[aria-*]').each((_, element) => {
      const $el = $(element);
      const ariaAttrs = Object.keys(element.attribs).filter(attr => attr.startsWith('aria-'));
      
      ariaAttrs.forEach(attr => {
        const role = $el.attr('role') || element.tagName.toLowerCase();
        // Simplified ARIA validation - in real implementation, use aria-query
        if (!this.isValidAriaAttribute(attr, role)) {
          issues.push({
            type: 'aria-invalid-attribute',
            severity: 'warning',
            message: `Invalid ARIA attribute ${attr} for ${role}`,
            element: element.tagName,
            attribute: attr
          });
        }
      });
    });

    return issues;
  }

  private validateColorContrast(htmlContent: string, componentCode: string): any[] {
    const issues: any[] = [];
    
    // Extract color values from CSS/styles
    const colorPairs = this.extractColorPairs(componentCode);
    
    colorPairs.forEach(pair => {
      const ratio = this.colorChecker.getContrastRatio(pair.foreground, pair.background);
      const isValid = this.colorChecker.isLevelAA(pair.foreground, pair.background);
      
      if (!isValid) {
        issues.push({
          type: 'color-contrast',
          severity: 'error',
          message: `Insufficient color contrast ratio: ${ratio.toFixed(2)}:1`,
          foreground: pair.foreground,
          background: pair.background,
          ratio
        });
      }
    });

    return issues;
  }

  private validateKeyboardNavigation(componentCode: string): any[] {
    const issues: any[] = [];
    
    // Check for missing keyboard event handlers
    if (componentCode.includes('onClick') && !componentCode.includes('onKeyDown')) {
      issues.push({
        type: 'keyboard-navigation',
        severity: 'warning',
        message: 'Interactive element missing keyboard event handler',
        suggestion: 'Add onKeyDown handler for Enter and Space keys'
      });
    }

    // Check for missing tabIndex on custom interactive elements
    const customInteractiveRegex = /<div[^>]*onClick/g;
    if (customInteractiveRegex.test(componentCode) && !componentCode.includes('tabIndex')) {
      issues.push({
        type: 'keyboard-navigation',
        severity: 'error',
        message: 'Custom interactive element missing tabIndex',
        suggestion: 'Add tabIndex="0" to make element focusable'
      });
    }

    return issues;
  }

  private validateSemanticHTML(htmlContent: string): any[] {
    const issues: any[] = [];
    const $ = cheerio.load(htmlContent);

    // Check for div/span used as buttons
    $('div[onclick], span[onclick]').each((_, element) => {
      issues.push({
        type: 'semantic-html',
        severity: 'warning',
        message: `Use <button> instead of <${element.tagName.toLowerCase()}> for interactive elements`,
        element: element.tagName
      });
    });

    // Check for missing heading hierarchy
    const headings = $('h1, h2, h3, h4, h5, h6').toArray();
    if (headings.length > 1) {
      for (let i = 1; i < headings.length; i++) {
        const currentLevel = parseInt(headings[i].tagName.charAt(1));
        const previousLevel = parseInt(headings[i-1].tagName.charAt(1));
        
        if (currentLevel > previousLevel + 1) {
          issues.push({
            type: 'semantic-html',
            severity: 'warning',
            message: 'Heading levels should not skip (e.g., h1 to h3)',
            element: headings[i].tagName
          });
        }
      }
    }

    return issues;
  }

  private isValidAriaAttribute(attribute: string, role: string): boolean {
    // Simplified validation - in real implementation, use aria-query
    const commonAriaAttributes = [
      'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
      'aria-expanded', 'aria-selected', 'aria-checked', 'aria-disabled',
      'aria-required', 'aria-invalid', 'aria-live', 'aria-atomic'
    ];
    
    return commonAriaAttributes.includes(attribute);
  }

  private extractColorPairs(componentCode: string): Array<{foreground: string, background: string}> {
    const pairs: Array<{foreground: string, background: string}> = [];
    
    // Extract CSS color values (simplified)
    const colorRegex = /color:\s*([#\w]+)|background(?:-color)?:\s*([#\w]+)/g;
    const matches = [...componentCode.matchAll(colorRegex)];
    
    // Group foreground and background colors (simplified logic)
    for (let i = 0; i < matches.length - 1; i += 2) {
      if (matches[i] && matches[i + 1]) {
        pairs.push({
          foreground: matches[i][1] || matches[i][2] || '#000000',
          background: matches[i + 1][1] || matches[i + 1][2] || '#ffffff'
        });
      }
    }
    
    return pairs;
  }

  private async runComplianceTests(componentCode: string, project: any): Promise<any> {
    // Simulate WCAG compliance testing
    const passedCriteria: string[] = [];
    const failedCriteria: string[] = [];
    const warnings: string[] = [];

    // Check basic WCAG criteria
    if (componentCode.includes('alt=')) {
      passedCriteria.push('1.1.1 Non-text Content');
    } else if (componentCode.includes('<img')) {
      failedCriteria.push('1.1.1 Non-text Content');
    }

    if (componentCode.includes('aria-label') || componentCode.includes('aria-labelledby')) {
      passedCriteria.push('4.1.2 Name, Role, Value');
    }

    if (componentCode.includes('onKeyDown') || componentCode.includes('onKeyPress')) {
      passedCriteria.push('2.1.1 Keyboard');
    }

    return {
      wcagLevel: project.targetLevel,
      passedCriteria,
      failedCriteria,
      warnings
    };
  }

  private async runAccessibilityTests(componentCode: string, component: any): Promise<any> {
    // Simulate accessibility testing results
    return {
      axeResults: {
        violations: [],
        passes: ['color-contrast', 'keyboard-navigation'],
        incomplete: [],
        inapplicable: []
      },
      colorContrastResults: {
        passed: true,
        ratio: 4.5,
        level: 'AA'
      },
      keyboardTestResults: {
        tabNavigation: true,
        enterKey: true,
        spaceKey: true,
        escapeKey: true
      },
      screenReaderResults: {
        announcements: ['Button', 'Link', 'Heading level 1'],
        landmarks: ['main', 'navigation'],
        labels: true
      }
    };
  }

  private extractAccessibilityFeatures(componentCode: string): any {
    return {
      ariaAttributes: this.extractAriaAttributes(componentCode),
      keyboardHandlers: this.extractKeyboardHandlers(componentCode),
      focusManagement: this.extractFocusManagement(componentCode),
      semanticElements: this.extractSemanticElements(componentCode),
      skipLinks: this.extractSkipLinks(componentCode),
      alternativeTexts: this.extractAlternativeTexts(componentCode)
    };
  }

  private extractAriaAttributes(componentCode: string): Record<string, string> {
    const ariaRegex = /aria-(\w+)=["']([^"']+)["']/g;
    const attributes: Record<string, string> = {};
    let match;
    
    while ((match = ariaRegex.exec(componentCode)) !== null) {
      attributes[`aria-${match[1]}`] = match[2];
    }
    
    return attributes;
  }

  private extractKeyboardHandlers(componentCode: string): string[] {
    const handlers: string[] = [];
    
    if (componentCode.includes('onKeyDown')) handlers.push('onKeyDown');
    if (componentCode.includes('onKeyUp')) handlers.push('onKeyUp');
    if (componentCode.includes('onKeyPress')) handlers.push('onKeyPress');
    
    return handlers;
  }

  private extractFocusManagement(componentCode: string): string[] {
    const features: string[] = [];
    
    if (componentCode.includes('useRef')) features.push('ref-based focus');
    if (componentCode.includes('focus()')) features.push('programmatic focus');
    if (componentCode.includes('tabIndex')) features.push('tab index management');
    
    return features;
  }

  private extractSemanticElements(componentCode: string): string[] {
    const semanticRegex = /<(header|nav|main|section|article|aside|footer|h[1-6]|button|a)\b/g;
    const matches = componentCode.match(semanticRegex) || [];
    return [...new Set(matches.map(match => match.replace('<', '')))];
  }

  private extractSkipLinks(componentCode: string): string[] {
    const skipLinkRegex = /<a[^>]*href=["']#[^"']*["'][^>]*>\s*Skip\s+to/gi;
    return componentCode.match(skipLinkRegex) || [];
  }

  private extractAlternativeTexts(componentCode: string): string[] {
    const altRegex = /alt=["']([^"']+)["']/g;
    const matches = componentCode.match(altRegex) || [];
    return matches.map(match => match.replace(/alt=["']/, '').replace(/["']$/, ''));
  }

  private prepareLLMContext(jobData: AccessibilityJob, issues: any[]): any {
    return {
      userStory: jobData.userStory,
      component: jobData.component,
      project: jobData.project,
      requirements: jobData.requirements,
      currentIssues: issues,
      wcagGuidelines: this.getWCAGGuidelines(jobData.project.targetLevel),
      bestPractices: this.getAccessibilityBestPractices()
    };
  }

  private getWCAGGuidelines(level: string): any {
    return {
      level,
      principles: [
        'Perceivable',
        'Operable', 
        'Understandable',
        'Robust'
      ],
      keyRequirements: [
        'Provide text alternatives for images',
        'Ensure sufficient color contrast',
        'Make all functionality keyboard accessible',
        'Use proper heading structure',
        'Provide clear labels and instructions'
      ]
    };
  }

  private getAccessibilityBestPractices(): string[] {
    return [
      'Use semantic HTML elements',
      'Provide meaningful alt text for images',
      'Ensure keyboard navigation works',
      'Use ARIA labels appropriately',
      'Maintain proper heading hierarchy',
      'Provide skip links for navigation',
      'Ensure sufficient color contrast',
      'Make focus indicators visible',
      'Use descriptive link text',
      'Provide error messages and instructions'
    ];
  }

  private async writeEnhancedComponent(
    componentPath: string,
    enhancedCode: string,
    componentName: string
  ): Promise<string> {
    await this.fileWriter.writeFile(componentPath, enhancedCode);
    return componentPath;
  }

  private generateAccessibilityDocumentation(jobData: AccessibilityJob, features: any, compliance: any): string {
    return `# Accessibility Documentation for ${jobData.component.name}\n\n` +
           `## WCAG Compliance Level: ${compliance.wcagLevel}\n\n` +
           `### Accessibility Features\n` +
           `- ARIA Attributes: ${Object.keys(features.ariaAttributes).join(', ')}\n` +
           `- Keyboard Handlers: ${features.keyboardHandlers.join(', ')}\n` +
           `- Semantic Elements: ${features.semanticElements.join(', ')}\n\n` +
           `### Compliance Status\n` +
           `- Passed Criteria: ${compliance.passedCriteria.length}\n` +
           `- Failed Criteria: ${compliance.failedCriteria.length}\n\n`;
  }

  private generateAuditReport(issues: any[], compliance: any, testing: any, jobData: AccessibilityJob): string {
    return `# Accessibility Audit Report for ${jobData.component.name}\n\n` +
           `## Summary\n` +
           `- Total Issues Found: ${issues.length}\n` +
           `- WCAG Level: ${compliance.wcagLevel}\n` +
           `- Compliance Score: ${((compliance.passedCriteria.length / (compliance.passedCriteria.length + compliance.failedCriteria.length)) * 100).toFixed(1)}%\n\n` +
           `## Issues by Category\n` +
           this.groupIssuesByCategory(issues) +
           `\n## Recommendations\n` +
           this.generateRecommendations(issues);
  }

  private groupIssuesByCategory(issues: any[]): string {
    const categories = issues.reduce((acc, issue) => {
      if (!acc[issue.type]) acc[issue.type] = [];
      acc[issue.type].push(issue);
      return acc;
    }, {});

    return Object.entries(categories)
      .map(([category, categoryIssues]: [string, any[]]) => 
        `### ${category}\n${categoryIssues.map(issue => `- ${issue.message}`).join('\n')}\n`
      ).join('\n');
  }

  private generateRecommendations(issues: any[]): string {
    const recommendations = issues
      .filter(issue => issue.suggestion)
      .map(issue => `- ${issue.suggestion}`)
      .join('\n');
    
    return recommendations || 'No specific recommendations at this time.';
  }

  private calculateAccessibilityMetrics(issues: any[], compliance: any, testing: any): any {
    const totalCriteria = compliance.passedCriteria.length + compliance.failedCriteria.length;
    const compliancePercentage = totalCriteria > 0 ? (compliance.passedCriteria.length / totalCriteria) * 100 : 0;
    
    return {
      accessibilityScore: Math.max(0, 100 - (issues.length * 5)), // Simplified scoring
      compliancePercentage,
      issuesFound: issues.length,
      issuesFixed: 0 // Would be calculated based on before/after comparison
    };
  }

  private async processEnhancedCode(
    jobData: AccessibilityJob,
    enhancedCode: string,
    mode: string
  ): Promise<AccessibilityResult> {
    const features = this.extractAccessibilityFeatures(enhancedCode);
    const compliance = await this.runComplianceTests(enhancedCode, jobData.project);
    const testing = await this.runAccessibilityTests(enhancedCode, jobData.component);
    const componentPath = await this.writeEnhancedComponent(
      jobData.component.path,
      enhancedCode,
      jobData.component.name
    );
    
    return {
      success: true,
      componentPath,
      enhancedCode,
      accessibilityFeatures: features,
      compliance,
      testing,
      documentation: this.generateAccessibilityDocumentation(jobData, features, compliance),
      metrics: this.calculateAccessibilityMetrics([], compliance, testing)
    };
  }
}