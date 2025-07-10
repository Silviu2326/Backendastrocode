// Simple tracing utility for monitoring and debugging
interface SpanAttributes {
  [key: string]: string | number | boolean;
}

interface SpanStatus {
  code: number; // 0 = UNSET, 1 = OK, 2 = ERROR
  message?: string;
}

class Span {
  private name: string;
  private startTime: number;
  private endTime?: number;
  private attributes: SpanAttributes = {};
  private status?: SpanStatus;
  private events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }> = [];

  constructor(name: string, attributes?: SpanAttributes) {
    this.name = name;
    this.startTime = Date.now();
    if (attributes) {
      this.attributes = { ...attributes };
    }
  }

  // Set span attributes
  setAttributes(attributes: SpanAttributes): void {
    Object.assign(this.attributes, attributes);
  }

  // Set span status
  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  // Add an event to the span
  addEvent(name: string, attributes?: SpanAttributes): void {
    this.events.push({
      name,
      timestamp: Date.now(),
      attributes
    });
  }

  // Record an exception
  recordException(error: Error): void {
    this.addEvent('exception', {
      'exception.type': error.constructor.name,
      'exception.message': error.message,
      'exception.stacktrace': error.stack || ''
    });
  }

  // End the span
  end(): void {
    if (!this.endTime) {
      this.endTime = Date.now();
    }
  }

  // Get span duration
  getDuration(): number {
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }

  // Get span data
  getData(): {
    name: string;
    startTime: number;
    endTime?: number;
    duration: number;
    attributes: SpanAttributes;
    status?: SpanStatus;
    events: Array<{ name: string; timestamp: number; attributes?: SpanAttributes }>;
  } {
    return {
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.getDuration(),
      attributes: this.attributes,
      status: this.status,
      events: this.events
    };
  }
}

class Tracer {
  private spans: Span[] = [];

  // Start a new span
  startSpan(name: string, attributes?: SpanAttributes): Span {
    const span = new Span(name, attributes);
    this.spans.push(span);
    return span;
  }

  // Get all spans
  getSpans(): Span[] {
    return this.spans;
  }

  // Get span data for all spans
  getAllSpanData(): Array<ReturnType<Span['getData']>> {
    return this.spans.map(span => span.getData());
  }

  // Clear all spans
  clear(): void {
    this.spans = [];
  }

  // Get active spans (not ended)
  getActiveSpans(): Span[] {
    return this.spans.filter(span => !span.getData().endTime);
  }

  // Get completed spans
  getCompletedSpans(): Span[] {
    return this.spans.filter(span => span.getData().endTime);
  }
}

// Export singleton instance
export const tracer = new Tracer();

// Export classes for creating additional instances if needed
export { Tracer, Span };
export type { SpanAttributes, SpanStatus };