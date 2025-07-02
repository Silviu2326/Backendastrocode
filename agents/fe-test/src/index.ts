import { Worker } from 'bullmq';
import express from 'express';
import { ContextualLogger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { config } from '../../../shared/config/env';
import { FeTestGenerator } from './generator';

const logger = new ContextualLogger('fe-test-worker');
const app = express();
const generator = new FeTestGenerator();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-test',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'fe-test',
    processed: worker.opts.metrics?.completed || 0,
    failed: worker.opts.metrics?.failed || 0,
    active: worker.opts.metrics?.active || 0,
    waiting: worker.opts.metrics?.waiting || 0
  });
});

// Create BullMQ worker
const worker = new Worker(
  'fe-test',
  async (job) => {
    const jobLogger = logger.withContext({ 
      jobId: job.id,
      storyId: job.data.userStory?.id 
    });

    jobLogger.info('Processing fe-test job', {
      component: job.data.component?.name,
      testingFramework: job.data.project?.testingFramework,
      requirements: job.data.requirements
    });

    try {
      let result;
      
      switch (job.data.operation || 'generate') {
        case 'generate':
          result = await generator.generateTests(job.data);
          break;
        case 'update':
          result = await generator.updateExistingTests(job.data, job.data.existingTestPaths || []);
          break;
        case 'suite':
          result = await generator.generateTestSuite(job.data);
          break;
        default:
          throw new Error(`Unknown operation: ${job.data.operation}`);
      }

      jobLogger.info('fe-test job completed successfully', {
        testsGenerated: result.metrics.testsGenerated,
        expectedCoverage: result.coverage.expectedCoverage,
        testFiles: Object.keys(result.testFiles)
      });

      // Update job progress
      await job.updateProgress(100);

      return result;
    } catch (error) {
      jobLogger.error('fe-test job failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: config.WORKER_CONCURRENCY || 2,
    removeOnComplete: config.KEEP_COMPLETED_JOBS || 10,
    removeOnFail: config.KEEP_FAILED_JOBS || 50,
    maxStalledCount: 3,
    stalledInterval: 30000,
    retryProcessDelay: 5000
  }
);

// Worker event handlers
worker.on('ready', () => {
  logger.info('fe-test worker is ready and waiting for jobs');
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
    testsGenerated: result.metrics?.testsGenerated
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
const PORT = config.FE_TEST_PORT || 3006;
app.listen(PORT, () => {
  logger.info(`fe-test service started on port ${PORT}`);
});

export { worker, app };