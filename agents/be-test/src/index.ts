import express from 'express';
import { Worker } from 'bullmq';
import { logger } from '@shared/utils/logger';
import { redis } from '@shared/utils/redis';
import { validateJobData } from '@shared/utils/validation';
import { tracer } from '@shared/utils/tracing';
import { metrics } from '@shared/utils/metrics';
import { beTestGenerator } from './generator';
import type { BeTestJobData } from '@shared/types/queues';

const app = express();
const PORT = process.env.PORT || 3008;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'be-test', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    processed: beTestGenerator.getProcessedCount(),
    errors: beTestGenerator.getErrorCount(),
    uptime: process.uptime()
  });
});

// Create worker for be-test queue
const worker = new Worker<BeTestJobData>(
  'be-test',
  async (job) => {
    const span = tracer.startSpan('be-test-job', {
      attributes: {
        'job.id': job.id!,
        'job.name': job.name,
        'user.story.id': job.data.userStory.id
      }
    });

    try {
      logger.info('Processing be-test job', {
        jobId: job.id,
        userStoryId: job.data.userStory.id,
        testTypes: job.data.testTypes
      });

      // Validate job data
      const validationResult = validateJobData('be-test', job.data);
      if (!validationResult.success) {
        throw new Error(`Invalid job data: ${validationResult.error}`);
      }

      // Update job progress
      await job.updateProgress(10);

      // Generate backend tests
      const result = await beTestGenerator.generateTests(job.data);

      await job.updateProgress(90);

      logger.info('Successfully generated backend tests', {
        jobId: job.id,
        userStoryId: job.data.userStory.id,
        testsGenerated: result.tests.length,
        coverage: result.coverage
      });

      // Record metrics
      metrics.increment('be_test.jobs.completed');
      metrics.histogram('be_test.generation.duration', Date.now() - job.timestamp);
      metrics.gauge('be_test.coverage.percentage', result.coverage);

      await job.updateProgress(100);
      span.setStatus({ code: 1 }); // OK
      
      return result;
    } catch (error) {
      logger.error('Error processing be-test job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      metrics.increment('be_test.jobs.failed');
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.BE_TEST_CONCURRENCY || '2'),
    removeOnComplete: parseInt(process.env.REMOVE_ON_COMPLETE || '100'),
    removeOnFail: parseInt(process.env.REMOVE_ON_FAIL || '50')
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Be-test job completed', {
    jobId: job.id,
    duration: Date.now() - job.timestamp
  });
});

worker.on('failed', (job, err) => {
  logger.error('Be-test job failed', {
    jobId: job?.id,
    error: err.message,
    stack: err.stack
  });
});

worker.on('error', (err) => {
  logger.error('Be-test worker error', {
    error: err.message,
    stack: err.stack
  });
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

// Start server
app.listen(PORT, () => {
  logger.info(`Be-test agent listening on port ${PORT}`);
});

export { app, worker };