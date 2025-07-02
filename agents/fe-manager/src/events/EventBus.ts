import { EventEmitter } from 'eventemitter3';
import { connect, NatsConnection, StringCodec, JetStreamManager, JetStreamClient } from 'nats';
import { logger } from '../../../../shared/utils/logger';

export interface StoryEvent {
  type: 'story.received' | 'story.processed' | 'story.failed';
  storyId: string;
  projectId: string;
  pageId: string;
  timestamp: Date;
  metadata?: any;
}

export interface JobEvent {
  type: 'draft.started' | 'draft.completed' | 'logic.started' | 'logic.completed' | 
        'style.started' | 'style.completed' | 'a11y.started' | 'a11y.completed' |
        'test.started' | 'test.completed' | 'typefix.started' | 'typefix.completed' |
        'report.started' | 'report.completed';
  jobId: string;
  storyId: string;
  projectId: string;
  timestamp: Date;
  result?: any;
  error?: string;
}

export interface SystemEvent {
  type: 'system.overload' | 'system.healthy' | 'queue.backpressure' | 'tokens.limit';
  severity: 'info' | 'warning' | 'error';
  timestamp: Date;
  metadata: any;
}

export type FeManagerEvent = StoryEvent | JobEvent | SystemEvent;

class EventBus {
  private localEmitter: EventEmitter;
  private natsConnection: NatsConnection | null = null;
  private jetStream: JetStreamClient | null = null;
  private stringCodec = StringCodec();
  private isConnected = false;

  constructor() {
    this.localEmitter = new EventEmitter();
  }

  async initialize(natsUrl: string = 'nats://localhost:4222'): Promise<void> {
    try {
      this.natsConnection = await connect({ servers: natsUrl });
      const jsm = await this.natsConnection.jetstreamManager();
      this.jetStream = this.natsConnection.jetstream();
      
      // Create streams if they don't exist
      await this.createStreams(jsm);
      
      this.isConnected = true;
      logger.info('EventBus connected to NATS');
    } catch (error) {
      logger.error('Failed to connect to NATS', { error: error.message });
      // Fallback to local events only
      this.isConnected = false;
    }
  }

  private async createStreams(jsm: JetStreamManager): Promise<void> {
    const streams = [
      {
        name: 'FE_MANAGER_EVENTS',
        subjects: ['fe.manager.*'],
        retention: 'limits',
        max_age: 24 * 60 * 60 * 1000000000, // 24 hours in nanoseconds
        max_msgs: 10000
      },
      {
        name: 'SYSTEM_EVENTS',
        subjects: ['system.*'],
        retention: 'limits',
        max_age: 7 * 24 * 60 * 60 * 1000000000, // 7 days
        max_msgs: 50000
      }
    ];

    for (const streamConfig of streams) {
      try {
        await jsm.streams.add(streamConfig);
        logger.info(`Stream ${streamConfig.name} created or updated`);
      } catch (error) {
        if (!error.message.includes('already exists')) {
          logger.error(`Failed to create stream ${streamConfig.name}`, { error: error.message });
        }
      }
    }
  }

  async publish(event: FeManagerEvent): Promise<void> {
    const subject = this.getSubjectForEvent(event);
    const payload = JSON.stringify(event);

    // Always emit locally
    this.localEmitter.emit(event.type, event);

    // Publish to NATS if connected
    if (this.isConnected && this.jetStream) {
      try {
        await this.jetStream.publish(subject, this.stringCodec.encode(payload));
        logger.debug('Event published to NATS', { type: event.type, subject });
      } catch (error) {
        logger.error('Failed to publish event to NATS', { 
          type: event.type, 
          error: error.message 
        });
      }
    }
  }

  subscribe(eventType: string, handler: (event: FeManagerEvent) => void): void {
    this.localEmitter.on(eventType, handler);
  }

  async subscribeToNATS(subject: string, handler: (event: FeManagerEvent) => void): Promise<void> {
    if (!this.isConnected || !this.jetStream) {
      logger.warn('Cannot subscribe to NATS - not connected');
      return;
    }

    try {
      const consumer = await this.jetStream.consumers.get('FE_MANAGER_EVENTS', 'fe-manager-consumer');
      const messages = await consumer.consume();
      
      for await (const msg of messages) {
        try {
          const event = JSON.parse(this.stringCodec.decode(msg.data)) as FeManagerEvent;
          handler(event);
          msg.ack();
        } catch (error) {
          logger.error('Failed to process NATS message', { error: error.message });
          msg.nak();
        }
      }
    } catch (error) {
      logger.error('Failed to subscribe to NATS', { subject, error: error.message });
    }
  }

  private getSubjectForEvent(event: FeManagerEvent): string {
    if (event.type.startsWith('story.')) {
      return `fe.manager.story.${event.type.split('.')[1]}`;
    }
    if (event.type.includes('.')) {
      const [category, action] = event.type.split('.');
      return `fe.manager.${category}.${action}`;
    }
    if (event.type.startsWith('system.')) {
      return `system.${event.type.split('.')[1]}`;
    }
    return `fe.manager.${event.type}`;
  }

  async close(): Promise<void> {
    this.localEmitter.removeAllListeners();
    if (this.natsConnection) {
      await this.natsConnection.close();
      this.isConnected = false;
      logger.info('EventBus disconnected from NATS');
    }
  }

  // Health check
  isHealthy(): boolean {
    return this.isConnected || true; // Always healthy if using local events
  }
}

export const eventBus = new EventBus();