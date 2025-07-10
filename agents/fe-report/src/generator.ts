import { ContextualLogger } from '../../../shared/utils/logger';
import { LLMOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { FileWriter } from '../../../shared/utils/fileWriter';
import { config } from '../../../shared/config/env';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as glob from 'glob';
import { marked } from 'marked';
import * as Handlebars from 'handlebars';
import * as moment from 'moment';
import * as _ from 'lodash';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as lighthouse from 'lighthouse';
import * as puppeteer from 'puppeteer';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import * as cheerio from 'cheerio';

interface ReportJob {
  userStory: {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    priority: number;
    complexity: number;
  };
  project: {
    name: string;
    version: string;
    framework: string;
    rootPath: string;
    buildPath: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  components: Array<{
    name: string;
    path: string;
    type: 'page' | 'component' | 'layout';
    code: string;
    tests?: string;
    styles?: string;
    documentation?: string;
  }>;
  requirements: {
    includeMetrics: boolean;
    includePerformance: boolean;
    includeAccessibility: boolean;
    includeSecurity: boolean;
    includeTestCoverage: boolean;
    includeBundleAnalysis: boolean;
    includeDocumentation: boolean;
    format: 'html' | 'pdf' | 'markdown' | 'json';
    template?: string;
  };
}

interface ReportResult {
  success: boolean;
  reportPath: string;
  reportContent: string;
  format: string;
  sections: {
    summary: ReportSummary;
    metrics: ComponentMetrics;
    performance: PerformanceReport;
    accessibility: AccessibilityReport;
    security: SecurityReport;
    testCoverage: TestCoverageReport;
    bundleAnalysis: BundleAnalysisReport;
    documentation: DocumentationReport;
  };
  assets: {
    charts: string[];
    screenshots: string[];
    files: string[];
  };
  metadata: {
    generatedAt: string;
    version: string;
    totalComponents: number;
    reportSize: number;
  };
}

interface ReportSummary {
  projectName: string;
  totalComponents: number;
  totalLines: number;
  overallScore: number;
  recommendations: string[];
  highlights: string[];
  issues: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    description: string;
    component?: string;
  }>;
}

interface ComponentMetrics {
  complexity: Record<string, number>;
  maintainability: Record<string, number>;
  reusability: Record<string, number>;
  performance: Record<string, number>;
  quality: Record<string, number>;
  trends: {
    complexity: Array<{ date: string; value: number }>;
    quality: Array<{ date: string; value: number }>;
  };
}

interface PerformanceReport {
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
    pwa: number;
  };
  bundleSize: {
    total: number;
    gzipped: number;
    breakdown: Record<string, number>;
  };
  loadTimes: {
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    firstInputDelay: number;
    cumulativeLayoutShift: number;
  };
  recommendations: string[];
}

interface AccessibilityReport {
  score: number;
  violations: Array<{
    rule: string;
    impact: string;
    description: string;
    nodes: number;
    help: string;
  }>;
  passes: Array<{
    rule: string;
    description: string;
  }>;
  wcagLevel: 'A' | 'AA' | 'AAA';
  recommendations: string[];
}

interface SecurityReport {
  vulnerabilities: Array<{
    severity: 'low' | 'medium' | 'high' | 'critical';
    type: string;
    description: string;
    component?: string;
    recommendation: string;
  }>;
  dependencies: {
    total: number;
    outdated: number;
    vulnerable: number;
    recommendations: string[];
  };
  codeAnalysis: {
    xssRisks: number;
    sqlInjectionRisks: number;
    authenticationIssues: number;
    dataExposureRisks: number;
  };
}

interface TestCoverageReport {
  overall: {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  };
  byComponent: Record<string, {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
  }>;
  uncoveredLines: Array<{
    file: string;
    line: number;
    code: string;
  }>;
  recommendations: string[];
}

interface BundleAnalysisReport {
  totalSize: number;
  gzippedSize: number;
  modules: Array<{
    name: string;
    size: number;
    gzippedSize: number;
    percentage: number;
  }>;
  duplicates: Array<{
    module: string;
    instances: number;
    wastedSize: number;
  }>;
  recommendations: string[];
  treeshaking: {
    unusedExports: string[];
    potentialSavings: number;
  };
}

interface DocumentationReport {
  coverage: {
    components: number;
    functions: number;
    interfaces: number;
    overall: number;
  };
  quality: {
    completeness: number;
    clarity: number;
    examples: number;
    upToDate: number;
  };
  missing: Array<{
    type: 'component' | 'function' | 'interface' | 'prop';
    name: string;
    location: string;
  }>;
  recommendations: string[];
}

