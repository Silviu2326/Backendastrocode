import { logger } from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

/**
 * Plugin system with hooks for extending functionality
 * Supports onEnqueue, onComplete, and other lifecycle hooks
 */

export interface PluginContext {
  jobId: string;
  queueName: string;
  data: any;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface PluginHooks {
  onEnqueue?: (context: PluginContext) => Promise<void> | void;
  onComplete?: (context: PluginContext & { result: any; duration: number }) => Promise<void> | void;
  onError?: (context: PluginContext & { error: Error }) => Promise<void> | void;
  onStart?: (context: PluginContext) => Promise<void> | void;
  onProgress?: (context: PluginContext & { progress: number; message?: string }) => Promise<void> | void;
  onCancel?: (context: PluginContext) => Promise<void> | void;
}

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled: boolean;
  config?: Record<string, any>;
  hooks: PluginHooks;
  initialize?: () => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
}

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  main: string;
  config?: Record<string, any>;
  dependencies?: string[];
  engines?: {
    node?: string;
  };
}

export class PluginSystem extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private pluginDirectory: string;
  private initialized: boolean = false;

  constructor(pluginDirectory: string = './plugins') {
    super();
    this.pluginDirectory = path.resolve(pluginDirectory);
  }

  /**
   * Initialize the plugin system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure plugin directory exists
      await fs.mkdir(this.pluginDirectory, { recursive: true });
      
      // Load all plugins
      await this.loadPlugins();
      
      // Initialize enabled plugins
      await this.initializePlugins();
      
      this.initialized = true;
      
      logger.info('Plugin system initialized', {
        pluginDirectory: this.pluginDirectory,
        loadedPlugins: this.plugins.size,
        enabledPlugins: Array.from(this.plugins.values()).filter(p => p.enabled).length,
      });
    } catch (error) {
      logger.error('Failed to initialize plugin system', {
        error: error.message,
        pluginDirectory: this.pluginDirectory,
      });
      throw error;
    }
  }

  /**
   * Load all plugins from the plugin directory
   */
  private async loadPlugins(): Promise<void> {
    try {
      const entries = await fs.readdir(this.pluginDirectory, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await this.loadPlugin(entry.name);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Plugin directory does not exist', {
          pluginDirectory: this.pluginDirectory,
        });
        return;
      }
      throw error;
    }
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(pluginName: string): Promise<void> {
    const pluginPath = path.join(this.pluginDirectory, pluginName);
    
    try {
      // Check if plugin.json exists
      const manifestPath = path.join(pluginPath, 'plugin.json');
      const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false);
      
      if (!manifestExists) {
        logger.warn('Plugin manifest not found, skipping', {
          pluginName,
          manifestPath,
        });
        return;
      }
      
      // Load manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest: PluginManifest = JSON.parse(manifestContent);
      
      // Load main plugin file
      const mainPath = path.join(pluginPath, manifest.main || 'index.js');
      const mainExists = await fs.access(mainPath).then(() => true).catch(() => false);
      
      if (!mainExists) {
        logger.warn('Plugin main file not found, skipping', {
          pluginName,
          mainPath,
        });
        return;
      }
      
      // Dynamic import of the plugin
      const pluginModule = await import(mainPath);
      const pluginFactory = pluginModule.default || pluginModule;
      
      if (typeof pluginFactory !== 'function') {
        logger.warn('Plugin does not export a factory function, skipping', {
          pluginName,
        });
        return;
      }
      
      // Create plugin instance
      const plugin: Plugin = pluginFactory(manifest.config || {});
      
      // Validate plugin structure
      if (!this.validatePlugin(plugin)) {
        logger.warn('Plugin validation failed, skipping', {
          pluginName,
        });
        return;
      }
      
      // Set plugin metadata from manifest
      plugin.name = manifest.name;
      plugin.version = manifest.version;
      plugin.description = manifest.description;
      plugin.author = manifest.author;
      
      // Add to plugins map
      this.plugins.set(plugin.name, plugin);
      
      logger.info('Plugin loaded successfully', {
        name: plugin.name,
        version: plugin.version,
        enabled: plugin.enabled,
      });
    } catch (error) {
      logger.error('Failed to load plugin', {
        pluginName,
        error: error.message,
      });
    }
  }

  /**
   * Validate plugin structure
   */
  private validatePlugin(plugin: any): plugin is Plugin {
    return (
      typeof plugin === 'object' &&
      typeof plugin.name === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.enabled === 'boolean' &&
      typeof plugin.hooks === 'object'
    );
  }

  /**
   * Initialize all enabled plugins
   */
  private async initializePlugins(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.enabled && plugin.initialize) {
        try {
          await plugin.initialize();
          logger.info('Plugin initialized', { name: plugin.name });
        } catch (error) {
          logger.error('Failed to initialize plugin', {
            name: plugin.name,
            error: error.message,
          });
          // Disable plugin on initialization failure
          plugin.enabled = false;
        }
      }
    }
  }

  /**
   * Execute onEnqueue hooks
   */
  async executeOnEnqueue(context: PluginContext): Promise<void> {
    await this.executeHooks('onEnqueue', context);
  }

  /**
   * Execute onComplete hooks
   */
  async executeOnComplete(
    context: PluginContext & { result: any; duration: number }
  ): Promise<void> {
    await this.executeHooks('onComplete', context);
  }

  /**
   * Execute onError hooks
   */
  async executeOnError(
    context: PluginContext & { error: Error }
  ): Promise<void> {
    await this.executeHooks('onError', context);
  }

  /**
   * Execute onStart hooks
   */
  async executeOnStart(context: PluginContext): Promise<void> {
    await this.executeHooks('onStart', context);
  }

  /**
   * Execute onProgress hooks
   */
  async executeOnProgress(
    context: PluginContext & { progress: number; message?: string }
  ): Promise<void> {
    await this.executeHooks('onProgress', context);
  }

  /**
   * Execute onCancel hooks
   */
  async executeOnCancel(context: PluginContext): Promise<void> {
    await this.executeHooks('onCancel', context);
  }

  /**
   * Execute hooks of a specific type
   */
  private async executeHooks(hookName: keyof PluginHooks, context: any): Promise<void> {
    const enabledPlugins = Array.from(this.plugins.values()).filter(p => p.enabled);
    
    // Execute hooks in parallel
    const hookPromises = enabledPlugins
      .filter(plugin => plugin.hooks[hookName])
      .map(async (plugin) => {
        try {
          const hook = plugin.hooks[hookName] as Function;
          await hook(context);
          
          logger.debug('Plugin hook executed', {
            plugin: plugin.name,
            hook: hookName,
            jobId: context.jobId,
          });
        } catch (error) {
          logger.error('Plugin hook failed', {
            plugin: plugin.name,
            hook: hookName,
            jobId: context.jobId,
            error: error.message,
          });
          
          // Emit error event
          this.emit('pluginError', {
            plugin: plugin.name,
            hook: hookName,
            context,
            error,
          });
        }
      });
    
    await Promise.allSettled(hookPromises);
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): Plugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  /**
   * Get a specific plugin
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      logger.warn('Plugin not found', { name });
      return false;
    }
    
    if (plugin.enabled) {
      return true;
    }
    
    try {
      if (plugin.initialize) {
        await plugin.initialize();
      }
      
      plugin.enabled = true;
      
      logger.info('Plugin enabled', { name });
      this.emit('pluginEnabled', { plugin });
      
      return true;
    } catch (error) {
      logger.error('Failed to enable plugin', {
        name,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      logger.warn('Plugin not found', { name });
      return false;
    }
    
    if (!plugin.enabled) {
      return true;
    }
    
    try {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
      
      plugin.enabled = false;
      
      logger.info('Plugin disabled', { name });
      this.emit('pluginDisabled', { plugin });
      
      return true;
    } catch (error) {
      logger.error('Failed to disable plugin', {
        name,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Reload a plugin
   */
  async reloadPlugin(name: string): Promise<boolean> {
    try {
      // Disable and cleanup current plugin
      await this.disablePlugin(name);
      
      // Remove from plugins map
      this.plugins.delete(name);
      
      // Reload plugin
      await this.loadPlugin(name);
      
      // Enable if it was loaded successfully
      const plugin = this.plugins.get(name);
      if (plugin && plugin.enabled) {
        await this.enablePlugin(name);
      }
      
      logger.info('Plugin reloaded', { name });
      this.emit('pluginReloaded', { name });
      
      return true;
    } catch (error) {
      logger.error('Failed to reload plugin', {
        name,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get plugin statistics
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    byHook: Record<string, number>;
  } {
    const plugins = Array.from(this.plugins.values());
    const enabled = plugins.filter(p => p.enabled);
    
    const byHook: Record<string, number> = {};
    const hookNames: (keyof PluginHooks)[] = [
      'onEnqueue', 'onComplete', 'onError', 'onStart', 'onProgress', 'onCancel'
    ];
    
    for (const hookName of hookNames) {
      byHook[hookName] = enabled.filter(p => p.hooks[hookName]).length;
    }
    
    return {
      total: plugins.length,
      enabled: enabled.length,
      disabled: plugins.length - enabled.length,
      byHook,
    };
  }

  /**
   * Create a plugin template
   */
  async createPluginTemplate(
    name: string,
    options: {
      description?: string;
      author?: string;
      version?: string;
    } = {}
  ): Promise<string> {
    const pluginPath = path.join(this.pluginDirectory, name);
    
    // Create plugin directory
    await fs.mkdir(pluginPath, { recursive: true });
    
    // Create manifest
    const manifest: PluginManifest = {
      name,
      version: options.version || '1.0.0',
      description: options.description || `Plugin ${name}`,
      author: options.author || 'Unknown',
      main: 'index.js',
      config: {},
    };
    
    await fs.writeFile(
      path.join(pluginPath, 'plugin.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Create main plugin file
    const pluginCode = `
// Plugin: ${name}
// Generated at: ${new Date().toISOString()}

module.exports = function createPlugin(config) {
  return {
    name: '${name}',
    version: '${manifest.version}',
    enabled: true,
    config,
    
    hooks: {
      async onEnqueue(context) {
        console.log('\u005b${name}\u005d Job enqueued:', context.jobId);
      },
      
      async onComplete(context) {
        console.log('\u005b${name}\u005d Job completed:', context.jobId, 'in', context.duration, 'ms');
      },
      
      async onError(context) {
        console.log('\u005b${name}\u005d Job failed:', context.jobId, context.error.message);
      },
      
      async onStart(context) {
        console.log('\u005b${name}\u005d Job started:', context.jobId);
      },
      
      async onProgress(context) {
        console.log('\u005b${name}\u005d Job progress:', context.jobId, context.progress + '%');
      },
      
      async onCancel(context) {
        console.log('\u005b${name}\u005d Job cancelled:', context.jobId);
      },
    },
    
    async initialize() {
      console.log('\u005b${name}\u005d Plugin initialized');
    },
    
    async cleanup() {
      console.log('\u005b${name}\u005d Plugin cleaned up');
    },
  };
};
`;
    
    await fs.writeFile(
      path.join(pluginPath, 'index.js'),
      pluginCode
    );
    
    // Create README
    const readme = `
# ${name} Plugin

${manifest.description}

## Configuration

This plugin can be configured by editing the \`config\` section in \`plugin.json\`.

## Hooks

This plugin implements the following hooks:

- \`onEnqueue\`: Called when a job is enqueued
- \`onComplete\`: Called when a job completes successfully
- \`onError\`: Called when a job fails
- \`onStart\`: Called when a job starts processing
- \`onProgress\`: Called when a job reports progress
- \`onCancel\`: Called when a job is cancelled

## Development

To modify this plugin, edit \`index.js\` and restart the application.
`;
    
    await fs.writeFile(
      path.join(pluginPath, 'README.md'),
      readme
    );
    
    logger.info('Plugin template created', {
      name,
      path: pluginPath,
    });
    
    return pluginPath;
  }

  /**
   * Cleanup all plugins
   */
  async cleanup(): Promise<void> {
    const enabledPlugins = Array.from(this.plugins.values()).filter(p => p.enabled);
    
    for (const plugin of enabledPlugins) {
      if (plugin.cleanup) {
        try {
          await plugin.cleanup();
          logger.info('Plugin cleaned up', { name: plugin.name });
        } catch (error) {
          logger.error('Failed to cleanup plugin', {
            name: plugin.name,
            error: error.message,
          });
        }
      }
    }
    
    this.plugins.clear();
    this.initialized = false;
    
    logger.info('Plugin system cleaned up');
  }
}

// Export singleton instance
export const pluginSystem = new PluginSystem();

// Export factory function
export function createPluginSystem(pluginDirectory?: string): PluginSystem {
  return new PluginSystem(pluginDirectory);
}