import { EventEmitter } from 'events';
import { Job } from 'bullmq';
import { logger } from '../../../../shared/utils/logger';
import path from 'path';
import fs from 'fs';

export interface PluginContext {
  jobData: any;
  storyMetadata: any;
  projectConfig: any;
  userContext: {
    userId?: string;
    projectId?: string;
    preferences?: any;
  };
  environment: string;
  timestamp: Date;
}

export interface HookResult {
  continue: boolean;
  modifiedData?: any;
  additionalJobs?: Array<{
    queueName: string;
    jobName: string;
    data: any;
    options?: any;
  }>;
  metadata?: any;
  reason?: string;
}

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  priority: number;
  dependencies?: string[];
  config?: any;
  
  // Lifecycle hooks
  onBeforeEnqueue?: (context: PluginContext) => Promise<HookResult>;
  onAfterEnqueue?: (context: PluginContext & { jobId: string }) => Promise<HookResult>;
  onBeforeProcess?: (context: PluginContext & { job: Job }) => Promise<HookResult>;
  onAfterProcess?: (context: PluginContext & { job: Job; result: any }) => Promise<HookResult>;
  onError?: (context: PluginContext & { job: Job; error: Error }) => Promise<HookResult>;
  onRetry?: (context: PluginContext & { job: Job; attempt: number }) => Promise<HookResult>;
  
  // Initialization and cleanup
  initialize?: (pluginManager: PluginManager) => Promise<void>;
  cleanup?: () => Promise<void>;
  
  // Health check
  healthCheck?: () => Promise<boolean>;
}

export interface PluginConfig {
  pluginsDir: string;
  autoLoad: boolean;
  enabledPlugins: string[];
  disabledPlugins: string[];
  maxExecutionTime: number;
  errorHandling: 'continue' | 'stop' | 'skip';
}

class PluginManager extends EventEmitter {
  private plugins = new Map<string, Plugin>();
  private config: PluginConfig;
  private initialized = false;

  constructor(config: PluginConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('PluginManager already initialized');
      return;
    }

