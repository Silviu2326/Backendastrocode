import { Job } from 'bullmq';

// Re-export types from the main queues.d.ts file
export * from '../../agents/types/queues';

// Import specific types for convenience
import type {
  BeDraftJobData,
  BeLogicJobData,
  BeTestJobData,
  BeTypefixJobData,
  BeManagerJobData,
  StaticScanJobData,
  QueueMap,
  QueueName,
  JobDataForQueue
} from '../../agents/types/queues';

// Re-export for easier imports
export type {
  BeDraftJobData,
  BeLogicJobData,
  BeTestJobData,
  BeTypefixJobData,
  BeManagerJobData,
  StaticScanJobData,
  QueueMap,
  QueueName,
  JobDataForQueue
};