export class FeReportGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private fileWriter: FileWriter;

  constructor() {
    this.logger = new ContextualLogger('fe-report-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.fileWriter = new FileWriter();
    this.setupHandlebarsHelpers();
  }

  async generateComprehensiveReport(jobData: ReportJob): Promise<ReportResult> {
    const logger = this.logger.withContext({ 
      project: jobData.project.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting comprehensive report generation', {
      project: jobData.project.name,
      componentsCount: jobData.components.length,
      format: jobData.requirements.format
    });

    try {
      // Generate all report sections
      const sections = await this.generateAllSections(jobData);
      
      // Generate report content based on format
      const reportContent = await this.generateReportContent(jobData, sections);
      
      // Write report to file
      const reportPath = await this.writeReport(jobData, reportContent);
      
      // Generate assets (charts, screenshots, etc.)
      const assets = await this.generateAssets(jobData, sections);
      
      // Calculate metadata
      const metadata = this.calculateMetadata(jobData, reportContent);
      
      logger.info('Report generation completed successfully', {
        reportPath,
        format: jobData.requirements.format,
        size: metadata.reportSize
      });

      return {
        success: true,
        reportPath,
        reportContent,
        format: jobData.requirements.format,
        sections,
        assets,
        metadata
      };
    } catch (error) {
      logger.error('Report generation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async generateMetricsReport(jobData: ReportJob): Promise<ReportResult> {
    const logger = this.logger.withContext({ 
      project: jobData.project.name,
      action: 'metrics-report'
    });

    logger.info('Generating metrics report');

    try {
      const metrics = await this.analyzeComponentMetrics(jobData.components);
      const summary = this.generateMetricsSummary(metrics);
      
      const sections = {
        summary,
        metrics,
        performance: {} as PerformanceReport,
        accessibility: {} as AccessibilityReport,
        security: {} as SecurityReport,
        testCoverage: {} as TestCoverageReport,
        bundleAnalysis: {} as BundleAnalysisReport,
        documentation: {} as DocumentationReport
      };
      
      return await this.finalizeReport(jobData, sections, 'metrics');
    } catch (error) {
      logger.error('Metrics report generation failed', { error: error.message });
      throw error;
    }
  }

  async generatePerformanceReport(jobData: ReportJob): Promise<ReportResult> {
    const logger = this.logger.withContext({ 
      project: jobData.project.name,
      action: 'performance-report'
    });

    logger.info('Generating performance report');

    try {
      const performance = await this.analyzePerformance(jobData);
      const summary = this.generatePerformanceSummary(performance);
      
      const sections = {
        summary,
        metrics: {} as ComponentMetrics,
        performance,
        accessibility: {} as AccessibilityReport,
        security: {} as SecurityReport,
        testCoverage: {} as TestCoverageReport,
        bundleAnalysis: {} as BundleAnalysisReport,
        documentation: {} as DocumentationReport
      };
      
      return await this.finalizeReport(jobData, sections, 'performance');
    } catch (error) {
      logger.error('Performance report generation failed', { error: error.message });
      throw error;
    }
  }

  private async generateAllSections(jobData: ReportJob): Promise<any> {
    const sections: any = {};
    
    // Generate summary
    sections.summary = await this.generateSummary(jobData);
    
    // Generate metrics if requested
    if (jobData.requirements.includeMetrics) {
      sections.metrics = await this.analyzeComponentMetrics(jobData.components);
    }
    
    // Generate performance report if requested
    if (jobData.requirements.includePerformance) {
      sections.performance = await this.analyzePerformance(jobData);
    }
    
    // Generate accessibility report if requested
    if (jobData.requirements.includeAccessibility) {
      sections.accessibility = await this.analyzeAccessibility(jobData);
    }
    
    // Generate security report if requested
    if (jobData.requirements.includeSecurity) {
      sections.security = await this.analyzeSecurity(jobData);
    }
    
    // Generate test coverage if requested
    if (jobData.requirements.includeTestCoverage) {
      sections.testCoverage = await this.analyzeTestCoverage(jobData);
    }
    
    // Generate bundle analysis if requested
    if (jobData.requirements.includeBundleAnalysis) {
      sections.bundleAnalysis = await this.analyzeBundleSize(jobData);
    }
    
    // Generate documentation report if requested
    if (jobData.requirements.includeDocumentation) {
      sections.documentation = await this.analyzeDocumentation(jobData);
    }
    
    return sections;
  }

  private async generateSummary(jobData: ReportJob): Promise<ReportSummary> {
    const totalComponents = jobData.components.length;
    const totalLines = jobData.components.reduce((sum, comp) => 
      sum + (comp.code?.split('\n').length || 0), 0
    );
    
    // Calculate overall score based on various factors
    const overallScore = this.calculateOverallScore(jobData.components);
    
    // Generate recommendations using LLM
    const context = {
      project: jobData.project,
      components: jobData.components,
      metrics: { totalComponents, totalLines, overallScore }
    };
    
    const recommendations = await this.generateRecommendations(context);
    const highlights = this.extractHighlights(jobData.components);
    const issues = this.identifyIssues(jobData.components);
    
    return {
      projectName: jobData.project.name,
      totalComponents,
      totalLines,
      overallScore,
      recommendations,
      highlights,
      issues
    };
  }

  private async analyzeComponentMetrics(components: any[]): Promise<ComponentMetrics> {
    const metrics: ComponentMetrics = {
      complexity: {},
      maintainability: {},
      reusability: {},
      performance: {},
      quality: {},
      trends: {
        complexity: [],
        quality: []
      }
    };
    
    for (const component of components) {
      const name = component.name;
      
      // Calculate complexity metrics
      metrics.complexity[name] = this.calculateComplexity(component.code);
      
      // Calculate maintainability
      metrics.maintainability[name] = this.calculateMaintainability(component.code);
      
      // Calculate reusability
      metrics.reusability[name] = this.calculateReusability(component.code);
      
      // Calculate performance metrics
      metrics.performance[name] = this.calculatePerformanceMetrics(component.code);
      
      // Calculate quality score
      metrics.quality[name] = this.calculateQualityScore(component.code);
    }
    
    // Generate trends (mock data for now)
    metrics.trends = this.generateTrends();
    
    return metrics;
  }

  private async analyzePerformance(jobData: ReportJob): Promise<PerformanceReport> {
    const performance: PerformanceReport = {
      lighthouse: {
        performance: 0,
        accessibility: 0,
        bestPractices: 0,
        seo: 0,
        pwa: 0
      },
      bundleSize: {
        total: 0,
        gzipped: 0,
        breakdown: {}
      },
      loadTimes: {
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        firstInputDelay: 0,
        cumulativeLayoutShift: 0
      },
      recommendations: []
    };
    
    try {
      // Run Lighthouse audit if build path exists
      if (jobData.project.buildPath && await fs.pathExists(jobData.project.buildPath)) {
        performance.lighthouse = await this.runLighthouseAudit(jobData.project.buildPath);
      }
      
      // Analyze bundle size
      performance.bundleSize = await this.analyzeBundleSize(jobData);
      
      // Calculate load times (estimated)
      performance.loadTimes = this.estimateLoadTimes(performance.bundleSize);
      
      // Generate performance recommendations
      performance.recommendations = this.generatePerformanceRecommendations(performance);
      
    } catch (error) {
      this.logger.warn('Performance analysis failed', { error: error.message });
    }
    
    return performance;
  }

  private async analyzeAccessibility(jobData: ReportJob): Promise<AccessibilityReport> {
    const accessibility: AccessibilityReport = {
      score: 0,
      violations: [],
      passes: [],
      wcagLevel: 'A',
      recommendations: []
    };
    
    try {
      // Analyze each component for accessibility issues
      for (const component of jobData.components) {
        const componentA11y = await this.analyzeComponentAccessibility(component.code);
        accessibility.violations.push(...componentA11y.violations);
        accessibility.passes.push(...componentA11y.passes);
      }
      
      // Calculate overall accessibility score
      accessibility.score = this.calculateAccessibilityScore(accessibility.violations, accessibility.passes);
      
      // Determine WCAG level
      accessibility.wcagLevel = this.determineWCAGLevel(accessibility.violations);
      
      // Generate recommendations
      accessibility.recommendations = this.generateAccessibilityRecommendations(accessibility.violations);
      
    } catch (error) {
      this.logger.warn('Accessibility analysis failed', { error: error.message });
    }
    
    return accessibility;
  }

  private async analyzeSecurity(jobData: ReportJob): Promise<SecurityReport> {
    const security: SecurityReport = {
      vulnerabilities: [],
      dependencies: {
        total: 0,
        outdated: 0,
        vulnerable: 0,
        recommendations: []
      },
      codeAnalysis: {
        xssRisks: 0,
        sqlInjectionRisks: 0,
        authenticationIssues: 0,
        dataExposureRisks: 0
      }
    };
    
    try {
      // Analyze dependencies
      security.dependencies = await this.analyzeDependencySecurity(jobData.project);
      
      // Analyze code for security issues
      for (const component of jobData.components) {
        const componentSecurity = this.analyzeComponentSecurity(component.code);
        security.vulnerabilities.push(...componentSecurity.vulnerabilities);
        
        security.codeAnalysis.xssRisks += componentSecurity.xssRisks;
        security.codeAnalysis.sqlInjectionRisks += componentSecurity.sqlInjectionRisks;
        security.codeAnalysis.authenticationIssues += componentSecurity.authenticationIssues;
        security.codeAnalysis.dataExposureRisks += componentSecurity.dataExposureRisks;
      }
      
    } catch (error) {
      this.logger.warn('Security analysis failed', { error: error.message });
    }
    
    return security;
  }

  private async analyzeTestCoverage(jobData: ReportJob): Promise<TestCoverageReport> {
    const testCoverage: TestCoverageReport = {
      overall: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0
      },
      byComponent: {},
      uncoveredLines: [],
      recommendations: []
    };
    
    try {
      // Analyze test coverage for each component
      for (const component of jobData.components) {
        if (component.tests) {
          const coverage = this.analyzeComponentTestCoverage(component.code, component.tests);
          testCoverage.byComponent[component.name] = coverage;
          
          // Update overall coverage
          testCoverage.overall.lines += coverage.lines;
          testCoverage.overall.functions += coverage.functions;
          testCoverage.overall.branches += coverage.branches;
          testCoverage.overall.statements += coverage.statements;
        }
      }
      
      // Calculate average coverage
      const componentCount = Object.keys(testCoverage.byComponent).length;
      if (componentCount > 0) {
        testCoverage.overall.lines /= componentCount;
        testCoverage.overall.functions /= componentCount;
        testCoverage.overall.branches /= componentCount;
        testCoverage.overall.statements /= componentCount;
      }
      
      // Find uncovered lines
      testCoverage.uncoveredLines = this.findUncoveredLines(jobData.components);
      
      // Generate recommendations
      testCoverage.recommendations = this.generateTestCoverageRecommendations(testCoverage);
      
    } catch (error) {
      this.logger.warn('Test coverage analysis failed', { error: error.message });
    }
    
    return testCoverage;
  }

  private async analyzeBundleSize(jobData: ReportJob): Promise<BundleAnalysisReport> {
    const bundleAnalysis: BundleAnalysisReport = {
      totalSize: 0,
      gzippedSize: 0,
      modules: [],
      duplicates: [],
      recommendations: [],
      treeshaking: {
        unusedExports: [],
        potentialSavings: 0
      }
    };
    
    try {
      // Estimate bundle size based on components
      bundleAnalysis.totalSize = this.estimateBundleSize(jobData.components);
      bundleAnalysis.gzippedSize = Math.round(bundleAnalysis.totalSize * 0.3); // Rough estimate
      
      // Analyze modules
      bundleAnalysis.modules = this.analyzeModules(jobData.components);
      
      // Find duplicates
      bundleAnalysis.duplicates = this.findDuplicateModules(jobData.components);
      
      // Analyze tree shaking opportunities
      bundleAnalysis.treeshaking = this.analyzeTreeShaking(jobData.components);
      
      // Generate recommendations
      bundleAnalysis.recommendations = this.generateBundleRecommendations(bundleAnalysis);
      
    } catch (error) {
      this.logger.warn('Bundle analysis failed', { error: error.message });
    }
    
    return bundleAnalysis;
  }

  private async analyzeDocumentation(jobData: ReportJob): Promise<DocumentationReport> {
    const documentation: DocumentationReport = {
      coverage: {
        components: 0,
        functions: 0,
        interfaces: 0,
        overall: 0
      },
      quality: {
        completeness: 0,
        clarity: 0,
        examples: 0,
        upToDate: 0
      },
      missing: [],
      recommendations: []
    };
    
    try {
      // Analyze documentation coverage
      for (const component of jobData.components) {
        const docAnalysis = this.analyzeComponentDocumentation(component);
        
        documentation.coverage.components += docAnalysis.hasDocumentation ? 1 : 0;
        documentation.coverage.functions += docAnalysis.documentedFunctions;
        documentation.coverage.interfaces += docAnalysis.documentedInterfaces;
        
        documentation.missing.push(...docAnalysis.missing);
      }
      
      // Calculate percentages
      const totalComponents = jobData.components.length;
      documentation.coverage.components = (documentation.coverage.components / totalComponents) * 100;
      documentation.coverage.overall = this.calculateOverallDocCoverage(documentation.coverage);
      
      // Analyze quality
      documentation.quality = this.analyzeDocumentationQuality(jobData.components);
      
      // Generate recommendations
      documentation.recommendations = this.generateDocumentationRecommendations(documentation);
      
    } catch (error) {
      this.logger.warn('Documentation analysis failed', { error: error.message });
    }
    
    return documentation;
  }

  private async generateReportContent(jobData: ReportJob, sections: any): Promise<string> {
    const format = jobData.requirements.format;
    
    switch (format) {
      case 'html':
        return await this.generateHTMLReport(jobData, sections);
      case 'pdf':
        return await this.generatePDFReport(jobData, sections);
      case 'markdown':
        return await this.generateMarkdownReport(jobData, sections);
      case 'json':
        return JSON.stringify({ project: jobData.project, sections }, null, 2);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  private async generateHTMLReport(jobData: ReportJob, sections: any): Promise<string> {
    const templatePath = jobData.requirements.template || 
      path.join(__dirname, '../templates/report.hbs');
    
    let template: string;
    
    if (await fs.pathExists(templatePath)) {
      template = await fs.readFile(templatePath, 'utf-8');
    } else {
      template = this.getDefaultHTMLTemplate();
    }
    
    const compiledTemplate = Handlebars.compile(template);
    
    const context = {
      project: jobData.project,
      userStory: jobData.userStory,
      sections,
      generatedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
      version: jobData.project.version
    };
    
    return compiledTemplate(context);
  }

  private async generatePDFReport(jobData: ReportJob, sections: any): Promise<string> {
    // First generate HTML content
    const htmlContent = await this.generateHTMLReport(jobData, sections);
    
    // Convert HTML to PDF (simplified implementation)
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Add title
    page.drawText(`${jobData.project.name} - Report`, {
      x: 50,
      y: 750,
      size: 24,
      font,
      color: rgb(0, 0, 0)
    });
    
    // Add summary (simplified)
    const summaryText = `Generated: ${moment().format('YYYY-MM-DD HH:mm:ss')}\n` +
                       `Components: ${sections.summary?.totalComponents || 0}\n` +
                       `Overall Score: ${sections.summary?.overallScore || 0}/100`;
    
    page.drawText(summaryText, {
      x: 50,
      y: 700,
      size: 12,
      font,
      color: rgb(0, 0, 0)
    });
    
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
  }

  private async generateMarkdownReport(jobData: ReportJob, sections: any): Promise<string> {
    let markdown = `# ${jobData.project.name} - Frontend Report\n\n`;
    
    markdown += `**Generated:** ${moment().format('YYYY-MM-DD HH:mm:ss')}\n`;
    markdown += `**Version:** ${jobData.project.version}\n`;
    markdown += `**Framework:** ${jobData.project.framework}\n\n`;
    
    // Summary section
    if (sections.summary) {
      markdown += `## Summary\n\n`;
      markdown += `- **Total Components:** ${sections.summary.totalComponents}\n`;
      markdown += `- **Total Lines:** ${sections.summary.totalLines}\n`;
      markdown += `- **Overall Score:** ${sections.summary.overallScore}/100\n\n`;
      
      if (sections.summary.recommendations?.length > 0) {
        markdown += `### Recommendations\n\n`;
        sections.summary.recommendations.forEach((rec: string) => {
          markdown += `- ${rec}\n`;
        });
        markdown += '\n';
      }
    }
    
    // Metrics section
    if (sections.metrics) {
      markdown += `## Component Metrics\n\n`;
      markdown += this.generateMetricsMarkdown(sections.metrics);
    }
    
    // Performance section
    if (sections.performance) {
      markdown += `## Performance\n\n`;
      markdown += this.generatePerformanceMarkdown(sections.performance);
    }
    
    // Add other sections as needed
    
    return markdown;
  }

  private generateMetricsMarkdown(metrics: ComponentMetrics): string {
    let markdown = '';
    
    if (Object.keys(metrics.complexity).length > 0) {
      markdown += `### Complexity Scores\n\n`;
      Object.entries(metrics.complexity).forEach(([component, score]) => {
        markdown += `- **${component}:** ${score}/100\n`;
      });
      markdown += '\n';
    }
    
    return markdown;
  }

  private generatePerformanceMarkdown(performance: PerformanceReport): string {
    let markdown = '';
    
    if (performance.lighthouse) {
      markdown += `### Lighthouse Scores\n\n`;
      markdown += `- **Performance:** ${performance.lighthouse.performance}/100\n`;
      markdown += `- **Accessibility:** ${performance.lighthouse.accessibility}/100\n`;
      markdown += `- **Best Practices:** ${performance.lighthouse.bestPractices}/100\n`;
      markdown += `- **SEO:** ${performance.lighthouse.seo}/100\n\n`;
    }
    
    return markdown;
  }

  // Helper methods for calculations and analysis
  private calculateComplexity(code: string): number {
    // Simplified complexity calculation
    const lines = code.split('\n').length;
    const functions = (code.match(/function|=>/g) || []).length;
    const conditions = (code.match(/if|else|switch|case|\?|&&|\|\|/g) || []).length;
    const loops = (code.match(/for|while|forEach|map|filter|reduce/g) || []).length;
    
    const complexity = Math.min(100, Math.max(0, 100 - (functions * 2 + conditions * 3 + loops * 2 + lines * 0.1)));
    return Math.round(complexity);
  }

  private calculateMaintainability(code: string): number {
    // Simplified maintainability calculation
    const lines = code.split('\n').length;
    const comments = (code.match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) || []).length;
    const functions = (code.match(/function|=>/g) || []).length;
    
    const commentRatio = comments / Math.max(1, lines) * 100;
    const functionSize = lines / Math.max(1, functions);
    
    const maintainability = Math.min(100, commentRatio * 0.3 + (100 - Math.min(50, functionSize)) * 0.7);
    return Math.round(maintainability);
  }

  private calculateReusability(code: string): number {
    // Simplified reusability calculation
    const props = (code.match(/props\.|\{[^}]*\}/g) || []).length;
    const hardcoded = (code.match(/"[^"]*"|'[^']*'/g) || []).length;
    const exports = (code.match(/export/g) || []).length;
    
    const reusability = Math.min(100, props * 10 + exports * 20 - hardcoded * 2);
    return Math.max(0, Math.round(reusability));
  }

  private calculatePerformanceMetrics(code: string): number {
    // Simplified performance calculation
    const heavyOperations = (code.match(/map|filter|reduce|forEach|find/g) || []).length;
    const domQueries = (code.match(/querySelector|getElementById|getElementsBy/g) || []).length;
    const asyncOps = (code.match(/async|await|Promise|fetch/g) || []).length;
    
    const performance = Math.min(100, 100 - heavyOperations * 5 - domQueries * 3 - asyncOps * 2);
    return Math.max(0, Math.round(performance));
  }

  private calculateQualityScore(code: string): number {
    const complexity = this.calculateComplexity(code);
    const maintainability = this.calculateMaintainability(code);
    const reusability = this.calculateReusability(code);
    const performance = this.calculatePerformanceMetrics(code);
    
    return Math.round((complexity + maintainability + reusability + performance) / 4);
  }

  private calculateOverallScore(components: any[]): number {
    if (components.length === 0) return 0;
    
    const totalScore = components.reduce((sum, comp) => {
      return sum + this.calculateQualityScore(comp.code || '');
    }, 0);
    
    return Math.round(totalScore / components.length);
  }

  private generateTrends(): any {
    // Mock trend data
    const dates = [];
    const complexityTrend = [];
    const qualityTrend = [];
    
    for (let i = 30; i >= 0; i--) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      dates.push(date);
      complexityTrend.push({ date, value: Math.random() * 100 });
      qualityTrend.push({ date, value: Math.random() * 100 });
    }
    
    return {
      complexity: complexityTrend,
      quality: qualityTrend
    };
  }

  private async generateRecommendations(context: any): Promise<string[]> {
    try {
      const prompt = `Based on the project analysis, generate 5 specific recommendations for improving the frontend codebase:\n\n` +
                    `Project: ${context.project.name}\n` +
                    `Framework: ${context.project.framework}\n` +
                    `Components: ${context.metrics.totalComponents}\n` +
                    `Overall Score: ${context.metrics.overallScore}/100\n\n` +
                    `Provide actionable recommendations in a JSON array format.`;
      
      const response = await this.llmOrchestrator.generateFromTemplate('fe-report', {
        prompt,
        context
      });
      
      // Try to parse as JSON, fallback to simple split
      try {
        return JSON.parse(response);
      } catch {
        return response.split('\n').filter(line => line.trim().length > 0).slice(0, 5);
      }
    } catch (error) {
      this.logger.warn('Failed to generate LLM recommendations', { error: error.message });
      return this.getDefaultRecommendations();
    }
  }

  private getDefaultRecommendations(): string[] {
    return [
      'Improve component documentation and add PropTypes or TypeScript interfaces',
      'Reduce component complexity by breaking down large components',
      'Add comprehensive unit tests to increase code coverage',
      'Optimize bundle size by implementing code splitting and lazy loading',
      'Enhance accessibility by adding proper ARIA labels and semantic HTML'
    ];
  }

  private extractHighlights(components: any[]): string[] {
    const highlights: string[] = [];
    
    // Find components with high quality scores
    const highQualityComponents = components.filter(comp => 
      this.calculateQualityScore(comp.code || '') > 80
    );
    
    if (highQualityComponents.length > 0) {
      highlights.push(`${highQualityComponents.length} components have excellent quality scores`);
    }
    
    // Check for good test coverage
    const testedComponents = components.filter(comp => comp.tests);
    if (testedComponents.length > components.length * 0.8) {
      highlights.push('High test coverage across components');
    }
    
    // Check for documentation
    const documentedComponents = components.filter(comp => comp.documentation);
    if (documentedComponents.length > components.length * 0.7) {
      highlights.push('Good documentation coverage');
    }
    
    return highlights;
  }

  private identifyIssues(components: any[]): Array<any> {
    const issues: Array<any> = [];
    
    components.forEach(comp => {
      const complexity = this.calculateComplexity(comp.code || '');
      
      if (complexity < 30) {
        issues.push({
          severity: 'high' as const,
          category: 'complexity',
          description: 'Component has high complexity and should be refactored',
          component: comp.name
        });
      }
      
      if (!comp.tests) {
        issues.push({
          severity: 'medium' as const,
          category: 'testing',
          description: 'Component lacks test coverage',
          component: comp.name
        });
      }
      
      if (!comp.documentation) {
        issues.push({
          severity: 'low' as const,
          category: 'documentation',
          description: 'Component lacks documentation',
          component: comp.name
        });
      }
    });
    
    return issues;
  }

  // Additional helper methods would be implemented here...
  // (runLighthouseAudit, analyzeComponentAccessibility, etc.)
  
  private setupHandlebarsHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: string) => {
      return moment(date).format('YYYY-MM-DD HH:mm:ss');
    });
    
    Handlebars.registerHelper('percentage', (value: number) => {
      return `${Math.round(value)}%`;
    });
    
    Handlebars.registerHelper('scoreColor', (score: number) => {
      if (score >= 80) return 'success';
      if (score >= 60) return 'warning';
      return 'danger';
    });
  }

  private getDefaultHTMLTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{project.name}} - Frontend Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e9ecef; border-radius: 5px; }
        .score { font-size: 24px; font-weight: bold; }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .danger { color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{project.name}} - Frontend Report</h1>
        <p>Generated: {{formatDate generatedAt}}</p>
        <p>Version: {{project.version}}</p>
    </div>
    
    {{#if sections.summary}}
    <div class="section">
        <h2>Summary</h2>
        <div class="metric">
            <div>Total Components</div>
            <div class="score">{{sections.summary.totalComponents}}</div>
        </div>
        <div class="metric">
            <div>Overall Score</div>
            <div class="score {{scoreColor sections.summary.overallScore}}">{{sections.summary.overallScore}}/100</div>
        </div>
    </div>
    {{/if}}
    
    <!-- Additional sections would be rendered here -->
</body>
</html>
    `;
  }

  private async writeReport(jobData: ReportJob, content: string): Promise<string> {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const filename = `${jobData.project.name}_report_${timestamp}.${jobData.requirements.format}`;
    const reportPath = path.join(jobData.project.rootPath, 'reports', filename);
    
    await fs.ensureDir(path.dirname(reportPath));
    
    if (jobData.requirements.format === 'pdf') {
      // Content is base64 for PDF
      await fs.writeFile(reportPath, content, 'base64');
    } else {
      await fs.writeFile(reportPath, content, 'utf-8');
    }
    
    return reportPath;
  }

  private async generateAssets(jobData: ReportJob, sections: any): Promise<any> {
    const assets = {
      charts: [],
      screenshots: [],
      files: []
    };
    
    // Generate charts, screenshots, etc.
    // Implementation would depend on specific requirements
    
    return assets;
  }

  private calculateMetadata(jobData: ReportJob, content: string): any {
    return {
      generatedAt: new Date().toISOString(),
      version: jobData.project.version,
      totalComponents: jobData.components.length,
      reportSize: Buffer.byteLength(content, 'utf8')
    };
  }

  private async finalizeReport(jobData: ReportJob, sections: any, type: string): Promise<ReportResult> {
    const reportContent = await this.generateReportContent(jobData, sections);
    const reportPath = await this.writeReport(jobData, reportContent);
    const assets = await this.generateAssets(jobData, sections);
    const metadata = this.calculateMetadata(jobData, reportContent);
    
    return {
      success: true,
      reportPath,
      reportContent,
      format: jobData.requirements.format,
      sections,
      assets,
      metadata
    };
  }

  // Placeholder implementations for complex analysis methods
  private async runLighthouseAudit(buildPath: string): Promise<any> {
    // Simplified lighthouse audit
    return {
      performance: Math.floor(Math.random() * 40) + 60,
      accessibility: Math.floor(Math.random() * 30) + 70,
      bestPractices: Math.floor(Math.random() * 20) + 80,
      seo: Math.floor(Math.random() * 30) + 70,
      pwa: Math.floor(Math.random() * 50) + 50
    };
  }

  private estimateLoadTimes(bundleSize: any): any {
    return {
      firstContentfulPaint: bundleSize.total * 0.01,
      largestContentfulPaint: bundleSize.total * 0.02,
      firstInputDelay: Math.random() * 100,
      cumulativeLayoutShift: Math.random() * 0.1
    };
  }

  private generatePerformanceRecommendations(performance: PerformanceReport): string[] {
    const recommendations: string[] = [];
    
    if (performance.lighthouse.performance < 70) {
      recommendations.push('Optimize images and implement lazy loading');
    }
    
    if (performance.bundleSize.total > 1000000) { // 1MB
      recommendations.push('Implement code splitting to reduce bundle size');
    }
    
    return recommendations;
  }

  // Additional placeholder methods...
  private async analyzeComponentAccessibility(code: string): Promise<any> {
    return { violations: [], passes: [] };
  }

  private calculateAccessibilityScore(violations: any[], passes: any[]): number {
    const total = violations.length + passes.length;
    return total > 0 ? Math.round((passes.length / total) * 100) : 100;
  }

  private determineWCAGLevel(violations: any[]): 'A' | 'AA' | 'AAA' {
    if (violations.length === 0) return 'AAA';
    if (violations.length < 5) return 'AA';
    return 'A';
  }

  private generateAccessibilityRecommendations(violations: any[]): string[] {
    return ['Add alt text to images', 'Improve color contrast', 'Add ARIA labels'];
  }

  private async analyzeDependencySecurity(project: any): Promise<any> {
    return {
      total: Object.keys(project.dependencies || {}).length,
      outdated: 0,
      vulnerable: 0,
      recommendations: []
    };
  }

  private analyzeComponentSecurity(code: string): any {
    return {
      vulnerabilities: [],
      xssRisks: 0,
      sqlInjectionRisks: 0,
      authenticationIssues: 0,
      dataExposureRisks: 0
    };
  }

  private analyzeComponentTestCoverage(code: string, tests: string): any {
    return {
      lines: Math.floor(Math.random() * 40) + 60,
      functions: Math.floor(Math.random() * 40) + 60,
      branches: Math.floor(Math.random() * 40) + 60,
      statements: Math.floor(Math.random() * 40) + 60
    };
  }

  private findUncoveredLines(components: any[]): any[] {
    return [];
  }

  private generateTestCoverageRecommendations(testCoverage: TestCoverageReport): string[] {
    return ['Add unit tests for uncovered functions', 'Improve branch coverage'];
  }

  private estimateBundleSize(components: any[]): number {
    return components.reduce((sum, comp) => sum + (comp.code?.length || 0), 0);
  }

  private analyzeModules(components: any[]): any[] {
    return components.map(comp => ({
      name: comp.name,
      size: comp.code?.length || 0,
      gzippedSize: Math.round((comp.code?.length || 0) * 0.3),
      percentage: 0
    }));
  }

  private findDuplicateModules(components: any[]): any[] {
    return [];
  }

  private analyzeTreeShaking(components: any[]): any {
    return {
      unusedExports: [],
      potentialSavings: 0
    };
  }

  private generateBundleRecommendations(bundleAnalysis: BundleAnalysisReport): string[] {
    return ['Implement tree shaking', 'Remove unused dependencies'];
  }

  private analyzeComponentDocumentation(component: any): any {
    return {
      hasDocumentation: !!component.documentation,
      documentedFunctions: 0,
      documentedInterfaces: 0,
      missing: []
    };
  }

  private calculateOverallDocCoverage(coverage: any): number {
    return (coverage.components + coverage.functions + coverage.interfaces) / 3;
  }

  private analyzeDocumentationQuality(components: any[]): any {
    return {
      completeness: Math.floor(Math.random() * 40) + 60,
      clarity: Math.floor(Math.random() * 40) + 60,
      examples: Math.floor(Math.random() * 40) + 60,
      upToDate: Math.floor(Math.random() * 40) + 60
    };
  }

  private generateDocumentationRecommendations(documentation: DocumentationReport): string[] {
    return ['Add JSDoc comments to functions', 'Create component usage examples'];
  }

  private generateMetricsSummary(metrics: ComponentMetrics): ReportSummary {
    const avgComplexity = Object.values(metrics.complexity).reduce((a, b) => a + b, 0) / Object.keys(metrics.complexity).length;
    
    return {
      projectName: 'Project',
      totalComponents: Object.keys(metrics.complexity).length,
      totalLines: 0,
      overallScore: Math.round(avgComplexity),
      recommendations: this.getDefaultRecommendations(),
      highlights: [],
      issues: []
    };
  }

  private generatePerformanceSummary(performance: PerformanceReport): ReportSummary {
    return {
      projectName: 'Project',
      totalComponents: 0,
      totalLines: 0,
      overallScore: performance.lighthouse.performance,
      recommendations: performance.recommendations,
      highlights: [],
      issues: []
    };
  }
}