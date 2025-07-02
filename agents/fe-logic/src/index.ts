import express from 'express';
import { Worker } from 'bullmq';
import { config } from '../../shared/config/env';
import { RedisManager } from '../../shared/config/redis';
import { ContextualLogger } from '../../shared/utils/logger';
import { FeLogicGenerator } from './generator';
import { feLogicJobSchema, validateJobData } from '../../shared/validation/jobSchemas';
import { TypedJob, QUEUE_TIMEOUTS } from '../types/queues';
import { TracingUtils, initializeTracing } from '../../shared/tracing';
import { SpanStatusCode } from '@opentelemetry/api';

// Initialize tracing
initializeTracing();

const logger = new ContextualLogger('fe-logic');
const app = express();
const port = config.agents.feLogic.port;

// Health check middleware
app.use(express.json());

// Initialize Redis connection
const redisManager = new RedisManager();

// Initialize logic generator
const logicGenerator = new FeLogicGenerator();

// Worker for processing logic generation jobs
const worker = new Worker<TypedJob<'fe-logic'>['data']>(
  'fe-logic',
  async (job) => {
    const span = TracingUtils.createJobSpan(job.id!, 'fe-logic', job.name || 'unknown');
    const traceId = TracingUtils.getCurrentTraceId();
    const jobLogger = logger.withContext({ jobId: job.id, jobName: job.name, traceId });
    
    jobLogger.info('Processing logic generation job', { data: job.data });

    try {
      // Validate job.data with Zod before processing
      TracingUtils.addSpanAttributes({ 'job.validation.start': true });
      const validatedData = validateJobData(feLogicJobSchema, job.data);
      TracingUtils.addSpanAttributes({ 'job.validation.success': true });
      jobLogger.info('Job data validation successful', { jobId: job.id });
      
      TracingUtils.addSpanAttributes({ 'job.generation.start': true });
      let result;
      
      switch (job.name) {
        case 'generate-component-logic':
          result = await logicGenerator.generateComponentLogic(validatedData);
          break;
        
        case 'enhance-existing-logic':
          result = await logicGenerator.enhanceExistingLogic(validatedData);
          break;
        
        case 'optimize-performance':
          result = await logicGenerator.optimizePerformance(validatedData);
          break;
        
        case 'add-error-handling':
          result = await logicGenerator.addErrorHandling(validatedData);
          break;
        
        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
      
      TracingUtils.addSpanAttributes({ 
        'job.generation.success': true,
        'job.result.size': JSON.stringify(result).length
      });
      TracingUtils.setSpanStatus(SpanStatusCode.OK);
      
      return result;
    } catch (error) {
      TracingUtils.recordException(error as Error);
      TracingUtils.addSpanAttributes({ 'job.error': true });
      jobLogger.error('Logic generation failed', { error: error.message, stack: error.stack });
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redisManager.getConnectionConfig(),
    concurrency: config.bullmq.concurrency,
    removeOnComplete: config.bullmq.removeOnComplete,
    removeOnFail: config.bullmq.removeOnFail,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
    defaultJobOptions: {
      removeOnComplete: config.bullmq.removeOnComplete,
      removeOnFail: config.bullmq.removeOnFail,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      timeout: QUEUE_TIMEOUTS['fe-logic'],
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Logic generation completed', { 
    jobId: job.id, 
    jobName: job.name,
    duration: Date.now() - job.processedOn!
  });
});

worker.on('failed', (job, err) => {
  logger.error('Logic generation failed', { 
    jobId: job?.id, 
    jobName: job?.name,
    error: err.message,
    attempts: job?.attemptsMade
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message, stack: err.stack });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const redisHealth = await redisManager.healthCheck();
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
      service: 'fe-logic',
      version: process.env.npm_package_version || '1.0.0',
      redis: redisHealth,
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
    const redisStats = await redisManager.getStats();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      redis: redisStats,
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  
  try {
    await worker.close();
    logger.info('Worker closed');
    
    await redisManager.disconnect();
    logger.info('Redis connections closed');
    
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
    await redisManager.disconnect();
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
    await redisManager.connect();
    logger.info('Connected to Redis');
    
    logger.info(`Fe-logic service started on port ${port}`, {
      port,
      nodeEnv: process.env.NODE_ENV,
      redisUrl: config.redis.url,
      concurrency: config.bullmq.concurrency
    });
  } catch (error) {
    logger.error('Failed to start service', { error: error.message });
    process.exit(1);
  }
});

export { app, worker, logicGenerator };