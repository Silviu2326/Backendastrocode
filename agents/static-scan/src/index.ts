import express from 'express';
import { Worker } from 'bullmq';
import { logger } from '@shared/utils/logger';
import { redis } from '@shared/utils/redis';
import { validateJobData } from '@shared/utils/validation';
import { tracer } from '@shared/utils/tracing';
import { metrics } from '@shared/utils/metrics';
import { staticScanner } from './scanner';
import type { StaticScanJobData } from '@shared/types/queues';

const app = express();
const PORT = process.env.PORT || 3011;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'static-scan', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    processed: staticScanner.getProcessedCount(),
    errors: staticScanner.getErrorCount(),
    uptime: process.uptime()
  });
});

// Create worker for static-scan queue
const worker = new Worker<StaticScanJobData>(
  'static-scan',
  async (job) => {
    const span = tracer.startSpan('static-scan-job', {
      attributes: {
        'job.id': job.id!,
        'job.name': job.name,
        'project.id': job.data.project.id
      }
    });

    try {
      logger.info('Processing static-scan job', {
        jobId: job.id,
        projectId: job.data.project.id,
        scanTypes: job.data.scanTypes
      });

      // Validate job data
      const validationResult = validateJobData('static-scan', job.data);
      if (!validationResult.success) {
        throw new Error(`Invalid job data: ${validationResult.error}`);
      }

      // Update job progress
      await job.updateProgress(10);

      // Perform static code analysis
      const result = await staticScanner.performScan(job.data);

      await job.updateProgress(80);

      // If there are critical issues or security vulnerabilities, send to fix-bot
      if (!result.success && result.fixPatches.length > 0) {
        await sendToFixBot(result, job.data);
      }

      await job.updateProgress(90);

      logger.info('Successfully completed static scan', {
        jobId: job.id,
        projectId: job.data.project.id,
        success: result.success,
        totalIssues: result.summary.totalIssues,
        criticalIssues: result.summary.criticalIssues,
        securityIssues: result.summary.securityIssues,
        fixPatches: result.fixPatches.length
      });

      // Record metrics
      metrics.increment('static_scan.jobs.completed');
      metrics.histogram('static_scan.scan.duration', Date.now() - job.timestamp);
      metrics.gauge('static_scan.issues.total', result.summary.totalIssues);
      metrics.gauge('static_scan.issues.critical', result.summary.criticalIssues);
      metrics.gauge('static_scan.issues.security', result.summary.securityIssues);

      await job.updateProgress(100);
      span.setStatus({ code: 1 }); // OK
      
      return result;
    } catch (error) {
      logger.error('Error processing static-scan job', {
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      metrics.increment('static_scan.jobs.failed');
      span.recordException(error as Error);
      span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
      
      throw error;
    } finally {
      span.end();
    }
  },
  {
    connection: redis,
    concurrency: parseInt(process.env.STATIC_SCAN_CONCURRENCY || '1'),
    removeOnComplete: parseInt(process.env.REMOVE_ON_COMPLETE || '100'),
    removeOnFail: parseInt(process.env.REMOVE_ON_FAIL || '50')
  }
);

// Function to send fixes to fix-bot
async function sendToFixBot(scanResult: any, jobData: StaticScanJobData): Promise<void> {
  try {
    // Create fix-bot job data
    const fixBotData = {
      projectId: jobData.project.id,
      projectPath: jobData.projectPath,
      issues: scanResult.issues.filter((issue: any) => 
        issue.severity === 'critical' || issue.category === 'security'
      ),
      fixPatches: scanResult.fixPatches,
      recommendations: scanResult.recommendations
    };

    // In a real implementation, this would enqueue a job to the fix-bot queue
    logger.info('Sending critical issues to fix-bot', {
      projectId: jobData.project.id,
      criticalIssues: fixBotData.issues.length,
      fixPatches: fixBotData.fixPatches.length
    });

    // TODO: Implement actual fix-bot queue integration
    // const fixBotQueue = new Queue('fix-bot', { connection: redis });
    // await fixBotQueue.add('fix-critical-issues', fixBotData);
    
  } catch (error) {
    logger.error('Failed to send issues to fix-bot', {
      projectId: jobData.project.id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Static-scan job completed', {
    jobId: job.id,
    duration: Date.now() - job.timestamp
  });
});

worker.on('failed', (job, err) => {
  logger.error('Static-scan job failed', {
    jobId: job?.id,
    error: err.message,
    stack: err.stack
  });
});

worker.on('error', (err) => {
  logger.error('Static-scan worker error', {
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
  logger.info(`Static-scan agent listening on port ${PORT}`);
});

export { app, worker };