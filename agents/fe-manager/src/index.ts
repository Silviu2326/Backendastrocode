import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '../../../shared/utils/logger';
import { FeManagerOrchestrator } from './orchestrator';
import { FeManagerMapper } from './mapper';
import { EventBus } from './events/EventBus';
import { VectorStore } from './context/VectorStore';
import { SmartPrioritizer } from './prioritization/SmartPrioritizer';
import { TokenGuardian } from './backpressure/TokenGuardian';
import { SmartRetryManager } from './retry/SmartRetryManager';
import { SecurityManager } from './security/SecurityManager';
import { TelemetryManager } from './observability/TelemetryManager';
import { PluginManager } from './plugins/PluginManager';
import { PrismaClient } from '@prisma/client';
import { feManagerJobSchema, validateJobData } from '../../../shared/validation/jobSchemas';
import { TypedJob, QUEUE_TIMEOUTS } from '../types/queues';
import { TracingUtils, initializeTracing } from '../../../shared/tracing';
import { SpanStatusCode } from '@opentelemetry/api';
import { tokenTracker } from '../../../shared/utils/tokenTracker';
import { contextCache } from '../../../shared/utils/contextCache';
import { createAstPatcher } from '../../../shared/utils/astPatcher';
import { globalDryRun } from '../../../shared/utils/dryRunMode';
import { createDependencyOrdering } from '../../../shared/utils/dependencyOrdering';
import { pluginSystem } from '../../../shared/utils/pluginSystem';

// Initialize tracing
initializeTracing();

// Initialize plugin system
pluginSystem.initialize().catch(error => {
  logger.error('Failed to initialize plugin system', { error: error.message });
});

const app = express();
const port = process.env.PORT || 3010;

// Initialize Prisma client
const prisma = new PrismaClient();

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
});

// Initialize all managers
const eventBus = new EventBus(redis);
const vectorStore = new VectorStore(prisma);
const prioritizer = new SmartPrioritizer();
const tokenGuardian = new TokenGuardian(redis, prisma);
const retryManager = new SmartRetryManager(redis);
const securityManager = new SecurityManager(redis);
const telemetryManager = new TelemetryManager();
const pluginManager = new PluginManager();

// Initialize orchestrator and mapper with enhanced capabilities
const orchestrator = new FeManagerOrchestrator(redis, {
  eventBus,
  vectorStore,
  prioritizer,
  tokenGuardian,
  retryManager,
  telemetryManager,
  pluginManager
});
const mapper = new FeManagerMapper(prisma, vectorStore);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(securityManager.rateLimitMiddleware());