    try {
      // Load built-in plugins
      await this.loadBuiltInPlugins();
      
      // Auto-load plugins from directory if enabled
      if (this.config.autoLoad) {
        await this.loadPluginsFromDirectory();
      }
      
      // Initialize all enabled plugins
      await this.initializePlugins();
      
      this.initialized = true;
      logger.info('PluginManager initialized', {
        totalPlugins: this.plugins.size,
        enabledPlugins: Array.from(this.plugins.values()).filter(p => p.enabled).length
      });
    } catch (error) {
      logger.error('Error initializing PluginManager', { error: error.message });
      throw error;
    }
  }

  private async loadBuiltInPlugins(): Promise<void> {
    // I18n Plugin
    const i18nPlugin: Plugin = {
      name: 'i18n-detector',
      version: '1.0.0',
      description: 'Detects hardcoded text and creates i18n jobs',
      author: 'fe-manager',
      enabled: true,
      priority: 100,
      
      onBeforeEnqueue: async (context: PluginContext): Promise<HookResult> => {
        const { jobData } = context;
        const additionalJobs: any[] = [];
        
        // Check if story contains hardcoded text
        const storyText = jobData.description || jobData.title || '';
        const hasHardcodedText = this.detectHardcodedText(storyText);
        
        if (hasHardcodedText) {
          additionalJobs.push({
            queueName: 'fe-i18n',
            jobName: 'extract-text',
            data: {
              storyId: jobData.storyId,
              text: storyText,
              language: 'en',
              extractionRules: ['strings', 'labels', 'messages']
            },
            options: {
              priority: 50,
              delay: 1000
            }
          });
          
          logger.info('I18n plugin detected hardcoded text', {
            storyId: jobData.storyId,
            textLength: storyText.length
          });
        }
        
        return {
          continue: true,
          additionalJobs,
          metadata: { hasHardcodedText }
        };
      }
    };
    
    // Performance Monitor Plugin
    const performancePlugin: Plugin = {
      name: 'performance-monitor',
      version: '1.0.0',
      description: 'Monitors job performance and suggests optimizations',
      author: 'fe-manager',
      enabled: true,
      priority: 90,
      
      onAfterProcess: async (context: PluginContext & { job: Job; result: any }): Promise<HookResult> => {
        const { job, result } = context;
        const processingTime = Date.now() - (job.processedOn || Date.now());
        const additionalJobs: any[] = [];
        
        // If processing took too long, suggest optimization
        if (processingTime > 30000) { // 30 seconds
          additionalJobs.push({
            queueName: 'fe-optimization',
            jobName: 'analyze-performance',
            data: {
              originalJobId: job.id,
              processingTime,
              jobType: job.name,
              resultSize: JSON.stringify(result).length,
              suggestions: ['code-splitting', 'lazy-loading', 'memoization']
            },
            options: {
              priority: 30,
              delay: 5000
            }
          });
          
          logger.warn('Performance plugin detected slow job', {
            jobId: job.id,
            jobName: job.name,
            processingTime
          });
        }
        
        return {
          continue: true,
          additionalJobs,
          metadata: { processingTime }
        };
      }
    };
    
    // Security Scanner Plugin
    const securityPlugin: Plugin = {
      name: 'security-scanner',
      version: '1.0.0',
      description: 'Scans generated code for security vulnerabilities',
      author: 'fe-manager',
      enabled: true,
      priority: 95,
      
      onAfterProcess: async (context: PluginContext & { job: Job; result: any }): Promise<HookResult> => {
        const { job, result } = context;
        const additionalJobs: any[] = [];
        
        // Check if result contains generated code
        if (result && result.code) {
          const securityIssues = this.scanForSecurityIssues(result.code);
          
          if (securityIssues.length > 0) {
            additionalJobs.push({
              queueName: 'fe-security',
              jobName: 'fix-vulnerabilities',
              data: {
                originalJobId: job.id,
                code: result.code,
                issues: securityIssues,
                severity: this.calculateSeverity(securityIssues)
              },
              options: {
                priority: 80,
                delay: 2000
              }
            });
            
            logger.warn('Security plugin detected vulnerabilities', {
              jobId: job.id,
              issuesCount: securityIssues.length,
              severity: this.calculateSeverity(securityIssues)
            });
          }
        }
        
        return {
          continue: true,
          additionalJobs,
          metadata: { securityScan: true }
        };
      }
    };
    
    // Accessibility Plugin
    const a11yPlugin: Plugin = {
      name: 'accessibility-enhancer',
      version: '1.0.0',
      description: 'Enhances components with accessibility features',
      author: 'fe-manager',
      enabled: true,
      priority: 85,
      
      onBeforeEnqueue: async (context: PluginContext): Promise<HookResult> => {
        const { jobData } = context;
        const additionalJobs: any[] = [];
        
        // Check if story involves UI components
        const isUIComponent = this.isUIComponentStory(jobData);
        
        if (isUIComponent) {
          additionalJobs.push({
            queueName: 'fe-a11y',
            jobName: 'enhance-accessibility',
            data: {
              storyId: jobData.storyId,
              componentType: this.detectComponentType(jobData),
              a11yRequirements: ['aria-labels', 'keyboard-navigation', 'screen-reader']
            },
            options: {
              priority: 60,
              delay: 3000
            }
          });
          
          logger.info('A11y plugin scheduled accessibility enhancement', {
            storyId: jobData.storyId,
            componentType: this.detectComponentType(jobData)
          });
        }
        
        return {
          continue: true,
          additionalJobs,
          metadata: { isUIComponent }
        };
      }
    };
    
    // Register built-in plugins
    this.registerPlugin(i18nPlugin);
    this.registerPlugin(performancePlugin);
    this.registerPlugin(securityPlugin);
    this.registerPlugin(a11yPlugin);
  }

  private async loadPluginsFromDirectory(): Promise<void> {
    if (!fs.existsSync(this.config.pluginsDir)) {
      logger.info('Plugins directory does not exist', { dir: this.config.pluginsDir });
      return;
    }

    try {
      const pluginFiles = fs.readdirSync(this.config.pluginsDir)
        .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
        .filter(file => !file.startsWith('.'));

      for (const file of pluginFiles) {
        try {
          const pluginPath = path.join(this.config.pluginsDir, file);
          const pluginModule = require(pluginPath);
          const plugin = pluginModule.default || pluginModule;
          
          if (this.isValidPlugin(plugin)) {
            this.registerPlugin(plugin);
            logger.info('Loaded external plugin', { 
              name: plugin.name, 
              version: plugin.version,
              file 
            });
          } else {
            logger.warn('Invalid plugin format', { file });
          }
        } catch (error) {
          logger.error('Error loading plugin file', { file, error: error.message });
        }
      }
    } catch (error) {
      logger.error('Error reading plugins directory', { 
        dir: this.config.pluginsDir, 
        error: error.message 
      });
    }
  }

  private async initializePlugins(): Promise<void> {
    const enabledPlugins = Array.from(this.plugins.values())
      .filter(plugin => plugin.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const plugin of enabledPlugins) {
      try {
        if (plugin.initialize) {
          await plugin.initialize(this);
          logger.info('Initialized plugin', { name: plugin.name });
        }
      } catch (error) {
        logger.error('Error initializing plugin', { 
          name: plugin.name, 
          error: error.message 
        });
        
        if (this.config.errorHandling === 'stop') {
          throw error;
        }
      }
    }
  }

  registerPlugin(plugin: Plugin): void {
    if (!this.isValidPlugin(plugin)) {
      throw new Error(`Invalid plugin: ${plugin.name}`);
    }

    // Check if plugin should be enabled
    const shouldEnable = this.shouldEnablePlugin(plugin);
    plugin.enabled = shouldEnable;

    this.plugins.set(plugin.name, plugin);
    this.emit('plugin:registered', plugin);
    
    logger.info('Registered plugin', { 
      name: plugin.name, 
      version: plugin.version,
      enabled: plugin.enabled,
      priority: plugin.priority
    });
  }

  private shouldEnablePlugin(plugin: Plugin): boolean {
    // Check if explicitly disabled
    if (this.config.disabledPlugins.includes(plugin.name)) {
      return false;
    }
    
    // Check if explicitly enabled
    if (this.config.enabledPlugins.length > 0) {
      return this.config.enabledPlugins.includes(plugin.name);
    }
    
    // Default to plugin's enabled state
    return plugin.enabled;
  }

  private isValidPlugin(plugin: any): plugin is Plugin {
    return plugin &&
           typeof plugin.name === 'string' &&
           typeof plugin.version === 'string' &&
           typeof plugin.description === 'string' &&
           typeof plugin.author === 'string' &&
           typeof plugin.priority === 'number';
  }

  // Hook execution methods
  async executeBeforeEnqueueHooks(context: PluginContext): Promise<HookResult[]> {
    return this.executeHooks('onBeforeEnqueue', context);
  }

  async executeAfterEnqueueHooks(context: PluginContext & { jobId: string }): Promise<HookResult[]> {
    return this.executeHooks('onAfterEnqueue', context);
  }

  async executeBeforeProcessHooks(context: PluginContext & { job: Job }): Promise<HookResult[]> {
    return this.executeHooks('onBeforeProcess', context);
  }

  async executeAfterProcessHooks(context: PluginContext & { job: Job; result: any }): Promise<HookResult[]> {
    return this.executeHooks('onAfterProcess', context);
  }

  async executeErrorHooks(context: PluginContext & { job: Job; error: Error }): Promise<HookResult[]> {
    return this.executeHooks('onError', context);
  }

  async executeRetryHooks(context: PluginContext & { job: Job; attempt: number }): Promise<HookResult[]> {
    return this.executeHooks('onRetry', context);
  }

  private async executeHooks(hookName: keyof Plugin, context: any): Promise<HookResult[]> {
    const results: HookResult[] = [];
    const enabledPlugins = Array.from(this.plugins.values())
      .filter(plugin => plugin.enabled && plugin[hookName])
      .sort((a, b) => b.priority - a.priority);

    for (const plugin of enabledPlugins) {
      try {
        const hookFunction = plugin[hookName] as Function;
        if (hookFunction) {
          const startTime = Date.now();
          
          // Execute hook with timeout
          const result = await Promise.race([
            hookFunction.call(plugin, context),
            this.createTimeoutPromise(this.config.maxExecutionTime)
          ]);
          
          const executionTime = Date.now() - startTime;
          
          results.push(result);
          
          this.emit('hook:executed', {
            plugin: plugin.name,
            hook: hookName,
            executionTime,
            result
          });
          
          // If plugin says to stop, break the chain
          if (!result.continue) {
            logger.info('Plugin stopped hook chain', {
              plugin: plugin.name,
              hook: hookName,
              reason: result.reason
            });
            break;
          }
        }
      } catch (error) {
        logger.error('Error executing plugin hook', {
          plugin: plugin.name,
          hook: hookName,
          error: error.message
        });
        
        this.emit('hook:error', {
          plugin: plugin.name,
          hook: hookName,
          error
        });
        
        if (this.config.errorHandling === 'stop') {
          throw error;
        } else if (this.config.errorHandling === 'skip') {
          continue;
        }
        
        // Continue with error result
        results.push({
          continue: true,
          reason: `Plugin ${plugin.name} failed: ${error.message}`
        });
      }
    }

    return results;
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin execution timeout (${timeoutMs}ms)`));
      }, timeoutMs);
    });
  }

  // Plugin management methods
  enablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = true;
      this.emit('plugin:enabled', plugin);
      logger.info('Enabled plugin', { name });
      return true;
    }
    return false;
  }

  disablePlugin(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.enabled = false;
      this.emit('plugin:disabled', plugin);
      logger.info('Disabled plugin', { name });
      return true;
    }
    return false;
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  // Utility methods for built-in plugins
  private detectHardcodedText(text: string): boolean {
    const patterns = [
      /["']([^"']*\s+[^"']*)["']/g, // Quoted strings with spaces
      /\b(button|label|title|placeholder|alt)\s*[:=]\s*["']([^"']+)["']/gi,
      /\b(error|warning|success|info)\s*[:=]\s*["']([^"']+)["']/gi
    ];
    
    return patterns.some(pattern => pattern.test(text));
  }

  private scanForSecurityIssues(code: string): string[] {
    const issues: string[] = [];
    
    // Basic security patterns
    const securityPatterns = [
      { pattern: /innerHTML\s*=/, issue: 'XSS: Direct innerHTML assignment' },
      { pattern: /eval\s*\(/, issue: 'Code injection: eval() usage' },
      { pattern: /document\.write\s*\(/, issue: 'XSS: document.write usage' },
      { pattern: /window\[.*\]\s*\(/, issue: 'Code injection: Dynamic function call' },
      { pattern: /localStorage\.(setItem|getItem)/, issue: 'Data exposure: localStorage usage' },
      { pattern: /sessionStorage\.(setItem|getItem)/, issue: 'Data exposure: sessionStorage usage' }
    ];
    
    securityPatterns.forEach(({ pattern, issue }) => {
      if (pattern.test(code)) {
        issues.push(issue);
      }
    });
    
    return issues;
  }

  private calculateSeverity(issues: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalKeywords = ['injection', 'XSS'];
    const highKeywords = ['eval', 'innerHTML'];
    
    if (issues.some(issue => criticalKeywords.some(keyword => issue.includes(keyword)))) {
      return 'critical';
    }
    if (issues.some(issue => highKeywords.some(keyword => issue.includes(keyword)))) {
      return 'high';
    }
    if (issues.length > 3) {
      return 'medium';
    }
    return 'low';
  }

  private isUIComponentStory(jobData: any): boolean {
    const uiKeywords = ['component', 'button', 'form', 'input', 'modal', 'dialog', 'menu', 'navigation'];
    const text = (jobData.description || jobData.title || '').toLowerCase();
    return uiKeywords.some(keyword => text.includes(keyword));
  }

  private detectComponentType(jobData: any): string {
    const text = (jobData.description || jobData.title || '').toLowerCase();
    
    if (text.includes('button')) return 'button';
    if (text.includes('form')) return 'form';
    if (text.includes('input')) return 'input';
    if (text.includes('modal') || text.includes('dialog')) return 'modal';
    if (text.includes('menu') || text.includes('navigation')) return 'navigation';
    if (text.includes('table')) return 'table';
    if (text.includes('card')) return 'card';
    
    return 'generic';
  }

  // Health check for all plugins
  async healthCheck(): Promise<{ healthy: boolean; pluginStatus: Record<string, boolean> }> {
    const pluginStatus: Record<string, boolean> = {};
    let allHealthy = true;

    for (const [name, plugin] of this.plugins.entries()) {
      if (plugin.enabled && plugin.healthCheck) {
        try {
          const isHealthy = await plugin.healthCheck();
          pluginStatus[name] = isHealthy;
          if (!isHealthy) allHealthy = false;
        } catch (error) {
          logger.error('Plugin health check failed', { name, error: error.message });
          pluginStatus[name] = false;
          allHealthy = false;
        }
      } else {
        pluginStatus[name] = plugin.enabled;
      }
    }

    return { healthy: allHealthy, pluginStatus };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
          logger.info('Cleaned up plugin', { name: plugin.name });
        } catch (error) {
          logger.error('Error cleaning up plugin', { 
            name: plugin.name, 
            error: error.message 
          });
        }
      }
    }
    
    this.plugins.clear();
    this.removeAllListeners();
    logger.info('PluginManager cleanup completed');
  }
}

// Default plugin configuration
export const defaultPluginConfig: PluginConfig = {
  pluginsDir: path.join(process.cwd(), 'plugins'),
  autoLoad: true,
  enabledPlugins: [], // Empty means all plugins enabled by default
  disabledPlugins: [],
  maxExecutionTime: 5000, // 5 seconds
  errorHandling: 'continue'
};

export { PluginManager };