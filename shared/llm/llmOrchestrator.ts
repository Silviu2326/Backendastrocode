import { logger } from '../utils/logger';
import { promptEngine, PromptContext } from './promptEngine';

interface LLMProvider {
  name: string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

interface LLMRequest {
  prompt: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  context?: Record<string, any>;
}

interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  responseTime: number;
  metadata: Record<string, any>;
}

interface LLMJob {
  id: string;
  templateName: string;
  context: PromptContext;
  provider?: string;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

class LLMOrchestrator {
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string = 'openai';
  private requestQueue: LLMJob[] = [];
  private activeRequests: Map<string, LLMJob> = new Map();
  private rateLimits: Map<string, { requests: number; resetTime: number }> = new Map();
  private circuitBreakers: Map<string, { failures: number; lastFailure: number; isOpen: boolean }> = new Map();

  constructor() {
    this.initializeProviders();
    this.startQueueProcessor();
  }

  /**
   * Inicializa los proveedores de LLM
   */
  private initializeProviders(): void {
    // OpenAI
    this.providers.set('openai', {
      name: 'OpenAI',
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 60000
    });

    // Anthropic Claude
    this.providers.set('anthropic', {
      name: 'Anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 60000
    });

    // Google Gemini
    this.providers.set('google', {
      name: 'Google',
      apiKey: process.env.GOOGLE_API_KEY || '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1',
      model: 'gemini-pro',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 60000
    });

    // Ollama (local)
    this.providers.set('ollama', {
      name: 'Ollama',
      apiKey: '',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: 'codellama:13b',
      maxTokens: 4000,
      temperature: 0.7,
      timeout: 120000
    });

    logger.info('LLM providers initialized', {
      providers: Array.from(this.providers.keys()),
      defaultProvider: this.defaultProvider
    });
  }

