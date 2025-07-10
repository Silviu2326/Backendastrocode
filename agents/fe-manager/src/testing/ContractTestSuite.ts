import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../../../shared/utils/logger';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { EventEmitter } from 'events';

export interface TestFixture {
  name: string;
  description: string;
  input: {
    stories: Array<{
      id: string;
      title: string;
      description: string;
      priority?: number;
      complexity?: number;
      tags?: string[];
      metadata?: any;
    }>;
    projectConfig?: any;
    userContext?: any;
  };
  expected: {
    queues: Array<{
      name: string;
      jobCount: number;
      jobs: Array<{
        name: string;
        priority?: number;
        delay?: number;
        data?: any;
      }>;
    }>;
    processing: {
      totalJobs: number;
      estimatedDuration: number;
      dependencies: Array<{
        from: string;
        to: string;
        type: 'blocks' | 'enhances' | 'requires';
      }>;
    };
    output: {
      components?: string[];
      files?: string[];
      metrics?: any;
    };
  };
  timeout: number;
  tags: string[];
}

export interface TestResult {
  fixture: string;
  passed: boolean;
  duration: number;
  errors: string[];
  warnings: string[];
  details: {
    queuesMatched: boolean;
    jobsMatched: boolean;
    prioritiesMatched: boolean;
    dependenciesMatched: boolean;
    outputMatched: boolean;
  };
  actualOutput: any;
  expectedOutput: any;
}

export interface ContractTestConfig {
  fixturesDir: string;
  redisConfig: {
    host: string;
    port: number;
    db: number;
  };
  timeouts: {
    default: number;
    long: number;
    short: number;
  };
  parallel: boolean;
  maxConcurrency: number;
  cleanup: boolean;
  reportFormat: 'json' | 'junit' | 'console';
  outputDir: string;
}

class ContractTestSuite extends EventEmitter {
  private config: ContractTestConfig;
  private redis: Redis;
  private fixtures: TestFixture[] = [];
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private testResults: TestResult[] = [];
  private isRunning = false;

  constructor(config: ContractTestConfig) {
    super();
    this.config = config;
    this.redis = new Redis({
      host: config.redisConfig.host,
      port: config.redisConfig.port,
      db: config.redisConfig.db,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100
    });
  }

  async initialize(): Promise<void> {
    try {
      // Load test fixtures
      await this.loadFixtures();
      
      // Setup test queues
      await this.setupTestQueues();
      
      // Setup mock workers
      await this.setupMockWorkers();
      
      logger.info('ContractTestSuite initialized', {
        fixturesCount: this.fixtures.length,
        queuesCount: this.queues.size
      });
    } catch (error) {
      logger.error('Error initializing ContractTestSuite', { error: error.message });
      throw error;
    }
  }

  private async loadFixtures(): Promise<void> {
    if (!fs.existsSync(this.config.fixturesDir)) {
      throw new Error(`Fixtures directory not found: ${this.config.fixturesDir}`);
    }

    const fixtureFiles = fs.readdirSync(this.config.fixturesDir)
      .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
      .sort();

    for (const file of fixtureFiles) {
      try {
        const filePath = path.join(this.config.fixturesDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const fixture = yaml.load(content) as TestFixture;
        
        // Validate fixture
        if (this.validateFixture(fixture)) {
          this.fixtures.push(fixture);
          logger.debug('Loaded test fixture', { name: fixture.name, file });
        } else {
          logger.warn('Invalid fixture format', { file });
        }
      } catch (error) {
        logger.error('Error loading fixture', { file, error: error.message });
      }
    }

    if (this.fixtures.length === 0) {
      throw new Error('No valid fixtures found');
    }
  }

  private validateFixture(fixture: any): fixture is TestFixture {
    return fixture &&
           typeof fixture.name === 'string' &&
           typeof fixture.description === 'string' &&
           fixture.input &&
           Array.isArray(fixture.input.stories) &&
           fixture.expected &&
           Array.isArray(fixture.expected.queues) &&
           typeof fixture.timeout === 'number';
  }

  private async setupTestQueues(): Promise<void> {
    const queueNames = [
      'fe-draft',
      'fe-logic', 
      'fe-style',
      'fe-a11y',
      'fe-test',
      'fe-typefix',
      'fe-report',
      'fe-i18n',
      'fe-security',
      'fe-optimization'
    ];

    for (const queueName of queueNames) {
      const queue = new Queue(`test-${queueName}`, {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 10
        }
      });
      
      this.queues.set(queueName, queue);
    }
  }

