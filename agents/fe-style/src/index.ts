import { Worker } from 'bullmq';
import express from 'express';
import { ContextualLogger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { config } from '../../../shared/config/env';
import { FeStyleGenerator } from './generator';
import { feStyleJobSchema, validateJobData } from '../../../shared/validation/jobSchemas';
import { TypedJob, QUEUE_TIMEOUTS } from '../types/queues';
import { TracingUtils, initializeTracing } from '../../../shared/tracing';
import { SpanStatusCode } from '@opentelemetry/api';

// Initialize tracing
initializeTracing();

const logger = new ContextualLogger('fe-style-worker');
const app = express();
const generator = new FeStyleGenerator();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-style',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'fe-style',
    processed: worker.opts.metrics?.completed || 0,
    failed: worker.opts.metrics?.failed || 0,
    active: worker.opts.metrics?.active || 0,
    waiting: worker.opts.metrics?.waiting || 0
  });
});

// Create BullMQ worker
const worker = new Worker<TypedJob<'fe-style'>['data']>(
  'fe-style',
  async (job) => {
    const span = TracingUtils.createJobSpan(job.id!, 'fe-style', job.data.operation || 'generate');
    const traceId = TracingUtils.getCurrentTraceId();
    
    const jobLogger = logger.withContext({ 
      jobId: job.id,
      traceId,
      storyId: job.data.userStory?.id 
    });

    jobLogger.info('Processing fe-style job', {
      component: job.data.component?.name,
      styling: job.data.project?.styling
    });

    try {
      // Validate job.data with Zod before processing
      TracingUtils.addSpanAttributes({ 'job.validation.start': true });
      const validatedData = validateJobData(feStyleJobSchema, job.data);
      TracingUtils.addSpanAttributes({ 'job.validation.success': true });
      jobLogger.info('Job data validation successful', { jobId: job.id });
      
      let result;
      TracingUtils.addSpanAttributes({ 
        'job.generation.start': true,
        'job.operation': validatedData.operation || 'generate'
      });
      
      switch (validatedData.operation || 'generate') {
        case 'generate':
          result = await generator.generateComponentStyles(validatedData);
          break;
        case 'enhance':
          result = await generator.enhanceExistingStyles(validatedData);
          break;
        case 'optimize':
          result = await generator.optimizePerformance(validatedData);
          break;
        default:
          throw new Error(`Unknown operation: ${validatedData.operation}`);
      }

      jobLogger.info('fe-style job completed successfully', {
        stylePath: result.stylePath,
        metrics: result.metrics
      });

      // Update job progress
      await job.updateProgress(100);
      TracingUtils.addSpanAttributes({ 
        'job.progress': 100,
        'job.generation.success': true,
        'job.result.size': JSON.stringify(result).length
      });
      
      TracingUtils.setSpanStatus(SpanStatusCode.OK);
      return result;
    } catch (error) {
      TracingUtils.recordException(error as Error);
      TracingUtils.addSpanAttributes({ 'job.error': true });
      jobLogger.error('fe-style job failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redisConnection,
    concurrency: config.WORKER_CONCURRENCY || 2,
    removeOnComplete: config.KEEP_COMPLETED_JOBS || 10,
    removeOnFail: config.KEEP_FAILED_JOBS || 50,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
    defaultJobOptions: {
      removeOnComplete: config.KEEP_COMPLETED_JOBS || 10,
      removeOnFail: config.KEEP_FAILED_JOBS || 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      timeout: QUEUE_TIMEOUTS['fe-style'],
    },
  }
);

// Worker event handlers
worker.on('ready', () => {
  logger.info('fe-style worker is ready and waiting for jobs');
});

worker.on('active', (job) => {
  logger.info('Job started', { 
    jobId: job.id,
    component: job.data.component?.name 
  });
});

worker.on('completed', (job, result) => {
  logger.info('Job completed', { 
    jobId: job.id,
    component: job.data.component?.name,
    stylePath: result.stylePath
  });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { 
    jobId: job?.id,
    component: job?.data?.component?.name,
    error: err.message 
  });
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message, stack: err.stack });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

// Start HTTP server
const PORT = config.FE_STYLE_PORT || 3004;
app.listen(PORT, () => {
  logger.info(`fe-style service started on port ${PORT}`);
});

export { worker, app };