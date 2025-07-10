import { Worker, Job } from 'bullmq';
import express from 'express';
import { FeTypefixGenerator } from './generator';
import { ContextualLogger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { config } from '../../../shared/config/env';

const app = express();
const logger = new ContextualLogger('fe-typefix-worker');
const generator = new FeTypefixGenerator();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-typefix',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const worker = new Worker('fe-typefix', async () => {}, { connection: redisConnection });
    const waiting = await worker.getWaiting();
    const active = await worker.getActive();
    const completed = await worker.getCompleted();
    const failed = await worker.getFailed();
    
    res.json({
      service: 'fe-typefix',
      queues: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      },
      timestamp: new Date().toISOString()
    });
    
    await worker.close();
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// Job processing function
async function processTypefixJob(job: Job): Promise<any> {
  const jobLogger = logger.withContext({ 
    jobId: job.id, 
    jobType: job.data.type,
    component: job.data.component?.name 
  });
  
  jobLogger.info('Processing typefix job', {
    type: job.data.type,
    component: job.data.component?.name,
    storyId: job.data.userStory?.id
  });
  
  try {
    let result;
    
    switch (job.data.type) {
      case 'fix-errors':
        result = await generator.fixTypeErrors(job.data);
        break;
        
      case 'improve-safety':
        result = await generator.improveTypeSafety(job.data);
        break;
        
      case 'generate-types':
        result = await generator.generateMissingTypes(job.data);
        break;
        
      default:
        throw new Error(`Unknown typefix job type: ${job.data.type}`);
    }
    
    jobLogger.info('Typefix job completed successfully', {
      type: job.data.type,
      component: result.fixedFilePath,
      errorsFixed: result.metrics?.errorsFixed || 0,
      safetyScore: result.metrics?.safetyScore || 0
    });
    
    // Update job progress
    await job.updateProgress(100);
    
    return {
      success: true,
      type: job.data.type,
      component: job.data.component,
      result,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    jobLogger.error('Typefix job failed', {
      error: error.message,
      stack: error.stack,
      type: job.data.type,
      component: job.data.component?.name
    });
    
    throw error;
  }
}

// Create and configure the worker
const worker = new Worker('fe-typefix', processTypefixJob, {
  connection: redisConnection,
  concurrency: config.WORKER_CONCURRENCY || 2,
  removeOnComplete: config.REMOVE_COMPLETED_JOBS ? 10 : false,
  removeOnFail: config.REMOVE_FAILED_JOBS ? 5 : false,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1,
    retryProcessDelay: 5000
  }
});

// Worker event handlers
worker.on('ready', () => {
  logger.info('Fe-typefix worker is ready and waiting for jobs');
});

worker.on('active', (job: Job) => {
  logger.info('Job started', {
    jobId: job.id,
    type: job.data.type,
    component: job.data.component?.name,
    attempt: job.attemptsMade + 1
  });
});

worker.on('completed', (job: Job, result: any) => {
  logger.info('Job completed successfully', {
    jobId: job.id,
    type: job.data.type,
    component: job.data.component?.name,
    duration: Date.now() - job.timestamp,
    errorsFixed: result.result?.metrics?.errorsFixed || 0
  });
});

worker.on('failed', (job: Job | undefined, error: Error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    component: job?.data?.component?.name,
    error: error.message,
    stack: error.stack,
    attempt: (job?.attemptsMade || 0) + 1,
    maxAttempts: job?.opts?.attempts || 3
  });
});

worker.on('stalled', (jobId: string) => {
  logger.warn('Job stalled', { jobId });
});

worker.on('progress', (job: Job, progress: number | object) => {
  logger.debug('Job progress updated', {
    jobId: job.id,
    type: job.data.type,
    progress
  });
});

worker.on('error', (error: Error) => {
  logger.error('Worker error', {
    error: error.message,
    stack: error.stack
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  
  try {
    await worker.close();
    logger.info('Worker closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown', { error: error.message });
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  
  try {
    await worker.close();
    logger.info('Worker closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during worker shutdown', { error: error.message });
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack
  });
  process.exit(1);
});

// Start the HTTP server
const PORT = config.FE_TYPEFIX_PORT || 3007;
app.listen(PORT, () => {
  logger.info(`Fe-typefix service started on port ${PORT}`);
});

// Log startup information
logger.info('Fe-typefix worker initialized', {
  port: PORT,
  concurrency: config.WORKER_CONCURRENCY || 2,
  redisHost: config.REDIS_HOST,
  redisPort: config.REDIS_PORT,
  nodeEnv: config.NODE_ENV
});

export { worker, app };