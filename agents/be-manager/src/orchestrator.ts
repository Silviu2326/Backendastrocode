import { Queue } from 'bullmq';
import { logger } from '@shared/utils/logger';
import { redis } from '@shared/utils/redis';
import { tracer } from '@shared/utils/tracing';
import { metrics } from '@shared/utils/metrics';
import type { 
  BeManagerJobData, 
  BeDraftJobData, 
  BeLogicJobData, 
  BeTestJobData, 
  BeTypefixJobData 
} from '@shared/types/queues';

interface OrchestrationResult {
  success: boolean;
  jobIds: {
    draft?: string;
    logic?: string;
    test?: string;
    typefix?: string;
  };
  errors: string[];
  summary: {
    totalStories: number;
    processedStories: number;
    totalJobs: number;
    completedJobs: number;
  };
}

class BeManagerOrchestrator {
  private draftQueue: Queue<BeDraftJobData>;
  private logicQueue: Queue<BeLogicJobData>;
  private testQueue: Queue<BeTestJobData>;
  private typefixQueue: Queue<BeTypefixJobData>;
  private processedCount = 0;
  private errorCount = 0;

  constructor() {
    this.draftQueue = new Queue<BeDraftJobData>('be-draft', { connection: redis });
    this.logicQueue = new Queue<BeLogicJobData>('be-logic', { connection: redis });
    this.testQueue = new Queue<BeTestJobData>('be-test', { connection: redis });
    this.typefixQueue = new Queue<BeTypefixJobData>('be-typefix', { connection: redis });
  }

