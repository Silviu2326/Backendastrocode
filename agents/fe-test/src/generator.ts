import { ContextualLogger } from '../../../shared/utils/logger';
import { LLMOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { FileWriter } from '../../../shared/utils/fileWriter';
import { config } from '../../../shared/config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestGenerationJob {
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
    props?: Record<string, any>;
    dependencies?: string[];
  };
  project: {
    framework: string;
    testingFramework: 'jest' | 'vitest' | 'playwright';
    testingLibrary: 'react-testing-library' | 'enzyme';
    e2eFramework: 'playwright' | 'cypress' | 'puppeteer';
    mockingStrategy: 'msw' | 'jest-mocks' | 'manual';
  };
  requirements: {
    unitTests: boolean;
    integrationTests: boolean;
    e2eTests: boolean;
    accessibilityTests: boolean;
    visualRegressionTests: boolean;
    performanceTests: boolean;
    coverageThreshold: number;
  };
}

interface TestGenerationResult {
  success: boolean;
  testFiles: {
    unitTest?: string;
    integrationTest?: string;
    e2eTest?: string;
    accessibilityTest?: string;
    visualTest?: string;
    performanceTest?: string;
  };
  generatedTests: {
    unitTestCode?: string;
    integrationTestCode?: string;
    e2eTestCode?: string;
    accessibilityTestCode?: string;
    visualTestCode?: string;
    performanceTestCode?: string;
  };
  testConfiguration: {
    jestConfig?: string;
    playwrightConfig?: string;
    setupFiles?: string[];
    mockFiles?: string[];
  };
  coverage: {
    expectedCoverage: number;
    testCases: number;
    assertions: number;
  };
  documentation: string;
  metrics: {
    testsGenerated: number;
    linesOfTestCode: number;
    testComplexity: number;
    estimatedRunTime: number;
  };
}

