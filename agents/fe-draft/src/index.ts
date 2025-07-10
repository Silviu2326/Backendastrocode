import { Worker } from 'bullmq';
import express from 'express';
import { logger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { draftGenerator } from './generator';
import { config } from '../../../shared/config/env';
import { feDraftJobSchema, validateJobData } from '../../../shared/validation/jobSchemas';
import { TypedJob, QUEUE_TIMEOUTS } from '../types/queues';
import { TracingUtils, initializeTracing } from '../../../shared/tracing';
import { SpanStatusCode } from '@opentelemetry/api';

// Initialize tracing
initializeTracing();

const app = express();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-draft',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'fe-draft',
    processed: draftGenerator.getProcessedCount(),
    errors: draftGenerator.getErrorCount(),
    timestamp: new Date().toISOString()
  });
});

// Worker para generar borradores de componentes frontend
const feDraftWorker = new Worker<TypedJob<'fe-draft'>['data']>(
  'fe-draft-queue',
  async (job) => {
    const span = TracingUtils.createJobSpan(job.id!, 'fe-draft', 'generate-component-draft');
    const traceId = TracingUtils.getCurrentTraceId();
    
    logger.info('Processing fe-draft job', { 
      jobId: job.id, 
      traceId,
      data: job.data 
    });
    
    try {
      // Validate job.data with Zod before processing
      TracingUtils.addSpanAttributes({ 'job.validation.start': true });
      const validatedData = validateJobData(feDraftJobSchema, job.data);
      TracingUtils.addSpanAttributes({ 'job.validation.success': true });
      logger.info('Job data validation successful', { jobId: job.id, traceId });
      
      // Generate component draft with tracing
      TracingUtils.addSpanAttributes({ 'job.generation.start': true });
      const result = await draftGenerator.generateComponentDraft(validatedData);
      TracingUtils.addSpanAttributes({ 
        'job.generation.success': true,
        'job.result.size': JSON.stringify(result).length
      });
      
      TracingUtils.setSpanStatus(SpanStatusCode.OK);
      logger.info('Draft generation completed', { jobId: job.id, traceId });
      return result;
    } catch (error) {
      TracingUtils.recordException(error as Error);
      TracingUtils.addSpanAttributes({ 'job.error': true });
      logger.error('Draft generation failed', { 
        jobId: job.id, 
        traceId,
        error: error.message 
      });
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redisConnection,
    concurrency: config.WORKER_CONCURRENCY || 3,
    removeOnComplete: 10,
    removeOnFail: 50,
    settings: {
      stalledInterval: 30 * 1000,
      maxStalledCount: 1,
    },
    defaultJobOptions: {
      removeOnComplete: 10,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      // Add timeout from configuration
      timeout: QUEUE_TIMEOUTS['fe-draft'],
    },
  }
);

// Event listeners
feDraftWorker.on('completed', (job) => {
  logger.info('Draft worker completed job', { jobId: job.id });
});

feDraftWorker.on('failed', (job, err) => {
  logger.error('Draft worker failed job', { jobId: job?.id, error: err.message });
});

feDraftWorker.on('error', (err) => {
  logger.error('Draft worker error', { error: err.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down fe-draft worker...');
  await feDraftWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Shutting down fe-draft worker...');
  await feDraftWorker.close();
  process.exit(0);
});

const PORT = config.FE_DRAFT_PORT || 3011;

app.listen(PORT, () => {
  logger.info(`FE Draft service started on port ${PORT}`);
});

export { feDraftWorker };