  private async setupMockWorkers(): Promise<void> {
    for (const [queueName, queue] of this.queues.entries()) {
      const worker = new Worker(
        queue.name,
        async (job: Job) => {
          // Mock job processing
          const processingTime = this.calculateMockProcessingTime(job);
          await this.delay(processingTime);
          
          return {
            jobId: job.id,
            queueName,
            processedAt: new Date(),
            mockResult: this.generateMockResult(job)
          };
        },
        {
          connection: this.redis,
          concurrency: 1
        }
      );
      
      this.workers.set(queueName, worker);
    }
  }

  private calculateMockProcessingTime(job: Job): number {
    const baseTime = 100; // 100ms base
    const complexity = job.data.complexity || 1;
    const randomFactor = Math.random() * 0.5 + 0.75; // 0.75 - 1.25
    
    return Math.floor(baseTime * complexity * randomFactor);
  }

  private generateMockResult(job: Job): any {
    const jobType = job.name;
    
    switch (jobType) {
      case 'generate-component':
        return {
          code: `// Mock component for ${job.data.storyId}\nexport const Component = () => <div>Mock</div>;`,
          imports: ['React'],
          exports: ['Component'],
          dependencies: []
        };
      
      case 'add-logic':
        return {
          hooks: ['useState', 'useEffect'],
          handlers: ['onClick', 'onChange'],
          state: ['isLoading', 'data']
        };
      
      case 'apply-styles':
        return {
          styles: '.component { color: blue; }',
          classes: ['component', 'active'],
          responsive: true
        };
      
      default:
        return {
          processed: true,
          timestamp: new Date(),
          jobType
        };
    }
  }

  async runTests(fixtureFilter?: string): Promise<TestResult[]> {
    if (this.isRunning) {
      throw new Error('Tests are already running');
    }

    this.isRunning = true;
    this.testResults = [];
    
    try {
      const fixturesToRun = fixtureFilter
        ? this.fixtures.filter(f => f.name.includes(fixtureFilter) || f.tags.includes(fixtureFilter))
        : this.fixtures;

      logger.info('Starting contract tests', {
        totalFixtures: fixturesToRun.length,
        parallel: this.config.parallel
      });

      if (this.config.parallel) {
        await this.runTestsParallel(fixturesToRun);
      } else {
        await this.runTestsSequential(fixturesToRun);
      }

      // Generate test report
      await this.generateTestReport();
      
      return this.testResults;
    } finally {
      this.isRunning = false;
    }
  }

  private async runTestsSequential(fixtures: TestFixture[]): Promise<void> {
    for (const fixture of fixtures) {
      await this.runSingleTest(fixture);
    }
  }

  private async runTestsParallel(fixtures: TestFixture[]): Promise<void> {
    const chunks = this.chunkArray(fixtures, this.config.maxConcurrency);
    
    for (const chunk of chunks) {
      const promises = chunk.map(fixture => this.runSingleTest(fixture));
      await Promise.all(promises);
    }
  }

  private async runSingleTest(fixture: TestFixture): Promise<void> {
    const startTime = Date.now();
    
    logger.info('Running test fixture', { name: fixture.name });
    this.emit('test:start', { fixture: fixture.name });
    
    try {
      // Clean up before test
      await this.cleanupQueues();
      
      // Execute test
      const result = await this.executeTest(fixture);
      
      // Record result
      this.testResults.push(result);
      
      this.emit('test:complete', { fixture: fixture.name, result });
      
      logger.info('Test fixture completed', {
        name: fixture.name,
        passed: result.passed,
        duration: result.duration
      });
    } catch (error) {
      const result: TestResult = {
        fixture: fixture.name,
        passed: false,
        duration: Date.now() - startTime,
        errors: [error.message],
        warnings: [],
        details: {
          queuesMatched: false,
          jobsMatched: false,
          prioritiesMatched: false,
          dependenciesMatched: false,
          outputMatched: false
        },
        actualOutput: null,
        expectedOutput: fixture.expected
      };
      
      this.testResults.push(result);
      this.emit('test:error', { fixture: fixture.name, error });
      
      logger.error('Test fixture failed', {
        name: fixture.name,
        error: error.message
      });
    }
  }

