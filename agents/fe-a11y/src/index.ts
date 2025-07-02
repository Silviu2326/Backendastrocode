import { Worker } from 'bullmq';
import express from 'express';
import { ContextualLogger } from '../../../shared/utils/logger';
import { redisConnection } from '../../../shared/config/redis';
import { config } from '../../../shared/config/env';
import { FeA11yGenerator } from './generator';

const logger = new ContextualLogger('fe-a11y-worker');
const app = express();
const generator = new FeA11yGenerator();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'fe-a11y',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    service: 'fe-a11y',
    processed: worker.opts.metrics?.completed || 0,
    failed: worker.opts.metrics?.failed || 0,
    active: worker.opts.metrics?.active || 0,
    waiting: worker.opts.metrics?.waiting || 0
  });
});

// Create BullMQ worker
const worker = new Worker(
  'fe-a11y',
  async (job) => {
    const jobLogger = logger.withContext({ 
      jobId: job.id,
      storyId: job.data.userStory?.id 
    });

    jobLogger.info('Processing fe-a11y job', {
      component: job.data.component?.name,
      targetLevel: job.data.project?.targetLevel
    });

    try {
      let result;
      
      switch (job.data.operation || 'enhance') {
        case 'enhance':
          result = await generator.enhanceAccessibility(job.data);
          break;
        case 'audit':
          result = await generator.auditAccessibility(job.data);
          break;
        case 'fix':
          result = await generator.fixAccessibilityIssues(job.data, job.data.specificIssues || []);
          break;
        default:
          throw new Error(`Unknown operation: ${job.data.operation}`);
      }

      jobLogger.info('fe-a11y job completed successfully', {
        componentPath: result.componentPath,
        accessibilityScore: result.metrics.accessibilityScore,
        compliancePercentage: result.metrics.compliancePercentage
      });

      // Update job progress
      await job.updateProgress(100);

      return result;
    } catch (error) {
      jobLogger.error('fe-a11y job failed', {
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
  logger.info('fe-a11y worker is ready and waiting for jobs');
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
    accessibilityScore: result.metrics?.accessibilityScore
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
const PORT = config.FE_A11Y_PORT || 3005;
app.listen(PORT, () => {
  logger.info(`fe-a11y service started on port ${PORT}`);
});

export { worker, app };