export class FeTestGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private fileWriter: FileWriter;

  constructor() {
    this.logger = new ContextualLogger('fe-test-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.fileWriter = new FileWriter();
  }

  async generateTests(jobData: TestGenerationJob): Promise<TestGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting test generation', {
      component: jobData.component.name,
      testingFramework: jobData.project.testingFramework,
      requirements: jobData.requirements
    });

    try {
      // Analyze component for test generation
      let componentAnalysis = null;
      if (jobData.component.existingCode) {
        componentAnalysis = await this.analyzeComponentForTesting(jobData.component.existingCode);
        logger.info('Analyzed component for testing', { analysis: componentAnalysis });
      }

      const testFiles: any = {};
      const generatedTests: any = {};
      const testConfiguration: any = {};

      // Generate unit tests
      if (jobData.requirements.unitTests) {
        const unitTestResult = await this.generateUnitTests(jobData, componentAnalysis);
        testFiles.unitTest = unitTestResult.filePath;
        generatedTests.unitTestCode = unitTestResult.code;
      }

      // Generate integration tests
      if (jobData.requirements.integrationTests) {
        const integrationTestResult = await this.generateIntegrationTests(jobData, componentAnalysis);
        testFiles.integrationTest = integrationTestResult.filePath;
        generatedTests.integrationTestCode = integrationTestResult.code;
      }

      // Generate e2e tests
      if (jobData.requirements.e2eTests) {
        const e2eTestResult = await this.generateE2ETests(jobData, componentAnalysis);
        testFiles.e2eTest = e2eTestResult.filePath;
        generatedTests.e2eTestCode = e2eTestResult.code;
      }

      // Generate accessibility tests
      if (jobData.requirements.accessibilityTests) {
        const a11yTestResult = await this.generateAccessibilityTests(jobData, componentAnalysis);
        testFiles.accessibilityTest = a11yTestResult.filePath;
        generatedTests.accessibilityTestCode = a11yTestResult.code;
      }

      // Generate visual regression tests
      if (jobData.requirements.visualRegressionTests) {
        const visualTestResult = await this.generateVisualTests(jobData, componentAnalysis);
        testFiles.visualTest = visualTestResult.filePath;
        generatedTests.visualTestCode = visualTestResult.code;
      }

      // Generate performance tests
      if (jobData.requirements.performanceTests) {
        const perfTestResult = await this.generatePerformanceTests(jobData, componentAnalysis);
        testFiles.performanceTest = perfTestResult.filePath;
        generatedTests.performanceTestCode = perfTestResult.code;
      }

      // Generate test configuration
      testConfiguration.jestConfig = await this.generateJestConfig(jobData);
      testConfiguration.playwrightConfig = await this.generatePlaywrightConfig(jobData);
      testConfiguration.setupFiles = await this.generateSetupFiles(jobData);
      testConfiguration.mockFiles = await this.generateMockFiles(jobData, componentAnalysis);

      // Calculate coverage and metrics
      const coverage = this.calculateExpectedCoverage(jobData, componentAnalysis);
      const metrics = this.calculateTestMetrics(generatedTests, componentAnalysis);

      // Generate documentation
      const documentation = this.generateTestDocumentation(jobData, testFiles, coverage);

      logger.info('Test generation completed successfully', {
        testsGenerated: metrics.testsGenerated,
        expectedCoverage: coverage.expectedCoverage
      });

      return {
        success: true,
        testFiles,
        generatedTests,
        testConfiguration,
        coverage,
        documentation,
        metrics
      };
    } catch (error) {
      logger.error('Test generation failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async updateExistingTests(jobData: TestGenerationJob, existingTestPaths: string[]): Promise<TestGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'update'
    });

    logger.info('Updating existing tests');

    try {
      // Analyze existing tests
      const existingTests = await this.analyzeExistingTests(existingTestPaths);
      
      // Identify gaps and improvements
      const testGaps = this.identifyTestGaps(existingTests, jobData.requirements);
      
      // Generate updated tests
      const context = {
        ...this.prepareLLMContext(jobData, null),
        existingTests,
        testGaps,
        mode: 'update'
      };

      return await this.processTestGeneration(jobData, context, 'updated');
    } catch (error) {
      logger.error('Test update failed', { error: error.message });
      throw error;
    }
  }

  async generateTestSuite(jobData: TestGenerationJob): Promise<TestGenerationResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'suite'
    });

    logger.info('Generating complete test suite');

    try {
      // Generate comprehensive test suite
      const context = {
        ...this.prepareLLMContext(jobData, null),
        mode: 'comprehensive',
        includeAllTypes: true
      };

      return await this.processTestGeneration(jobData, context, 'suite');
    } catch (error) {
      logger.error('Test suite generation failed', { error: error.message });
      throw error;
    }
  }

  private async analyzeComponentForTesting(componentCode: string): Promise<any> {
    return {
      functions: this.extractFunctions(componentCode),
      hooks: this.extractHooks(componentCode),
      props: this.extractProps(componentCode),
      state: this.extractState(componentCode),
      events: this.extractEvents(componentCode),
      dependencies: this.extractDependencies(componentCode),
      complexity: this.calculateComponentComplexity(componentCode),
      testableUnits: this.identifyTestableUnits(componentCode)
    };
  }

  private async generateUnitTests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'unit',
      focus: ['functions', 'hooks', 'props', 'state']
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-unit', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'unit');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private async generateIntegrationTests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'integration',
      focus: ['component interactions', 'data flow', 'side effects']
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-integration', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'integration');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private async generateE2ETests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'e2e',
      focus: ['user workflows', 'acceptance criteria', 'full scenarios'],
      framework: jobData.project.e2eFramework
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-e2e', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'e2e');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private async generateAccessibilityTests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'accessibility',
      focus: ['WCAG compliance', 'keyboard navigation', 'screen readers', 'color contrast']
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-a11y', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'a11y');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private async generateVisualTests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'visual',
      focus: ['visual regression', 'responsive design', 'cross-browser']
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-visual', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'visual');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private async generatePerformanceTests(jobData: TestGenerationJob, analysis: any): Promise<{filePath: string, code: string}> {
    const context = {
      ...this.prepareLLMContext(jobData, analysis),
      testType: 'performance',
      focus: ['render performance', 'memory usage', 'load times']
    };

    const testCode = await this.llmOrchestrator.generateFromTemplate('fe-test-performance', context);
    const filePath = this.getTestFilePath(jobData.component.path, 'performance');
    
    await this.fileWriter.writeFile(filePath, testCode);
    return { filePath, code: testCode };
  }

  private extractFunctions(componentCode: string): string[] {
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>|const\s+(\w+)\s*=\s*(?:async\s+)?function)/g;
    const functions: string[] = [];
    let match;
    
    while ((match = functionRegex.exec(componentCode)) !== null) {
      functions.push(match[1] || match[2] || match[3]);
    }
    
    return functions;
  }

  private extractHooks(componentCode: string): string[] {
    const hookRegex = /use\w+\(/g;
    const matches = componentCode.match(hookRegex) || [];
    return [...new Set(matches.map(match => match.replace('(', '')))];
  }

  private extractProps(componentCode: string): string[] {
    const propsRegex = /(?:interface|type)\s+\w*Props\s*{([^}]*)}/g;
    const match = propsRegex.exec(componentCode);
    
    if (match) {
      const propsContent = match[1];
      const propNames = propsContent.match(/\w+(?=\s*[?:])/g) || [];
      return propNames;
    }
    
    return [];
  }

  private extractState(componentCode: string): string[] {
    const stateRegex = /const\s*\[([^,]+),\s*set\w+\]\s*=\s*useState/g;
    const stateVars: string[] = [];
    let match;
    
    while ((match = stateRegex.exec(componentCode)) !== null) {
      stateVars.push(match[1].trim());
    }
    
    return stateVars;
  }

  private extractEvents(componentCode: string): string[] {
    const eventRegex = /on\w+\s*=/g;
    const matches = componentCode.match(eventRegex) || [];
    return [...new Set(matches.map(match => match.replace('=', '').trim()))];
  }

  private extractDependencies(componentCode: string): string[] {
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const dependencies: string[] = [];
    let match;
    
    while ((match = importRegex.exec(componentCode)) !== null) {
      dependencies.push(match[1]);
    }
    
    return dependencies;
  }

  private calculateComponentComplexity(componentCode: string): number {
    const functions = this.extractFunctions(componentCode).length;
    const hooks = this.extractHooks(componentCode).length;
    const conditionals = (componentCode.match(/if\s*\(|\?\s*:|&&|\|\|/g) || []).length;
    const loops = (componentCode.match(/for\s*\(|while\s*\(|\.map\(|\.forEach\(/g) || []).length;
    
    return functions + hooks + conditionals + loops;
  }

  private identifyTestableUnits(componentCode: string): string[] {
    const units: string[] = [];
    
    // Add functions as testable units
    units.push(...this.extractFunctions(componentCode));
    
    // Add event handlers
    units.push(...this.extractEvents(componentCode));
    
    // Add conditional rendering logic
    if (componentCode.includes('?') || componentCode.includes('&&')) {
      units.push('conditional rendering');
    }
    
    // Add form handling
    if (componentCode.includes('onSubmit') || componentCode.includes('onChange')) {
      units.push('form handling');
    }
    
    return units;
  }

  private getTestFilePath(componentPath: string, testType: string): string {
    const dir = path.dirname(componentPath);
    const name = path.basename(componentPath, path.extname(componentPath));
    const extension = testType === 'e2e' ? '.e2e.ts' : '.test.tsx';
    
    return path.join(dir, `${name}.${testType}${extension}`);
  }

  private async generateJestConfig(jobData: TestGenerationJob): string {
    const config = {
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
      moduleNameMapping: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
      },
      collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/index.tsx'
      ],
      coverageThreshold: {
        global: {
          branches: jobData.requirements.coverageThreshold,
          functions: jobData.requirements.coverageThreshold,
          lines: jobData.requirements.coverageThreshold,
          statements: jobData.requirements.coverageThreshold
        }
      }
    };
    
    return JSON.stringify(config, null, 2);
  }

  private async generatePlaywrightConfig(jobData: TestGenerationJob): string {
    const config = {
      testDir: './tests/e2e',
      fullyParallel: true,
      forbidOnly: !!process.env.CI,
      retries: process.env.CI ? 2 : 0,
      workers: process.env.CI ? 1 : undefined,
      reporter: 'html',
      use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry'
      },
      projects: [
        {
          name: 'chromium',
          use: { ...require('@playwright/test').devices['Desktop Chrome'] }
        },
        {
          name: 'firefox',
          use: { ...require('@playwright/test').devices['Desktop Firefox'] }
        },
        {
          name: 'webkit',
          use: { ...require('@playwright/test').devices['Desktop Safari'] }
        }
      ]
    };
    
    return JSON.stringify(config, null, 2);
  }

  private async generateSetupFiles(jobData: TestGenerationJob): Promise<string[]> {
    const setupFiles: string[] = [];
    
    // Jest setup
    const jestSetup = `
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

configure({ testIdAttribute: 'data-testid' });

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() { return null; }
  disconnect() { return null; }
  unobserve() { return null; }
};
`;
    
    const setupPath = 'src/setupTests.ts';
    await this.fileWriter.writeFile(setupPath, jestSetup);
    setupFiles.push(setupPath);
    
    return setupFiles;
  }

  private async generateMockFiles(jobData: TestGenerationJob, analysis: any): Promise<string[]> {
    const mockFiles: string[] = [];
    
    if (analysis?.dependencies) {
      for (const dep of analysis.dependencies) {
        if (dep.startsWith('./') || dep.startsWith('../')) {
          // Generate mock for local dependencies
          const mockContent = `export default jest.fn();\nexport const mockFunction = jest.fn();`;
          const mockPath = `src/__mocks__/${dep.replace(/[./]/g, '_')}.ts`;
          await this.fileWriter.writeFile(mockPath, mockContent);
          mockFiles.push(mockPath);
        }
      }
    }
    
    return mockFiles;
  }

  private calculateExpectedCoverage(jobData: TestGenerationJob, analysis: any): any {
    const baseTestCases = analysis?.testableUnits?.length || 5;
    const complexityMultiplier = Math.min(analysis?.complexity || 1, 3);
    const testCases = baseTestCases * complexityMultiplier;
    
    return {
      expectedCoverage: jobData.requirements.coverageThreshold,
      testCases,
      assertions: testCases * 2 // Estimate 2 assertions per test case
    };
  }

  private calculateTestMetrics(generatedTests: any, analysis: any): any {
    const testsGenerated = Object.keys(generatedTests).length;
    const totalLines = Object.values(generatedTests)
      .reduce((total: number, code: any) => total + (code?.split('\n').length || 0), 0);
    
    return {
      testsGenerated,
      linesOfTestCode: totalLines,
      testComplexity: analysis?.complexity || 1,
      estimatedRunTime: testsGenerated * 2 // Estimate 2 seconds per test file
    };
  }

  private prepareLLMContext(jobData: TestGenerationJob, analysis: any): any {
    return {
      userStory: jobData.userStory,
      component: jobData.component,
      project: jobData.project,
      requirements: jobData.requirements,
      analysis,
      testingBestPractices: this.getTestingBestPractices(),
      testPatterns: this.getTestPatterns(jobData.project.testingFramework)
    };
  }

  private getTestingBestPractices(): string[] {
    return [
      'Test behavior, not implementation',
      'Use descriptive test names',
      'Follow AAA pattern (Arrange, Act, Assert)',
      'Keep tests independent and isolated',
      'Use data-testid for reliable element selection',
      'Mock external dependencies',
      'Test edge cases and error conditions',
      'Maintain good test coverage',
      'Write tests that are easy to understand and maintain'
    ];
  }

  private getTestPatterns(framework: string): any {
    const patterns = {
      jest: {
        describe: 'describe("Component", () => {})',
        test: 'test("should do something", () => {})',
        mock: 'jest.fn()',
        assertion: 'expect(result).toBe(expected)'
      },
      vitest: {
        describe: 'describe("Component", () => {})',
        test: 'test("should do something", () => {})',
        mock: 'vi.fn()',
        assertion: 'expect(result).toBe(expected)'
      },
      playwright: {
        test: 'test("should do something", async ({ page }) => {})',
        assertion: 'await expect(page.locator("selector")).toBeVisible()'
      }
    };
    
    return patterns[framework] || patterns.jest;
  }

  private generateTestDocumentation(jobData: TestGenerationJob, testFiles: any, coverage: any): string {
    return `# Test Documentation for ${jobData.component.name}\n\n` +
           `## Generated for User Story: ${jobData.userStory.title}\n\n` +
           `### Test Files Generated\n` +
           Object.entries(testFiles)
             .map(([type, path]) => `- ${type}: ${path}`)
             .join('\n') +
           `\n\n### Coverage Goals\n` +
           `- Target Coverage: ${coverage.expectedCoverage}%\n` +
           `- Test Cases: ${coverage.testCases}\n` +
           `- Assertions: ${coverage.assertions}\n\n` +
           `### Running Tests\n` +
           `\`\`\`bash\n` +
           `npm test                    # Run all tests\n` +
           `npm run test:watch         # Run tests in watch mode\n` +
           `npm run test:coverage      # Run tests with coverage\n` +
           `npm run test:e2e           # Run e2e tests\n` +
           `\`\`\`\n`;
  }

  private async analyzeExistingTests(testPaths: string[]): Promise<any> {
    const existingTests = [];
    
    for (const testPath of testPaths) {
      try {
        const content = await fs.readFile(testPath, 'utf-8');
        existingTests.push({
          path: testPath,
          content,
          testCases: this.extractTestCases(content),
          coverage: this.estimateTestCoverage(content)
        });
      } catch (error) {
        // File doesn't exist or can't be read
      }
    }
    
    return existingTests;
  }

  private extractTestCases(testContent: string): string[] {
    const testRegex = /(?:test|it)\s*\(['"]([^'"]+)['"]/g;
    const testCases: string[] = [];
    let match;
    
    while ((match = testRegex.exec(testContent)) !== null) {
      testCases.push(match[1]);
    }
    
    return testCases;
  }

  private estimateTestCoverage(testContent: string): number {
    const assertions = (testContent.match(/expect\(/g) || []).length;
    const testCases = (testContent.match(/(?:test|it)\s*\(/g) || []).length;
    
    // Simple heuristic: more assertions and test cases = higher coverage
    return Math.min(100, (assertions + testCases) * 10);
  }

  private identifyTestGaps(existingTests: any[], requirements: any): string[] {
    const gaps: string[] = [];
    
    if (requirements.unitTests && !existingTests.some(t => t.path.includes('.test.'))) {
      gaps.push('Missing unit tests');
    }
    
    if (requirements.e2eTests && !existingTests.some(t => t.path.includes('.e2e.'))) {
      gaps.push('Missing e2e tests');
    }
    
    if (requirements.accessibilityTests && !existingTests.some(t => t.content.includes('axe'))) {
      gaps.push('Missing accessibility tests');
    }
    
    return gaps;
  }

  private async processTestGeneration(
    jobData: TestGenerationJob,
    context: any,
    mode: string
  ): Promise<TestGenerationResult> {
    // This would be implemented similar to the main generateTests method
    // but with the specific context and mode
    return this.generateTests(jobData);
  }
}