  private async executeTest(fixture: TestFixture): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Step 1: Feed stories to the system
    await this.feedStories(fixture.input.stories);
    
    // Step 2: Wait for processing
    await this.waitForProcessing(fixture.timeout);
    
    // Step 3: Collect actual results
    const actualOutput = await this.collectResults();
    
    // Step 4: Validate results
    const validation = await this.validateResults(fixture.expected, actualOutput);
    
    if (validation.errors.length > 0) {
      errors.push(...validation.errors);
    }
    
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings);
    }
    
    const duration = Date.now() - startTime;
    const passed = errors.length === 0;
    
    return {
      fixture: fixture.name,
      passed,
      duration,
      errors,
      warnings,
      details: validation.details,
      actualOutput,
      expectedOutput: fixture.expected
    };
  }

  private async feedStories(stories: any[]): Promise<void> {
    // Simulate feeding stories to fe-manager
    for (const story of stories) {
      const queue = this.queues.get('fe-draft');
      if (queue) {
        await queue.add('process-story', {
          storyId: story.id,
          title: story.title,
          description: story.description,
          priority: story.priority || 50,
          complexity: story.complexity || 5,
          tags: story.tags || [],
          metadata: story.metadata || {}
        }, {
          priority: story.priority || 50,
          delay: 0
        });
      }
    }
  }

  private async waitForProcessing(timeout: number): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const allEmpty = await this.areAllQueuesEmpty();
      if (allEmpty) {
        break;
      }
      await this.delay(100);
    }
  }

  private async areAllQueuesEmpty(): Promise<boolean> {
    for (const queue of this.queues.values()) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      
      if (waiting.length > 0 || active.length > 0) {
        return false;
      }
    }
    return true;
  }

  private async collectResults(): Promise<any> {
    const results: any = {
      queues: {},
      jobs: [],
      processing: {
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0
      }
    };
    
    for (const [queueName, queue] of this.queues.entries()) {
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      
      results.queues[queueName] = {
        completed: completed.length,
        failed: failed.length,
        jobs: completed.map(job => ({
          id: job.id,
          name: job.name,
          priority: job.opts.priority,
          data: job.data,
          result: job.returnvalue
        }))
      };
      
      results.processing.totalJobs += completed.length + failed.length;
      results.processing.completedJobs += completed.length;
      results.processing.failedJobs += failed.length;
    }
    
    return results;
  }

  private async validateResults(expected: any, actual: any): Promise<{
    errors: string[];
    warnings: string[];
    details: any;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const details = {
      queuesMatched: true,
      jobsMatched: true,
      prioritiesMatched: true,
      dependenciesMatched: true,
      outputMatched: true
    };
    
    // Validate queue expectations
    for (const expectedQueue of expected.queues) {
      const actualQueue = actual.queues[expectedQueue.name];
      
      if (!actualQueue) {
        errors.push(`Expected queue '${expectedQueue.name}' not found`);
        details.queuesMatched = false;
        continue;
      }
      
      if (actualQueue.completed !== expectedQueue.jobCount) {
        errors.push(
          `Queue '${expectedQueue.name}' job count mismatch: ` +
          `expected ${expectedQueue.jobCount}, got ${actualQueue.completed}`
        );
        details.jobsMatched = false;
      }
      
      // Validate individual jobs
      for (const expectedJob of expectedQueue.jobs) {
        const actualJob = actualQueue.jobs.find((j: any) => j.name === expectedJob.name);
        
        if (!actualJob) {
          errors.push(
            `Expected job '${expectedJob.name}' not found in queue '${expectedQueue.name}'`
          );
          details.jobsMatched = false;
        } else if (expectedJob.priority && actualJob.priority !== expectedJob.priority) {
          warnings.push(
            `Job '${expectedJob.name}' priority mismatch: ` +
            `expected ${expectedJob.priority}, got ${actualJob.priority}`
          );
          details.prioritiesMatched = false;
        }
      }
    }
    
    // Validate processing expectations
    if (expected.processing.totalJobs !== actual.processing.totalJobs) {
      errors.push(
        `Total jobs mismatch: expected ${expected.processing.totalJobs}, ` +
        `got ${actual.processing.totalJobs}`
      );
    }
    
    return { errors, warnings, details };
  }

  private async cleanupQueues(): Promise<void> {
    if (!this.config.cleanup) {
      return;
    }
    
    for (const queue of this.queues.values()) {
      await queue.obliterate({ force: true });
    }
  }

  private async generateTestReport(): Promise<void> {
    const report = {
      summary: {
        total: this.testResults.length,
        passed: this.testResults.filter(r => r.passed).length,
        failed: this.testResults.filter(r => !r.passed).length,
        duration: this.testResults.reduce((sum, r) => sum + r.duration, 0)
      },
      results: this.testResults
    };
    
    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    switch (this.config.reportFormat) {
      case 'json':
        const jsonPath = path.join(this.config.outputDir, `test-report-${timestamp}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
        break;
        
      case 'junit':
        const junitXml = this.generateJUnitXML(report);
        const xmlPath = path.join(this.config.outputDir, `test-report-${timestamp}.xml`);
        fs.writeFileSync(xmlPath, junitXml);
        break;
        
      case 'console':
      default:
        this.printConsoleReport(report);
        break;
    }
  }

  private generateJUnitXML(report: any): string {
    const testsuites = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<testsuites tests="${report.summary.total}" failures="${report.summary.failed}" time="${report.summary.duration / 1000}">`,
      '  <testsuite name="ContractTests">'
    ];
    
    for (const result of report.results) {
      const testcase = [
        `    <testcase name="${result.fixture}" time="${result.duration / 1000}">`
      ];
      
      if (!result.passed) {
        testcase.push('      <failure>');
        testcase.push(`        ${result.errors.join('\n        ')}`);
        testcase.push('      </failure>');
      }
      
      testcase.push('    </testcase>');
      testsuites.push(...testcase);
    }
    
    testsuites.push('  </testsuite>');
    testsuites.push('</testsuites>');
    
    return testsuites.join('\n');
  }

  private printConsoleReport(report: any): void {
    console.log('\n=== Contract Test Results ===');
    console.log(`Total: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Duration: ${report.summary.duration}ms`);
    console.log(`Success Rate: ${((report.summary.passed / report.summary.total) * 100).toFixed(1)}%`);
    
    if (report.summary.failed > 0) {
      console.log('\n=== Failed Tests ===');
      for (const result of report.results.filter((r: any) => !r.passed)) {
        console.log(`\n${result.fixture}:`);
        for (const error of result.errors) {
          console.log(`  ❌ ${error}`);
        }
      }
    }
    
    console.log('\n');
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    try {
      // Stop all workers
      for (const worker of this.workers.values()) {
        await worker.close();
      }
      
      // Close all queues
      for (const queue of this.queues.values()) {
        await queue.close();
      }
      
      // Disconnect Redis
      await this.redis.disconnect();
      
      logger.info('ContractTestSuite cleanup completed');
    } catch (error) {
      logger.error('Error during ContractTestSuite cleanup', { error: error.message });
    }
  }

  // Utility methods for creating test fixtures
  static createFixture(name: string, stories: any[], expectedQueues: any[]): TestFixture {
    return {
      name,
      description: `Test fixture: ${name}`,
      input: {
        stories
      },
      expected: {
        queues: expectedQueues,
        processing: {
          totalJobs: expectedQueues.reduce((sum, q) => sum + q.jobCount, 0),
          estimatedDuration: 5000,
          dependencies: []
        },
        output: {
          components: [],
          files: [],
          metrics: {}
        }
      },
      timeout: 10000,
      tags: ['generated']
    };
  }
}

// Default configuration
export const defaultContractTestConfig: ContractTestConfig = {
  fixturesDir: path.join(process.cwd(), 'test', 'fixtures'),
  redisConfig: {
    host: 'localhost',
    port: 6379,
    db: 15 // Use separate DB for tests
  },
  timeouts: {
    default: 10000,
    long: 30000,
    short: 5000
  },
  parallel: false,
  maxConcurrency: 3,
  cleanup: true,
  reportFormat: 'console',
  outputDir: path.join(process.cwd(), 'test', 'reports')
};

export { ContractTestSuite };