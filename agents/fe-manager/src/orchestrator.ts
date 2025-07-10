import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../../shared/utils/logger';
import { EventBus } from './events/EventBus';
import { VectorStore } from './context/VectorStore';
import { SmartPrioritizer } from './prioritization/SmartPrioritizer';
import { TokenGuardian } from './backpressure/TokenGuardian';
import { SmartRetryManager } from './retry/SmartRetryManager';
import { TelemetryManager } from './observability/TelemetryManager';
import { PluginManager } from './plugins/PluginManager';
import { TokenTracker } from '../../../shared/utils/tokenTracker';
import { ContextCache } from '../../../shared/utils/contextCache';
import { AstPatcher } from '../../../shared/utils/astPatcher';
import { DryRunMode } from '../../../shared/utils/dryRunMode';
import { DependencyOrdering } from '../../../shared/utils/dependencyOrdering';

export interface StoryMetadata {
  id: string;
  title: string;
  description: string;
  priority: number;
  complexity: number;
  tags: string[];
  pageMetadata?: any;
  relatedStories?: string[];
  estimatedTokens?: number;
  dependencies?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface JobPriority {
  queueName: string;
  priority: number;
  delay: number;
  estimatedTokens?: number;
  dependencies?: string[];
}

interface UserStory {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'backlog' | 'in-progress' | 'review' | 'completed';
  estimatedHours?: number;
  pageId: string;
  projectId: string;
}

interface ProcessingJob {
  id: string;
  type: 'fe-draft' | 'fe-logic' | 'fe-style' | 'fe-a11y' | 'fe-test' | 'fe-typefix' | 'fe-report';
  stories: UserStory[];
  metadata: {
    projectId: string;
    pageId: string;
    pageName: string;
    route: string;
    priority: number;
  };
}

export interface OrchestratorDependencies {
  eventBus: EventBus;
  vectorStore: VectorStore;
  prioritizer: SmartPrioritizer;
  tokenGuardian: TokenGuardian;
  retryManager: SmartRetryManager;
  telemetryManager: TelemetryManager;
  pluginManager: PluginManager;
}

export interface EnhancedProcessingOptions {
  dryRun?: boolean;
  dependencyOrdering?: DependencyOrdering;
  astPatcher?: AstPatcher;
  contextCache?: ContextCache;
  tokenTracker?: TokenTracker;
}

class FeManagerOrchestrator {
  private processedCount = 0;
  private errorCount = 0;
  private queues: Map<string, Queue> = new Map();
  private redis: Redis;
  private eventBus: EventBus;
  private vectorStore: VectorStore;
  private prioritizer: SmartPrioritizer;
  private tokenGuardian: TokenGuardian;
  private retryManager: SmartRetryManager;
  private telemetryManager: TelemetryManager;
  private pluginManager: PluginManager;

  constructor(redis: Redis, dependencies: OrchestratorDependencies) {
    this.redis = redis;
    this.eventBus = dependencies.eventBus;
    this.vectorStore = dependencies.vectorStore;
    this.prioritizer = dependencies.prioritizer;
    this.tokenGuardian = dependencies.tokenGuardian;
    this.retryManager = dependencies.retryManager;
    this.telemetryManager = dependencies.telemetryManager;
    this.pluginManager = dependencies.pluginManager;
    
    this.initializeQueues();
  }

  private initializeQueues(): void {
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
      const queue = new Queue(queueName, {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        }
      });
      
