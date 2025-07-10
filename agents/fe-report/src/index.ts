import { Worker, Job } from 'bullmq';
import express from 'express';
import { FeReportGenerator } from './generator';
import { ContextualLogger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { config } from '../../../shared/config/env';

const app = express();
const logger = new ContextualLogger('fe-report-worker');
const generator = new FeReportGenerator();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-report',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const worker = new Worker('fe-report', async () => {}, { connection: redisConnection });
    const waiting = await worker.getWaiting();
    const active = await worker.getActive();
    const completed = await worker.getCompleted();
    const failed = await worker.getFailed();
    
    res.json({
      service: 'fe-report',
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
async function processReportJob(job: Job): Promise<any> {
  const jobLogger = logger.withContext({ 
    jobId: job.id, 
    jobType: job.data.type,
    project: job.data.project?.name 
  });
  
  jobLogger.info('Processing report job', {
    type: job.data.type,
    project: job.data.project?.name,
    storyId: job.data.userStory?.id,
    format: job.data.requirements?.format
  });
  
  try {
    let result;
    
    switch (job.data.type) {
      case 'comprehensive':
        result = await generator.generateComprehensiveReport(job.data);
        break;
        
      case 'metrics':
        result = await generator.generateMetricsReport(job.data);
        break;
        
      case 'performance':
        result = await generator.generatePerformanceReport(job.data);
        break;
        
      default:
        throw new Error(`Unknown report job type: ${job.data.type}`);
    }
    
    jobLogger.info('Report job completed successfully', {
      type: job.data.type,
      reportPath: result.reportPath,
      format: result.format,
      totalComponents: result.metadata?.totalComponents || 0,
      reportSize: result.metadata?.reportSize || 0
    });
    
    // Update job progress
    await job.updateProgress(100);
    
    return {
      success: true,
      type: job.data.type,
      project: job.data.project,
      result,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    jobLogger.error('Report job failed', {
      error: error.message,
      stack: error.stack,
      type: job.data.type,
      project: job.data.project?.name
    });
    
    throw error;
  }
}

// Create and configure the worker
const worker = new Worker('fe-report', processReportJob, {
  connection: redisConnection,
  concurrency: config.WORKER_CONCURRENCY || 1, // Reports are resource-intensive
  removeOnComplete: config.REMOVE_COMPLETED_JOBS ? 5 : false,
  removeOnFail: config.REMOVE_FAILED_JOBS ? 3 : false,
  settings: {
    stalledInterval: 60000, // 1 minute
    maxStalledCount: 1,
    retryProcessDelay: 10000 // 10 seconds
  }
});

// Worker event handlers
worker.on('ready', () => {
  logger.info('Fe-report worker is ready and waiting for jobs');
});

worker.on('active', (job: Job) => {
  logger.info('Job started', {
    jobId: job.id,
    type: job.data.type,
    project: job.data.project?.name,
    format: job.data.requirements?.format,
    attempt: job.attemptsMade + 1
  });
});

worker.on('completed', (job: Job, result: any) => {
  logger.info('Job completed successfully', {
    jobId: job.id,
    type: job.data.type,
    project: job.data.project?.name,
    duration: Date.now() - job.timestamp,
    reportPath: result.result?.reportPath,
    reportSize: result.result?.metadata?.reportSize || 0
  });
});

worker.on('failed', (job: Job | undefined, error: Error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    project: job?.data?.project?.name,
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
const PORT = config.FE_REPORT_PORT || 3008;
app.listen(PORT, () => {
  logger.info(`Fe-report service started on port ${PORT}`);
});

// Log startup information
logger.info('Fe-report worker initialized', {
  port: PORT,
  concurrency: config.WORKER_CONCURRENCY || 1,
  redisHost: config.REDIS_HOST,
  redisPort: config.REDIS_PORT,
  nodeEnv: config.NODE_ENV
});

export { worker, app };