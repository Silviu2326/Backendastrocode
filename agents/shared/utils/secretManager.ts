/**
 * Secret Manager - Secret-less Workers
 * Integrates with Doppler/Vault for runtime secret retrieval
 */

import { logger } from './logger';

export interface SecretConfig {
  provider: 'doppler' | 'vault' | 'aws-secrets' | 'azure-keyvault';
  endpoint?: string;
  token?: string;
  project?: string;
  environment?: string;
  namespace?: string;
}

export interface SecretMetadata {
  key: string;
  version?: string;
  lastUpdated?: Date;
  expiresAt?: Date;
  tags?: Record<string, string>;
}

export interface CachedSecret {
  value: string;
  metadata: SecretMetadata;
  cachedAt: Date;
  ttl: number;
}

export class SecretManager {
  private cache = new Map<string, CachedSecret>();
  private config: SecretConfig;
  private defaultTtl = 5 * 60 * 1000; // 5 minutes

  constructor(config: SecretConfig) {
    this.config = config;
  }

  /**
   * Get secret value with caching
   */
  async getSecret(key: string, options?: { 
    ttl?: number; 
    version?: string; 
    refresh?: boolean 
  }): Promise<string> {
    const cacheKey = `${key}:${options?.version || 'latest'}`;
    
    // Check cache first (unless refresh is requested)
    if (!options?.refresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && this.isCacheValid(cached)) {
        logger.debug('Secret retrieved from cache', { key });
        return cached.value;
      }
    }

    // Fetch from provider
    const secret = await this.fetchFromProvider(key, options?.version);
    
    // Cache the result
    this.cache.set(cacheKey, {
      value: secret.value,
      metadata: secret.metadata,
      cachedAt: new Date(),
      ttl: options?.ttl || this.defaultTtl
    });

    logger.info('Secret retrieved from provider', { 
      key, 
      provider: this.config.provider,
      version: options?.version 
    });