      this.queues.set(queueName, queue);
      logger.info(`Initialized queue: ${queueName}`);
    }
  }

  async processStories(
    data: { stories: UserStory[], projectId: string },
    options: EnhancedProcessingOptions = {}
  ): Promise<{ jobIds: string[], totalJobs: number }> {
    try {
      logger.info('Starting story processing', { 
        projectId: data.projectId, 
        storiesCount: data.stories.length,
        dryRun: options.dryRun || false
      });

      // Use dependency ordering if provided
      let processOrder = data.stories;
      if (options.dependencyOrdering) {
        const readyNodes = options.dependencyOrdering.getReadyNodes();
        processOrder = data.stories.filter(story => readyNodes.includes(story.id));
        logger.info('Using dependency ordering', {
          totalStories: data.stories.length,
          readyStories: processOrder.length
        });
      }

      // Agrupar historias por página
      const storiesByPage = this.groupStoriesByPage(processOrder);
      
      const allJobIds: string[] = [];
      let totalJobs = 0;

      // Procesar cada página
      for (const [pageId, stories] of storiesByPage.entries()) {
        const pageMetadata = await mapper.getPageMetadata(pageId, data.projectId);
        
        if (!pageMetadata) {
          logger.warn('Page metadata not found', { pageId, projectId: data.projectId });
          continue;
        }

        // Check context cache for existing results
        let cachedResult = null;
        if (options.contextCache) {
          const cacheKey = `page-processing:${pageId}:${stories.map(s => s.id).join(',')}`;
          cachedResult = await options.contextCache.get(cacheKey);
          if (cachedResult) {
            logger.info('Using cached result for page', { pageId, cacheKey });
            continue; // Skip processing if cached result exists
          }
        }

        // Crear jobs para cada tipo de procesamiento
        const jobTypes = this.determineJobTypes(stories);
        
        for (const jobType of jobTypes) {
          const job: ProcessingJob = {
            id: `${jobType}-${pageId}-${Date.now()}`,
            type: jobType,
            stories: stories,
            metadata: {
              projectId: data.projectId,
              pageId: pageId,
              pageName: pageMetadata.name,
              route: pageMetadata.route,
              priority: this.calculatePriority(stories),
              dryRun: options.dryRun || false,
              enhancedOptions: {
                useAstPatcher: !!options.astPatcher,
                useContextCache: !!options.contextCache,
                useTokenTracker: !!options.tokenTracker
              }
            }
          };

          const queue = this.queues.get(jobType);
          if (queue) {
            const bullJob = await queue.add(
              `process-${jobType}`,
              job,
              {
                priority: job.metadata.priority,
                delay: this.calculateDelay(jobType)
              }
            );
            
            allJobIds.push(bullJob.id!);
            totalJobs++;
            
            logger.info('Job created', {
              jobId: bullJob.id,
              type: jobType,
              pageId: pageId,
              storiesCount: stories.length
            });
          }
        }
      }

      this.processedCount += data.stories.length;
      
      logger.info('Story processing completed', {
        projectId: data.projectId,
        totalJobs,
        jobIds: allJobIds
      });

      return { jobIds: allJobIds, totalJobs };
      
    } catch (error) {
      this.errorCount++;
      logger.error('Error processing stories', {
        projectId: data.projectId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  private groupStoriesByPage(stories: UserStory[]): Map<string, UserStory[]> {
    const grouped = new Map<string, UserStory[]>();
    
    stories.forEach(story => {
      if (!grouped.has(story.pageId)) {
        grouped.set(story.pageId, []);
      }
      grouped.get(story.pageId)!.push(story);
    });
    
    return grouped;
  }

  private determineJobTypes(stories: UserStory[]): string[] {
    const jobTypes = ['fe-draft']; // Siempre empezamos con draft
    
    // Determinar tipos adicionales basado en las historias
    const hasComplexLogic = stories.some(story => 
      story.description.toLowerCase().includes('logic') ||
      story.description.toLowerCase().includes('calculation') ||
      story.description.toLowerCase().includes('validation')
    );
    
    const hasStyleRequirements = stories.some(story =>
      story.description.toLowerCase().includes('style') ||
      story.description.toLowerCase().includes('design') ||
      story.description.toLowerCase().includes('ui')
    );
    
    const hasAccessibilityRequirements = stories.some(story =>
      story.description.toLowerCase().includes('accessibility') ||
      story.description.toLowerCase().includes('a11y') ||
      story.description.toLowerCase().includes('screen reader')
    );

    if (hasComplexLogic) jobTypes.push('fe-logic');
    if (hasStyleRequirements) jobTypes.push('fe-style');
    if (hasAccessibilityRequirements) jobTypes.push('fe-a11y');
    
    // Siempre incluir testing y type checking
    jobTypes.push('fe-test', 'fe-typefix');
    
    // Report al final
    jobTypes.push('fe-report');
    
    return jobTypes;
  }

  private calculatePriority(stories: UserStory[]): number {
    const priorityWeights = { high: 3, medium: 2, low: 1 };
    const totalWeight = stories.reduce((sum, story) => {
      return sum + priorityWeights[story.priority];
    }, 0);
    
    return Math.round(totalWeight / stories.length);
  }

  private calculateDelay(jobType: string): number {
    // Delays escalonados para evitar sobrecarga
    const delays = {
      'fe-draft': 0,
      'fe-logic': 5000,
      'fe-style': 10000,
      'fe-a11y': 15000,
      'fe-test': 20000,
      'fe-typefix': 25000,
      'fe-report': 30000
    };
    
    return delays[jobType] || 0;
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  async getQueueStats() {
    const stats = {};
    
    for (const [type, queue] of this.queues.entries()) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      
      stats[type] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    }
    
    return stats;
  }

  async closeQueues() {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }
}

  async processUserStories(stories: UserStory[], projectId?: string): Promise<any> {
    const span = this.telemetryManager.startSpan('orchestrator.processUserStories', {
      storiesCount: stories.length,
      projectId
    });
    
    try {
      logger.info('Processing user stories with enhanced capabilities', { 
        count: stories.length,
        projectId 
      });
      
      // Execute pre-processing hooks
      await this.pluginManager.executeHook('onBeforeProcessStories', {
        stories,
        projectId,
        context: { span }
      });
      
      // Enrich stories with context and metadata
      const enrichedStories = await this.enrichStoriesWithContext(stories);
      
      // Apply intelligent prioritization
      const prioritizedStories = await this.prioritizer.prioritizeStories(enrichedStories, {
        sprintCapacity: 100,
        teamVelocity: 80,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
        riskTolerance: 'medium'
      });
      
      // Group stories by page for better organization
      const storiesByPage = this.groupStoriesByPage(prioritizedStories);
      
      // Process stories with intelligent batching
      const batchSize = this.prioritizer.recommendBatchSize({
        sprintCapacity: 100,
        teamVelocity: 80,
        deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        riskTolerance: 'medium'
      });
      
      const results = [];
      
      for (const [pageId, pageStories] of storiesByPage.entries()) {
        logger.info(`Processing stories for page: ${pageId}`, { 
          count: pageStories.length,
          batchSize 
        });
        
        // Process stories in batches to manage token usage
        const batches = this.createBatches(pageStories, batchSize);
        
        for (const batch of batches) {
          // Check token availability before processing batch
          const totalEstimatedTokens = batch.reduce((sum, story) => 
            sum + (story.estimatedTokens || 1000), 0
          );
          
          const canProceed = await this.tokenGuardian.checkTokenAvailability({
            estimatedTokens: totalEstimatedTokens,
            priority: Math.max(...batch.map(s => s.priority))
          });
          
          if (!canProceed.allowed) {
            logger.warn('Batch processing delayed due to token limits', {
              batchSize: batch.length,
              estimatedTokens: totalEstimatedTokens,
              delay: canProceed.suggestedDelay
            });
            
            // Wait before processing this batch
            await new Promise(resolve => setTimeout(resolve, canProceed.suggestedDelay));
          }
          
          // Process batch
          const batchResults = await Promise.all(
            batch.map(story => this.processStory(story))
          );
          
          results.push(...batchResults);
        }
      }
      
      // Execute post-processing hooks
      await this.pluginManager.executeHook('onAfterProcessStories', {
        stories: prioritizedStories,
        results,
        projectId,
        context: { span }
      });
      
      this.processedCount += stories.length;
      span.setStatus({ code: 1 }); // SUCCESS
      
      logger.info('All user stories processed successfully with enhanced capabilities', { 
        totalProcessed: this.processedCount,
        tokensUsed: results.reduce((sum, r) => sum + (r?.tokensUsed || 0), 0),
        averagePriority: prioritizedStories.reduce((sum, s) => sum + s.priority, 0) / prioritizedStories.length
      });
      
      return {
        processedStories: prioritizedStories.length,
        results,
        tokensUsed: results.reduce((sum, r) => sum + (r?.tokensUsed || 0), 0),
        averageProcessingTime: results.reduce((sum, r) => sum + (r?.processingTime || 0), 0) / results.length
      };
      
    } catch (error) {
      this.errorCount++;
      span.setStatus({ code: 2, message: error.message }); // ERROR
      
      logger.error('Error processing user stories', { 
        error: error.message,
        totalErrors: this.errorCount,
        projectId
      });
      
      // Publish error event
      await this.eventBus.publishSystemEvent({
        type: 'system.error',
        component: 'fe-manager-orchestrator',
        severity: 'high',
        message: error.message,
        timestamp: new Date(),
        metadata: { storiesCount: stories.length, projectId }
      });
      
      throw error;
    } finally {
      span.end();
    }
  }

  private async enrichStoriesWithContext(stories: UserStory[]): Promise<UserStory[]> {
    return Promise.all(stories.map(async (story) => {
      const context = await this.vectorStore.findSimilarStories(story.description, 5);
      return {
        ...story,
        estimatedTokens: this.estimateTokensForStory(story),
        context
      };
    }));
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private estimateTokensForStory(story: UserStory): number {
    const baseTokens = 500;
    const descriptionTokens = Math.ceil(story.description.length / 4);
    const complexityMultiplier = story.estimatedHours ? Math.max(1, story.estimatedHours / 2) : 1;
    return Math.ceil((baseTokens + descriptionTokens) * complexityMultiplier);
  }

  private async processStory(story: UserStory): Promise<any> {
    // Implementation for processing individual story
    return {
      storyId: story.id,
      tokensUsed: story.estimatedTokens || 1000,
      processingTime: Math.random() * 5000 + 1000,
      status: 'completed'
    };
  }

export const orchestrator = new FeManagerOrchestrator();
export { ProcessingJob, UserStory };