  /**
   * Genera contenido usando una plantilla específica
   */
  async generateFromTemplate(
    templateName: string,
    context: PromptContext,
    options: {
      provider?: string;
      priority?: number;
      maxRetries?: number;
    } = {}
  ): Promise<LLMResponse> {
    try {
      // Renderizar prompt
      const { prompt, metadata } = await promptEngine.renderPrompt(templateName, context);

      // Crear job
      const job: LLMJob = {
        id: this.generateJobId(),
        templateName,
        context,
        provider: options.provider || this.defaultProvider,
        priority: options.priority || 1,
        retries: 0,
        maxRetries: options.maxRetries || 3,
        createdAt: new Date()
      };

      // Ejecutar request
      const response = await this.executeRequest({
        prompt,
        provider: job.provider,
        context: { ...metadata, jobId: job.id }
      });

      logger.info('LLM generation completed', {
        jobId: job.id,
        templateName,
        provider: job.provider,
        responseTime: response.responseTime,
        totalTokens: response.usage.totalTokens
      });

      return response;

    } catch (error) {
      logger.error('Error in LLM generation', {
        templateName,
        provider: options.provider,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Ejecuta una request directa al LLM
   */
  async executeRequest(request: LLMRequest): Promise<LLMResponse> {
    const provider = this.providers.get(request.provider || this.defaultProvider);
    if (!provider) {
      throw new Error(`Provider '${request.provider}' not found`);
    }

    // Verificar circuit breaker
    if (this.isCircuitBreakerOpen(provider.name)) {
      throw new Error(`Circuit breaker is open for provider '${provider.name}'`);
    }

    // Verificar rate limits
    await this.checkRateLimit(provider.name);

    const startTime = Date.now();

    try {
      let response: LLMResponse;

      switch (provider.name.toLowerCase()) {
        case 'openai':
          response = await this.callOpenAI(provider, request);
          break;
        case 'anthropic':
          response = await this.callAnthropic(provider, request);
          break;
        case 'google':
          response = await this.callGoogle(provider, request);
          break;
        case 'ollama':
          response = await this.callOllama(provider, request);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider.name}`);
      }

      response.responseTime = Date.now() - startTime;
      response.provider = provider.name;

      // Reset circuit breaker en caso de éxito
      this.resetCircuitBreaker(provider.name);

      // Actualizar rate limits
      this.updateRateLimit(provider.name);

      return response;

    } catch (error) {
      // Actualizar circuit breaker
      this.updateCircuitBreaker(provider.name);

      logger.error('LLM request failed', {
        provider: provider.name,
        model: provider.model,
        error: error.message,
        responseTime: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Llamada a OpenAI
   */
  private async callOpenAI(provider: LLMProvider, request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model || provider.model,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens || provider.maxTokens,
        temperature: request.temperature ?? provider.temperature
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];

    return {
      content: choice.message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      },
      model: data.model,
      provider: provider.name,
      finishReason: choice.finish_reason,
      responseTime: 0, // Se asigna después
      metadata: {
        requestId: data.id,
        created: data.created
      }
    };
  }

  /**
   * Llamada a Anthropic Claude
   */
  private async callAnthropic(provider: LLMProvider, request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${provider.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': provider.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model || provider.model,
        max_tokens: request.maxTokens || provider.maxTokens,
        temperature: request.temperature ?? provider.temperature,
        system: request.systemPrompt,
        messages: [
          { role: 'user', content: request.prompt }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      },
      model: data.model,
      provider: provider.name,
      finishReason: data.stop_reason,
      responseTime: 0,
      metadata: {
        requestId: data.id,
        type: data.type
      }
    };
  }

  /**
   * Llamada a Google Gemini
   */
  private async callGoogle(provider: LLMProvider, request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(
      `${provider.baseUrl}/models/${request.model || provider.model}:generateContent?key=${provider.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: request.prompt }
              ]
            }
          ],
          generationConfig: {
            temperature: request.temperature ?? provider.temperature,
            maxOutputTokens: request.maxTokens || provider.maxTokens
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const candidate = data.candidates[0];

    return {
      content: candidate.content.parts[0].text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0
      },
      model: request.model || provider.model,
      provider: provider.name,
      finishReason: candidate.finishReason?.toLowerCase() || 'stop',
      responseTime: 0,
      metadata: {
        safetyRatings: candidate.safetyRatings
      }
    };
  }

  /**
   * Llamada a Ollama (local)
   */
  private async callOllama(provider: LLMProvider, request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${provider.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model || provider.model,
        prompt: request.prompt,
        system: request.systemPrompt,
        options: {
          temperature: request.temperature ?? provider.temperature,
          num_predict: request.maxTokens || provider.maxTokens
        },
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    return {
      content: data.response,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      model: data.model,
      provider: provider.name,
      finishReason: data.done ? 'stop' : 'length',
      responseTime: 0,
      metadata: {
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
        promptEvalDuration: data.prompt_eval_duration,
        evalDuration: data.eval_duration
      }
    };
  }

  /**
   * Verifica si el circuit breaker está abierto
   */
  private isCircuitBreakerOpen(providerName: string): boolean {
    const breaker = this.circuitBreakers.get(providerName);
    if (!breaker) return false;

    if (breaker.isOpen) {
      // Verificar si es tiempo de intentar de nuevo (half-open)
      const timeSinceLastFailure = Date.now() - breaker.lastFailure;
      if (timeSinceLastFailure > 60000) { // 1 minuto
        breaker.isOpen = false;
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Actualiza el circuit breaker
   */
  private updateCircuitBreaker(providerName: string): void {
    const breaker = this.circuitBreakers.get(providerName) || {
      failures: 0,
      lastFailure: 0,
      isOpen: false
    };

    breaker.failures++;
    breaker.lastFailure = Date.now();

    // Abrir circuit breaker después de 3 fallos
    if (breaker.failures >= 3) {
      breaker.isOpen = true;
      logger.warn('Circuit breaker opened', {
        provider: providerName,
        failures: breaker.failures
      });
    }

    this.circuitBreakers.set(providerName, breaker);
  }

  /**
   * Resetea el circuit breaker
   */
  private resetCircuitBreaker(providerName: string): void {
    this.circuitBreakers.set(providerName, {
      failures: 0,
      lastFailure: 0,
      isOpen: false
    });
  }

  /**
   * Verifica rate limits
   */
  private async checkRateLimit(providerName: string): Promise<void> {
    const limit = this.rateLimits.get(providerName);
    if (!limit) return;

    const now = Date.now();
    if (now < limit.resetTime && limit.requests >= this.getProviderRateLimit(providerName)) {
      const waitTime = limit.resetTime - now;
      logger.warn('Rate limit reached, waiting', {
        provider: providerName,
        waitTime
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Actualiza rate limits
   */
  private updateRateLimit(providerName: string): void {
    const now = Date.now();
    const limit = this.rateLimits.get(providerName) || {
      requests: 0,
      resetTime: now + 60000 // 1 minuto
    };

    if (now >= limit.resetTime) {
      limit.requests = 1;
      limit.resetTime = now + 60000;
    } else {
      limit.requests++;
    }

    this.rateLimits.set(providerName, limit);
  }

  /**
   * Obtiene el límite de rate para un proveedor
   */
  private getProviderRateLimit(providerName: string): number {
    const limits = {
      openai: 60,
      anthropic: 50,
      google: 60,
      ollama: 100
    };
    return limits[providerName.toLowerCase()] || 60;
  }

  /**
   * Inicia el procesador de cola
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      this.processQueue();
    }, 1000);
  }

  /**
   * Procesa la cola de requests
   */
  private async processQueue(): Promise<void> {
    if (this.requestQueue.length === 0) return;

    // Ordenar por prioridad
    this.requestQueue.sort((a, b) => b.priority - a.priority);

    const job = this.requestQueue.shift();
    if (!job) return;

    try {
      job.startedAt = new Date();
      this.activeRequests.set(job.id, job);

      const response = await this.generateFromTemplate(
        job.templateName,
        job.context,
        { provider: job.provider }
      );

      job.completedAt = new Date();
      this.activeRequests.delete(job.id);

      logger.info('Queue job completed', {
        jobId: job.id,
        templateName: job.templateName,
        provider: job.provider,
        duration: job.completedAt.getTime() - job.startedAt!.getTime()
      });

    } catch (error) {
      job.error = error.message;
      job.retries++;

      if (job.retries < job.maxRetries) {
        // Reencolar con delay exponencial
        setTimeout(() => {
          this.requestQueue.push(job);
        }, Math.pow(2, job.retries) * 1000);
      } else {
        logger.error('Queue job failed permanently', {
          jobId: job.id,
          templateName: job.templateName,
          error: job.error,
          retries: job.retries
        });
      }

      this.activeRequests.delete(job.id);
    }
  }

  /**
   * Genera un ID único para el job
   */
  private generateJobId(): string {
    return `llm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtiene estadísticas del orquestador
   */
  getStats(): Record<string, any> {
    return {
      providers: Array.from(this.providers.keys()),
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      circuitBreakers: Object.fromEntries(this.circuitBreakers),
      rateLimits: Object.fromEntries(this.rateLimits)
    };
  }

  /**
   * Configura un proveedor
   */
  setProvider(name: string, config: Partial<LLMProvider>): void {
    const existing = this.providers.get(name) || {} as LLMProvider;
    this.providers.set(name, { ...existing, ...config, name });
    logger.info('Provider configured', { name, config: Object.keys(config) });
  }

  /**
   * Establece el proveedor por defecto
   */
  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider '${name}' not found`);
    }
    this.defaultProvider = name;
    logger.info('Default provider changed', { provider: name });
  }
}

export const llmOrchestrator = new LLMOrchestrator();
export { LLMProvider, LLMRequest, LLMResponse, LLMJob };