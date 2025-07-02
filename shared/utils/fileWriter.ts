import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger';
import { astUtils } from './astUtils';

interface WriteOptions {
  overwrite?: boolean;
  backup?: boolean;
  validate?: boolean;
  format?: boolean;
  createDirectories?: boolean;
}

interface FileMetadata {
  path: string;
  size: number;
  created: Date;
  modified: Date;
  checksum: string;
}

class FileWriter {
  private writtenFiles: Map<string, FileMetadata> = new Map();

  /**
   * Escribe un componente React con validación
   */
  async writeComponent(
    filePath: string, 
    content: string, 
    options: WriteOptions = {}
  ): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const resolvedPath = path.resolve(filePath);
      
      logger.info('Writing component file', { 
        filePath: resolvedPath,
        contentLength: content.length 
      });

      // Validar sintaxis si está habilitado
      if (options.validate !== false) {
        const validation = astUtils.validateSyntax(content);
        if (!validation.isValid) {
          logger.error('Component validation failed', {
            filePath: resolvedPath,
            errors: validation.errors
          });
          return {
            success: false,
            path: resolvedPath,
            error: `Validation failed: ${validation.errors.join(', ')}`
          };
        }
      }

      // Crear directorios si es necesario
      if (options.createDirectories !== false) {
        await fs.ensureDir(path.dirname(resolvedPath));
      }

      // Verificar si el archivo existe
      const exists = await fs.pathExists(resolvedPath);
      if (exists && !options.overwrite) {
        logger.warn('File already exists', { filePath: resolvedPath });
        return {
          success: false,
          path: resolvedPath,
          error: 'File already exists and overwrite is disabled'
        };
      }

      // Crear backup si está habilitado
      if (exists && options.backup) {
        await this.createBackup(resolvedPath);
      }

      // Formatear contenido si está habilitado
      let finalContent = content;
      if (options.format !== false) {
        finalContent = await this.formatCode(content, resolvedPath);
      }

      // Escribir archivo
      await fs.writeFile(resolvedPath, finalContent, 'utf8');

      // Registrar metadata
      const stats = await fs.stat(resolvedPath);
      const checksum = await this.calculateChecksum(finalContent);
      
      this.writtenFiles.set(resolvedPath, {
        path: resolvedPath,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        checksum
      });

      logger.info('Component file written successfully', {
        filePath: resolvedPath,
        size: stats.size
      });