    return secret.value;
  }

  /**
   * Get multiple secrets at once
   */
  async getSecrets(keys: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    // Use Promise.allSettled to handle partial failures
    const promises = keys.map(async (key) => {
      try {
        const value = await this.getSecret(key);
        return { key, value, success: true };
      } catch (error) {
        logger.error('Failed to retrieve secret', { key, error });
        return { key, error, success: false };
      }
    });

    const settled = await Promise.allSettled(promises);
    
    settled.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        results[result.value.key] = result.value.value;
      }
    });

    return results;
  }

  /**
   * Fetch secret from the configured provider
   */
  private async fetchFromProvider(key: string, version?: string): Promise<{
    value: string;
    metadata: SecretMetadata;
  }> {
    switch (this.config.provider) {
      case 'doppler':
        return this.fetchFromDoppler(key);
      case 'vault':
        return this.fetchFromVault(key, version);
      case 'aws-secrets':
        return this.fetchFromAWSSecrets(key, version);
      case 'azure-keyvault':
        return this.fetchFromAzureKeyVault(key, version);
      default:
        throw new Error(`Unsupported secret provider: ${this.config.provider}`);
    }
  }

  /**
   * Fetch from Doppler
   */
  private async fetchFromDoppler(key: string): Promise<{
    value: string;
    metadata: SecretMetadata;
  }> {
    const token = this.config.token || process.env.DOPPLER_TOKEN;
    if (!token) {
      throw new Error('Doppler token not configured');
    }

    const url = `https://api.doppler.com/v3/configs/config/secrets/${key}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Doppler API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      value: data.value.computed,
      metadata: {
        key,
        lastUpdated: new Date(data.value.created_at),
        tags: { provider: 'doppler', project: this.config.project }
      }
    };
  }

  /**
   * Fetch from HashiCorp Vault
   */
  private async fetchFromVault(key: string, version?: string): Promise<{
    value: string;
    metadata: SecretMetadata;
  }> {
    const token = this.config.token || process.env.VAULT_TOKEN;
    const endpoint = this.config.endpoint || process.env.VAULT_ADDR;
    
    if (!token || !endpoint) {
      throw new Error('Vault token or endpoint not configured');
    }

    const path = version 
      ? `v1/secret/data/${key}?version=${version}`
      : `v1/secret/data/${key}`;
    
    const url = `${endpoint}/${path}`;
    const response = await fetch(url, {
      headers: {
        'X-Vault-Token': token,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Vault API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      value: data.data.data.value,
      metadata: {
        key,
        version: data.data.metadata.version?.toString(),
        lastUpdated: new Date(data.data.metadata.created_time),
        tags: { provider: 'vault', namespace: this.config.namespace }
      }
    };
  }

  /**
   * Fetch from AWS Secrets Manager
   */
  private async fetchFromAWSSecrets(key: string, version?: string): Promise<{
    value: string;
    metadata: SecretMetadata;
  }> {
    // This would require AWS SDK integration
    // For now, we'll simulate the interface
    throw new Error('AWS Secrets Manager integration not implemented yet');
  }

  /**
   * Fetch from Azure Key Vault
   */
  private async fetchFromAzureKeyVault(key: string, version?: string): Promise<{
    value: string;
    metadata: SecretMetadata;
  }> {
    // This would require Azure SDK integration
    // For now, we'll simulate the interface
    throw new Error('Azure Key Vault integration not implemented yet');
  }

  /**
   * Check if cached secret is still valid
   */
  private isCacheValid(cached: CachedSecret): boolean {
    const now = Date.now();
    const cacheAge = now - cached.cachedAt.getTime();
    return cacheAge < cached.ttl;
  }

  /**
   * Clear cache for a specific key or all keys
   */
  clearCache(key?: string): void {
    if (key) {
      // Clear all versions of this key
      for (const cacheKey of this.cache.keys()) {
        if (cacheKey.startsWith(`${key}:`)) {
          this.cache.delete(cacheKey);
        }
      }
    } else {
      this.cache.clear();
    }
    
    logger.info('Secret cache cleared', { key: key || 'all' });
  }

  /**
   * Preload secrets for faster access
   */
  async preloadSecrets(keys: string[]): Promise<void> {
    logger.info('Preloading secrets', { count: keys.length });
    
    const promises = keys.map(key => 
      this.getSecret(key).catch(error => 
        logger.warn('Failed to preload secret', { key, error })
      )
    );
    
    await Promise.allSettled(promises);
    logger.info('Secret preloading completed');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    keys: string[];
    hitRate?: number;
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Health check for secret provider
   */
  async healthCheck(): Promise<{
    provider: string;
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
  }> {
    const start = Date.now();
    
    try {
      // Try to fetch a test secret or ping the provider
      switch (this.config.provider) {
        case 'doppler':
          await this.testDopplerConnection();
          break;
        case 'vault':
          await this.testVaultConnection();
          break;
        default:
          throw new Error(`Health check not implemented for ${this.config.provider}`);
      }
      
      return {
        provider: this.config.provider,
        status: 'healthy',
        latency: Date.now() - start
      };
    } catch (error) {
      return {
        provider: this.config.provider,
        status: 'unhealthy',
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async testDopplerConnection(): Promise<void> {
    const token = this.config.token || process.env.DOPPLER_TOKEN;
    const response = await fetch('https://api.doppler.com/v3/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error(`Doppler connection failed: ${response.status}`);
    }
  }

  private async testVaultConnection(): Promise<void> {
    const token = this.config.token || process.env.VAULT_TOKEN;
    const endpoint = this.config.endpoint || process.env.VAULT_ADDR;
    
    const response = await fetch(`${endpoint}/v1/sys/health`, {
      headers: { 'X-Vault-Token': token }
    });
    
    if (!response.ok) {
      throw new Error(`Vault connection failed: ${response.status}`);
    }
  }
}

/**
 * Agent-specific secret manager
 * Each agent gets its own instance with specific configuration
 */
export class AgentSecretManager {
  private secretManager: SecretManager;
  private agentName: string;
  private requiredSecrets: string[];

  constructor(agentName: string, config: SecretConfig, requiredSecrets: string[] = []) {
    this.agentName = agentName;
    this.secretManager = new SecretManager(config);
    this.requiredSecrets = requiredSecrets;
  }

  /**
   * Initialize agent with required secrets
   */
  async initialize(): Promise<void> {
    logger.info('Initializing agent secrets', { 
      agent: this.agentName,
      secretCount: this.requiredSecrets.length 
    });

    // Preload all required secrets
    await this.secretManager.preloadSecrets(this.requiredSecrets);
    
    // Verify all required secrets are available
    const missing = [];
    for (const key of this.requiredSecrets) {
      try {
        await this.secretManager.getSecret(key);
      } catch (error) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required secrets for ${this.agentName}: ${missing.join(', ')}`);
    }

    logger.info('Agent secrets initialized successfully', { agent: this.agentName });
  }

  /**
   * Get LLM API key for this agent
   */
  async getLLMApiKey(provider: 'openai' | 'anthropic' | 'google' = 'openai'): Promise<string> {
    const keyMap = {
      openai: `${this.agentName.toUpperCase()}_OPENAI_API_KEY`,
      anthropic: `${this.agentName.toUpperCase()}_ANTHROPIC_API_KEY`,
      google: `${this.agentName.toUpperCase()}_GOOGLE_API_KEY`
    };

    return this.secretManager.getSecret(keyMap[provider]);
  }

  /**
   * Get database connection string
   */
  async getDatabaseUrl(): Promise<string> {
    return this.secretManager.getSecret(`${this.agentName.toUpperCase()}_DATABASE_URL`);
  }

  /**
   * Get Redis connection details
   */
  async getRedisConfig(): Promise<{
    host: string;
    port: number;
    password?: string;
  }> {
    const [host, port, password] = await Promise.all([
      this.secretManager.getSecret(`${this.agentName.toUpperCase()}_REDIS_HOST`),
      this.secretManager.getSecret(`${this.agentName.toUpperCase()}_REDIS_PORT`),
      this.secretManager.getSecret(`${this.agentName.toUpperCase()}_REDIS_PASSWORD`).catch(() => undefined)
    ]);

    return {
      host,
      port: parseInt(port, 10),
      password
    };
  }

  /**
   * Get custom secret for this agent
   */
  async getSecret(key: string): Promise<string> {
    return this.secretManager.getSecret(`${this.agentName.toUpperCase()}_${key}`);
  }
}

// Factory function for creating agent secret managers
export const createAgentSecretManager = (agentName: string, requiredSecrets?: string[]) => {
  const config: SecretConfig = {
    provider: (process.env.SECRET_PROVIDER as any) || 'doppler',
    endpoint: process.env.SECRET_ENDPOINT,
    token: process.env.SECRET_TOKEN,
    project: process.env.SECRET_PROJECT,
    environment: process.env.SECRET_ENVIRONMENT || 'development'
  };

  const defaultSecrets = [
    'OPENAI_API_KEY',
    'REDIS_HOST',
    'REDIS_PORT',
    'DATABASE_URL'
  ];

  return new AgentSecretManager(
    agentName, 
    config, 
    requiredSecrets || defaultSecrets
  );
};

// Export singleton for global use
export const globalSecretManager = new SecretManager({
  provider: (process.env.SECRET_PROVIDER as any) || 'doppler',
  endpoint: process.env.SECRET_ENDPOINT,
  token: process.env.SECRET_TOKEN,
  project: process.env.SECRET_PROJECT,
  environment: process.env.SECRET_ENVIRONMENT || 'development'
});