// Worker for processing user stories with enhanced capabilities
const worker = new Worker<TypedJob<'fe-manager'>['data']>(
  'fe-manager',
  async (job) => {
    const startTime = Date.now();
    const span = TracingUtils.createJobSpan(job.id!, 'fe-manager', job.name || 'unknown');
    const traceId = TracingUtils.getCurrentTraceId();
    
    const jobLogger = logger.withContext({ jobId: job.id, jobName: job.name, traceId });
    jobLogger.info('Processing job', { data: job.data });

    // Create plugin context
    const pluginContext = {
      jobId: job.id!,
      queueName: 'fe-manager',
      data: job.data,
      metadata: {
        timestamp: new Date(),
        worker: 'fe-manager',
      },
      timestamp: new Date(),
    };

    try {
      // Validate job.data with Zod before processing
      TracingUtils.addSpanAttributes({ 'job.validation.start': true });
      const validatedData = validateJobData(feManagerJobSchema, job.data);
      TracingUtils.addSpanAttributes({ 'job.validation.success': true });
      jobLogger.info('Job data validation successful', { jobId: job.id });
      
      // Check token availability before processing
      const estimatedTokens = validatedData.estimatedTokens || 1000;
      TracingUtils.addSpanAttributes({ 'job.tokens.estimated': estimatedTokens });
      
      const canProceed = await tokenGuardian.checkTokenAvailability({
        estimatedTokens,
        priority: job.opts.priority || 50
      });
      
      if (!canProceed.allowed) {
        TracingUtils.addSpanAttributes({ 
          'job.tokens.insufficient': true,
          'job.tokens.delay': canProceed.suggestedDelay
        });
        jobLogger.warn('Job delayed due to token limits', {
          jobId: job.id,
          delay: canProceed.suggestedDelay
        });
        throw new Error(`Token limit exceeded. Retry after ${canProceed.suggestedDelay}ms`);
      }
      
      TracingUtils.addSpanAttributes({ 'job.tokens.sufficient': true });
      
      // Execute onStart hooks
      await pluginSystem.executeOnStart(pluginContext);
      
      // Check if dry-run mode is enabled
      const isDryRun = globalDryRun.isEnabled();
      if (isDryRun) {
        jobLogger.info('Running in dry-run mode', { jobId: job.id });
        TracingUtils.addSpanAttributes({ 'job.dryRun': true });
      }
      
      // Create dependency ordering for user story components
      const dependencyOrdering = createDependencyOrdering();
      if (validatedData.stories) {
        dependencyOrdering.buildFromStories(
          validatedData.stories.map((story: any) => ({
            id: story.id,
            dependencies: story.dependencies || [],
            priority: story.priority || 0,
            metadata: { title: story.title },
          }))
        );
      }
      
      // Execute plugin hooks before processing
      await pluginManager.executeHook('onBeforeEnqueue', {
        jobId: job.id,
        jobName: job.name,
        data: validatedData,
        context: { span, traceId }
      });
      
      // Execute onProgress hook
      await pluginSystem.executeOnProgress({
        ...pluginContext,
        progress: 25,
        message: 'Starting orchestration',
      });
      
      TracingUtils.addSpanAttributes({ 'job.processing.start': true });
      let result;
      
      switch (job.name) {
        case 'process-user-stories':
          result = await orchestrator.processUserStories(validatedData.stories!);
          
          // Publish event
          await eventBus.publishStoryEvent({
            type: 'stories.processed',
            storyIds: validatedData.stories!.map((s: any) => s.id),
            projectId: validatedData.metadata?.projectId,
            timestamp: new Date(),
            metadata: { jobId: job.id, traceId }
          });
          break;
        
        case 'analyze-story-dependencies':
          result = await orchestrator.analyzeStoryDependencies(validatedData.storyId!);
          break;
        
        case 'update-job-priorities':
          result = await orchestrator.updateJobPriorities((validatedData as any).criteria);
          break;
        
        case 'generate-component-metadata':
          // Get context from vector store
          const context = await vectorStore.getContextForStory((validatedData as any).story);
          
          result = await mapper.generateComponentMetadata((validatedData as any).story, context);
          
          // Store embedding for future context
          await vectorStore.storeStoryEmbedding(
            (validatedData as any).story.id,
            (validatedData as any).story.description,
            result
          );
          break;
        
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
      
      // Record token usage with both systems
      if (result?.tokensUsed) {
        // Legacy token guardian
        await tokenGuardian.recordTokenUsage({
          jobId: job.id,
          model: job.data.model || 'gpt-4',
          inputTokens: result.tokensUsed.input || 0,
          outputTokens: result.tokensUsed.output || 0,
          cost: result.tokensUsed.cost || 0
        });
        
        // New token tracker for enhanced analytics
        const totalTokens = (result.tokensUsed.input || 0) + (result.tokensUsed.output || 0);
        if (validatedData.stories && validatedData.stories.length > 0) {
          for (const story of validatedData.stories) {
            await tokenTracker.incrementStoryTokens(
              story.id,
              Math.ceil(totalTokens / validatedData.stories.length),
              {
                projectId: validatedData.metadata?.projectId || 'unknown',
                operation: `fe-manager-${job.name}`,
                model: job.data.model || 'gpt-4',
                provider: 'openai',
              }
            );
          }
        }
      }
      
      // Cache successful results for context reuse
      if (result && job.name === 'generate-component-metadata') {
        const cacheKey = `component-metadata:${(validatedData as any).story.id}`;
        await contextCache.set(
          cacheKey,
          result,
          {
            storyId: (validatedData as any).story.id,
            operation: job.name,
            model: job.data.model || 'gpt-4',
          },
          3600 // 1 hour TTL
        );
      }
      
      // Execute plugin hooks after processing
      await pluginManager.executeHook('onAfterEnqueue', {
        jobId: job.id,
        jobName: job.name,
        data: validatedData,
        result,
        context: { span, traceId }
      });
      
      // Execute onComplete hooks
      await pluginSystem.executeOnComplete({
        ...pluginContext,
        result,
        duration: processingTime,
      });
      
      const processingTime = Date.now() - startTime;
      TracingUtils.addSpanAttributes({
        'job.processing_time_ms': processingTime,
        'job.tokens_used': estimatedTokens,
        'job.success': true,
        'job.result.size': JSON.stringify(result).length
      });
      
      TracingUtils.setSpanStatus(SpanStatusCode.OK);
      
      jobLogger.info('Job completed successfully', {
        jobId: job.id,
        processingTime,
        tokensUsed: estimatedTokens
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      TracingUtils.addSpanAttributes({ 
        'job.error': true,
        'job.processing_time_ms': processingTime
      });
      TracingUtils.recordException(error as Error);
      
      // Execute onError hooks
      await pluginSystem.executeOnError({
        ...pluginContext,
        error: error as Error,
      });
      
      // Check if error is retryable
      const shouldRetry = await retryManager.shouldRetry(error, job.attemptsMade || 0);
      
      if (shouldRetry.retry) {
        TracingUtils.addSpanAttributes({ 'job.will_retry': true });
        jobLogger.warn('Job will be retried', {
          jobId: job.id,
          attempt: job.attemptsMade || 0,
          delay: shouldRetry.delay,
          reason: shouldRetry.reason
        });
        
        // Schedule retry
        await retryManager.scheduleRetry(job, shouldRetry.delay);
      } else {
        TracingUtils.addSpanAttributes({ 'job.failed_permanently': true });
        jobLogger.error('Job failed permanently', {
          jobId: job.id,
          jobName: job.name,
          error: error.message,
          attempts: job.attemptsMade || 0,
          reason: shouldRetry.reason
        });
        
        // Move to dead letter queue
        await retryManager.moveToDeadLetter(job, error);
      }
      
      jobLogger.error('Job processing failed', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    removeOnComplete: 100,
    removeOnFail: 50,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      // Add timeout from configuration
      timeout: QUEUE_TIMEOUTS['fe-manager'],
    },
  }
);

// Worker event handlers with telemetry
worker.on('completed', async (job) => {
  logger.info('Job completed', { 
    jobId: job.id, 
    jobName: job.name,
    duration: Date.now() - job.processedOn!
  });
  
  await eventBus.publishJobEvent({
    type: 'job.completed',
    jobId: job.id,
    queueName: 'fe-manager',
    timestamp: new Date(),
    metadata: { duration: Date.now() - job.processedOn! }
  });
});

worker.on('failed', async (job, err) => {
  logger.error('Job failed', { 
    jobId: job?.id, 
    jobName: job?.name,
    error: err.message,
    attempts: job?.attemptsMade
  });
  
  await eventBus.publishJobEvent({
    type: 'job.failed',
    jobId: job?.id || 'unknown',
    queueName: 'fe-manager',
    timestamp: new Date(),
    metadata: { error: err.message, stack: err.stack }
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message, stack: err.stack });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const redisHealth = await redis.ping();
    const workerHealth = {
      isRunning: !worker.closing,
      concurrency: worker.opts.concurrency,
      processed: await worker.getCompleted(),
      failed: await worker.getFailed(),
      active: await worker.getActive(),
      waiting: await worker.getWaiting()
    };

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'fe-manager',
      version: process.env.npm_package_version || '1.0.0',
      redis: { status: redisHealth === 'PONG' ? 'connected' : 'disconnected' },
      worker: workerHealth,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const stats = await orchestrator.getJobStatistics();
    const tokenStats = await tokenGuardian.getUsageStats();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      jobs: stats,
      tokens: tokenStats,
      worker: {
        processed: await worker.getCompleted(),
        failed: await worker.getFailed(),
        active: await worker.getActive(),
        waiting: await worker.getWaiting(),
        concurrency: worker.opts.concurrency
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Metrics collection failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// Job management endpoints
app.post('/jobs/process-stories', async (req, res) => {
  try {
    const { stories } = req.body;
    
    if (!stories || !Array.isArray(stories)) {
      return res.status(400).json({ error: 'Invalid stories data' });
    }

    const result = await orchestrator.processUserStories(stories);
    
    res.json({
      success: true,
      message: 'Stories processing initiated',
      jobsCreated: result.jobsCreated,
      totalJobs: result.totalJobs
    });
  } catch (error) {
    logger.error('Story processing request failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to process stories',
      message: error.message
    });
  }
});

app.post('/jobs/update-priorities', async (req, res) => {
  try {
    const { criteria } = req.body;
    
    const result = await orchestrator.updateJobPriorities(criteria);
    
    res.json({
      success: true,
      message: 'Job priorities updated',
      updatedJobs: result.updatedJobs
    });
  } catch (error) {
    logger.error('Priority update request failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to update priorities',
      message: error.message
    });
  }
});

// Queue status endpoint
app.get('/queues/status', async (req, res) => {
  try {
    const queueStatus = await orchestrator.getQueueStatus();
    res.json(queueStatus);
  } catch (error) {
    logger.error('Queue status request failed', { error: error.message });
    res.status(500).json({
      error: 'Failed to get queue status',
      message: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  
  try {
    // Close worker
    await worker.close();
    logger.info('Worker closed');
    
    // Cleanup all services
    await eventBus.cleanup();
    await vectorStore.cleanup();
    await telemetryManager.cleanup();
    await pluginManager.cleanup();
    await prisma.$disconnect();
    await redis.disconnect();
    logger.info('All services cleaned up');
    
    // Close HTTP server
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  
  try {
    await worker.close();
    await eventBus.cleanup();
    await vectorStore.cleanup();
    await telemetryManager.cleanup();
    await pluginManager.cleanup();
    await prisma.$disconnect();
    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start server
app.listen(port, async () => {
  try {
    // Initialize all services
    await eventBus.initialize();
    await vectorStore.initialize();
    await telemetryManager.initialize();
    await pluginManager.initialize();
    
    logger.info(`Fe-manager service started on port ${port}`, {
      port,
      nodeEnv: process.env.NODE_ENV,
      redisHost: process.env.REDIS_HOST || 'localhost',
      redisPort: process.env.REDIS_PORT || '6379',
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5')
    });
  } catch (error) {
    logger.error('Failed to start service', { error: error.message });
    process.exit(1);
  }
});

export { app, worker, orchestrator, mapper };