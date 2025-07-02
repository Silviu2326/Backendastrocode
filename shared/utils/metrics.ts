// Simple metrics collection utility
class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  // Increment a counter
  increment(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  // Record a histogram value
  histogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
  }

  // Set a gauge value
  gauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  // Get counter value
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  // Get histogram statistics
  getHistogram(name: string): { count: number; sum: number; avg: number; min: number; max: number } | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) {
      return null;
    }

    const sum = values.reduce((a, b) => a + b, 0);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = sum / values.length;

    return { count: values.length, sum, avg, min, max };
  }

  // Get gauge value
  getGauge(name: string): number | null {
    return this.gauges.get(name) || null;
  }

  // Get all metrics
  getAllMetrics(): {
    counters: Record<string, number>;
    histograms: Record<string, any>;
    gauges: Record<string, number>;
  } {
    const counters: Record<string, number> = {};
    const histograms: Record<string, any> = {};
    const gauges: Record<string, number> = {};

    this.counters.forEach((value, key) => {
      counters[key] = value;
    });

    this.histograms.forEach((values, key) => {
      histograms[key] = this.getHistogram(key);
    });

    this.gauges.forEach((value, key) => {
      gauges[key] = value;
    });

    return { counters, histograms, gauges };
  }

  // Reset all metrics
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }
}

// Export singleton instance
export const metrics = new MetricsCollector();

// Export class for creating additional instances if needed
export { MetricsCollector };