      return {
        success: true,
        path: resolvedPath
      };
      
    } catch (error) {
      logger.error('Error writing component file', {
        filePath,
        error: error.message
      });
      
      return {
        success: false,
        path: filePath,
        error: error.message
      };
    }
  }

  /**
   * Escribe múltiples archivos en lote
   */
  async writeBatch(
    files: Array<{ path: string; content: string; options?: WriteOptions }>
  ): Promise<Array<{ success: boolean; path: string; error?: string }>> {
    const results = [];
    
    logger.info('Starting batch file write', { filesCount: files.length });
    
    for (const file of files) {
      const result = await this.writeComponent(file.path, file.content, file.options);
      results.push(result);
      
      // Pequeña pausa para evitar sobrecarga del sistema
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    logger.info('Batch write completed', {
      total: files.length,
      successful,
      failed
    });
    
    return results;
  }

  /**
   * Escribe archivo de configuración JSON
   */
  async writeConfig(
    filePath: string,
    config: Record<string, any>,
    options: WriteOptions = {}
  ): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      const content = JSON.stringify(config, null, 2);
      return await this.writeComponent(filePath, content, {
        ...options,
        validate: false // No validar JSON como TypeScript
      });
    } catch (error) {
      logger.error('Error writing config file', {
        filePath,
        error: error.message
      });
      
      return {
        success: false,
        path: filePath,
        error: error.message
      };
    }
  }

  /**
   * Escribe archivo package.json
   */
  async writePackageJson(
    filePath: string,
    packageData: Record<string, any>,
    options: WriteOptions = {}
  ): Promise<{ success: boolean; path: string; error?: string }> {
    try {
      // Validar estructura básica de package.json
      if (!packageData.name) {
        throw new Error('package.json must have a name field');
      }
      
      if (!packageData.version) {
        packageData.version = '1.0.0';
      }
      
      // Ordenar campos en orden estándar
      const orderedPackage = {
        name: packageData.name,
        version: packageData.version,
        description: packageData.description,
        main: packageData.main,
        scripts: packageData.scripts,
        keywords: packageData.keywords,
        author: packageData.author,
        license: packageData.license,
        dependencies: packageData.dependencies,
        devDependencies: packageData.devDependencies,
        peerDependencies: packageData.peerDependencies,
        ...packageData // Otros campos
      };
      
      // Remover campos undefined
      Object.keys(orderedPackage).forEach(key => {
        if (orderedPackage[key] === undefined) {
          delete orderedPackage[key];
        }
      });
      
      return await this.writeConfig(filePath, orderedPackage, options);
      
    } catch (error) {
      logger.error('Error writing package.json', {
        filePath,
        error: error.message
      });
      
      return {
        success: false,
        path: filePath,
        error: error.message
      };
    }
  }

  /**
   * Escribe archivo de tipos TypeScript
   */
  async writeTypes(
    filePath: string,
    types: string,
    options: WriteOptions = {}
  ): Promise<{ success: boolean; path: string; error?: string }> {
    const content = `// Auto-generated types\n// Do not edit manually\n\n${types}`;
    
    return await this.writeComponent(filePath, content, {
      ...options,
      validate: true
    });
  }

  /**
   * Crea un backup del archivo existente
   */
  private async createBackup(filePath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup.${timestamp}`;
    
    await fs.copy(filePath, backupPath);
    
    logger.info('Backup created', {
      originalPath: filePath,
      backupPath
    });
  }

  /**
   * Formatea código usando prettier (si está disponible)
   */
  private async formatCode(content: string, filePath: string): Promise<string> {
    try {
      // Intentar usar prettier si está disponible
      const prettier = await import('prettier').catch(() => null);
      
      if (prettier) {
        const options = await prettier.resolveConfig(filePath) || {
          parser: this.getParser(filePath),
          semi: true,
          singleQuote: true,
          tabWidth: 2,
          trailingComma: 'es5'
        };
        
        return prettier.format(content, options);
      }
      
      // Formateo básico si prettier no está disponible
      return this.basicFormat(content);
      
    } catch (error) {
      logger.warn('Error formatting code, using original', {
        filePath,
        error: error.message
      });
      return content;
    }
  }

  /**
   * Formateo básico sin prettier
   */
  private basicFormat(content: string): string {
    return content
      .replace(/;\s*\n/g, ';\n') // Normalizar punto y coma
      .replace(/\{\s*\n/g, '{\n') // Normalizar llaves de apertura
      .replace(/\n\s*\}/g, '\n}') // Normalizar llaves de cierre
      .replace(/,\s*\n/g, ',\n') // Normalizar comas
      .replace(/\n{3,}/g, '\n\n'); // Reducir líneas vacías múltiples
  }

  /**
   * Obtiene el parser apropiado para prettier
   */
  private getParser(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'babel';
      case '.json':
        return 'json';
      case '.css':
        return 'css';
      case '.scss':
        return 'scss';
      case '.md':
        return 'markdown';
      default:
        return 'typescript';
    }
  }

  /**
   * Calcula checksum MD5 del contenido
   */
  private async calculateChecksum(content: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Obtiene metadata de archivos escritos
   */
  getWrittenFiles(): Map<string, FileMetadata> {
    return new Map(this.writtenFiles);
  }

  /**
   * Limpia el registro de archivos escritos
   */
  clearWrittenFiles(): void {
    this.writtenFiles.clear();
  }

  /**
   * Verifica la integridad de un archivo
   */
  async verifyFile(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const metadata = this.writtenFiles.get(path.resolve(filePath));
      if (!metadata) {
        return { valid: false, error: 'File not found in registry' };
      }

      const exists = await fs.pathExists(filePath);
      if (!exists) {
        return { valid: false, error: 'File does not exist' };
      }

      const content = await fs.readFile(filePath, 'utf8');
      const currentChecksum = await this.calculateChecksum(content);
      
      if (currentChecksum !== metadata.checksum) {
        return { valid: false, error: 'File has been modified' };
      }

      return { valid: true };
      
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Elimina archivos escritos (con confirmación)
   */
  async cleanup(confirm: boolean = false): Promise<{ removed: string[]; errors: string[] }> {
    if (!confirm) {
      throw new Error('Cleanup requires explicit confirmation');
    }

    const removed: string[] = [];
    const errors: string[] = [];

    for (const [filePath] of this.writtenFiles) {
      try {
        await fs.remove(filePath);
        removed.push(filePath);
        logger.info('File removed during cleanup', { filePath });
      } catch (error) {
        errors.push(`${filePath}: ${error.message}`);
        logger.error('Error removing file during cleanup', {
          filePath,
          error: error.message
        });
      }
    }

    this.clearWrittenFiles();

    logger.info('Cleanup completed', {
      removedCount: removed.length,
      errorCount: errors.length
    });

    return { removed, errors };
  }
}

export const fileWriter = new FileWriter();
export { WriteOptions, FileMetadata };