  async orchestrate(data: BeManagerJobData): Promise<OrchestrationResult> {
    const span = tracer.startSpan('be-manager-orchestration', {
      attributes: {
        'stories.count': data.stories.length,
        'project.id': data.project.id,
        'api.impact': data.apiImpact
      }
    });

    try {
      logger.info('Starting backend orchestration', {
        storiesCount: data.stories.length,
        projectId: data.project.id,
        apiImpact: data.apiImpact
      });

      // Only proceed if apiImpact is true
      if (!data.apiImpact) {
        logger.info('Skipping backend generation - no API impact', {
          projectId: data.project.id
        });
        
        return {
          success: true,
          jobIds: {},
          errors: [],
          summary: {
            totalStories: data.stories.length,
            processedStories: 0,
            totalJobs: 0,
            completedJobs: 0
          }
        };
      }

      const result: OrchestrationResult = {
        success: true,
        jobIds: {},
        errors: [],
        summary: {
          totalStories: data.stories.length,
          processedStories: 0,
          totalJobs: 0,
          completedJobs: 0
        }
      };

      // Process each story that has API impact
      for (const story of data.stories) {
        if (!story.apiImpact) {
          continue;
        }

        try {
          await this.processStory(story, data, result);
          result.summary.processedStories++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Story ${story.id}: ${errorMessage}`);
          result.success = false;
          this.errorCount++;
          
          logger.error('Error processing story', {
            storyId: story.id,
            error: errorMessage
          });
        }
      }

      // Record metrics
      metrics.increment('be_manager.orchestrations.completed');
      metrics.gauge('be_manager.stories.processed', result.summary.processedStories);
      metrics.gauge('be_manager.jobs.total', result.summary.totalJobs);

      this.processedCount++;
      span.setStatus({ code: 1 }); // OK
      
      logger.info('Backend orchestration completed', {
        success: result.success,
        processedStories: result.summary.processedStories,
        totalJobs: result.summary.totalJobs,
        errors: result.errors.length
      });

      return result;
    } catch (error) {
      this.errorCount++;
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      
      logger.error('Backend orchestration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        projectId: data.project.id
      });
      
      throw error;
    } finally {
      span.end();
    }
  }

  private async processStory(
    story: BeManagerJobData['stories'][0], 
    data: BeManagerJobData, 
    result: OrchestrationResult
  ): Promise<void> {
    const storySpan = tracer.startSpan('be-manager-process-story', {
      attributes: {
        'story.id': story.id,
        'story.type': story.type
      }
    });

    try {
      // 1. Generate backend draft
      if (this.shouldGenerateDraft(story, data)) {
        const draftJob = await this.enqueueDraftJob(story, data);
        result.jobIds.draft = draftJob.id!;
        result.summary.totalJobs++;
      }

      // 2. Generate business logic (depends on draft)
      if (this.shouldGenerateLogic(story, data)) {
        const logicJob = await this.enqueueLogicJob(story, data, result.jobIds.draft);
        result.jobIds.logic = logicJob.id!;
        result.summary.totalJobs++;
      }

      // 3. Generate tests (depends on logic)
      if (this.shouldGenerateTests(story, data)) {
        const testJob = await this.enqueueTestJob(story, data, result.jobIds.logic);
        result.jobIds.test = testJob.id!;
        result.summary.totalJobs++;
      }

      // 4. Fix TypeScript issues (depends on all previous)
      if (this.shouldFixTypes(story, data)) {
        const typefixJob = await this.enqueueTypefixJob(story, data, [
          result.jobIds.draft,
          result.jobIds.logic,
          result.jobIds.test
        ].filter(Boolean) as string[]);
        result.jobIds.typefix = typefixJob.id!;
        result.summary.totalJobs++;
      }

      storySpan.setStatus({ code: 1 }); // OK
    } catch (error) {
      storySpan.recordException(error as Error);
      storySpan.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      throw error;
    } finally {
      storySpan.end();
    }
  }

  private shouldGenerateDraft(story: BeManagerJobData['stories'][0], data: BeManagerJobData): boolean {
    return story.apiImpact && (
      story.type === 'feature' || 
      story.type === 'enhancement' || 
      story.type === 'api'
    );
  }

  private shouldGenerateLogic(story: BeManagerJobData['stories'][0], data: BeManagerJobData): boolean {
    return story.apiImpact && story.complexity !== 'low';
  }

  private shouldGenerateTests(story: BeManagerJobData['stories'][0], data: BeManagerJobData): boolean {
    return story.apiImpact && data.project.testingFramework !== 'none';
  }

  private shouldFixTypes(story: BeManagerJobData['stories'][0], data: BeManagerJobData): boolean {
    return story.apiImpact && data.project.language === 'typescript';
  }

  private async enqueueDraftJob(
    story: BeManagerJobData['stories'][0], 
    data: BeManagerJobData
  ) {
    const jobData: BeDraftJobData = {
      userStory: story,
      project: data.project,
      apiSpec: story.apiSpec || {
        endpoints: [],
        models: [],
        middleware: []
      }
    };

    return await this.draftQueue.add(
      `be-draft-${story.id}`,
      jobData,
      {
        priority: this.getJobPriority(story),
        delay: 0,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
  }

  private async enqueueLogicJob(
    story: BeManagerJobData['stories'][0], 
    data: BeManagerJobData,
    dependsOn?: string
  ) {
    const jobData: BeLogicJobData = {
      userStory: story,
      project: data.project,
      businessRules: story.businessRules || [],
      validationRules: story.validationRules || [],
      integrations: story.integrations || []
    };

    const jobOptions: any = {
      priority: this.getJobPriority(story),
      delay: dependsOn ? 5000 : 0, // Wait for draft to complete
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    };

    if (dependsOn) {
      jobOptions.parent = {
        id: dependsOn,
        queue: 'be-draft'
      };
    }

    return await this.logicQueue.add(
      `be-logic-${story.id}`,
      jobData,
      jobOptions
    );
  }

  private async enqueueTestJob(
    story: BeManagerJobData['stories'][0], 
    data: BeManagerJobData,
    dependsOn?: string
  ) {
    const jobData: BeTestJobData = {
      userStory: story,
      project: data.project,
      testTypes: this.getTestTypes(story, data),
      coverage: {
        minimum: 80,
        target: 90
      }
    };

    const jobOptions: any = {
      priority: this.getJobPriority(story),
      delay: dependsOn ? 10000 : 0, // Wait for logic to complete
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    };

    if (dependsOn) {
      jobOptions.parent = {
        id: dependsOn,
        queue: 'be-logic'
      };
    }

    return await this.testQueue.add(
      `be-test-${story.id}`,
      jobData,
      jobOptions
    );
  }

  private async enqueueTypefixJob(
    story: BeManagerJobData['stories'][0], 
    data: BeManagerJobData,
    dependsOn: string[]
  ) {
    const jobData: BeTypefixJobData = {
      userStory: story,
      project: data.project,
      typeIssues: [] // Will be populated by the typefix agent
    };

    return await this.typefixQueue.add(
      `be-typefix-${story.id}`,
      jobData,
      {
        priority: this.getJobPriority(story),
        delay: 15000, // Wait for all previous jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
  }

  private getJobPriority(story: BeManagerJobData['stories'][0]): number {
    switch (story.priority) {
      case 'high': return 1;
      case 'medium': return 5;
      case 'low': return 10;
      default: return 5;
    }
  }

  private getTestTypes(story: BeManagerJobData['stories'][0], data: BeManagerJobData): string[] {
    const testTypes = ['unit'];
    
    if (story.apiImpact) {
      testTypes.push('integration');
    }
    
    if (story.complexity === 'high') {
      testTypes.push('e2e');
    }
    
    return testTypes;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  async getQueueStats() {
    const [draftStats, logicStats, testStats, typefixStats] = await Promise.all([
      this.draftQueue.getJobCounts(),
      this.logicQueue.getJobCounts(),
      this.testQueue.getJobCounts(),
      this.typefixQueue.getJobCounts()
    ]);

    return {
      draft: draftStats,
      logic: logicStats,
      test: testStats,
      typefix: typefixStats
    };
  }
}

export const beManagerOrchestrator = new BeManagerOrchestrator();