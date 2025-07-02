import { Project, SourceFile, SyntaxKind, Node } from 'ts-morph';
import { logger } from './logger';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * AST-based safe code patching system
 * Uses ts-morph to safely insert imports, components, and code without breaking existing code
 */
export class AstPatcher {
  private project: Project;

  constructor(tsConfigPath?: string) {
    this.project = new Project({
      tsConfigFilePath: tsConfigPath,
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: true,
    });
  }

  /**
   * Load a source file for manipulation
   */
  async loadFile(filePath: string): Promise<SourceFile> {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Add file to project if not already added
      let sourceFile = this.project.getSourceFile(filePath);
      if (!sourceFile) {
        sourceFile = this.project.addSourceFileAtPath(filePath);
      }
      
      return sourceFile;
    } catch (error) {
      logger.error('Failed to load file for AST manipulation', {
        filePath,
        error: error.message,
      });
      throw new Error(`Cannot load file: ${filePath}`);
    }
  }

  /**
   * Safely add import statements
   */
  async addImports(
    filePath: string,
    imports: Array<{
      moduleSpecifier: string;
      namedImports?: string[];
      defaultImport?: string;
      namespaceImport?: string;
    }>
  ): Promise<{
    success: boolean;
    addedImports: string[];
    skippedImports: string[];
    errors: string[];
  }> {
    const result = {
      success: true,
      addedImports: [] as string[],
      skippedImports: [] as string[],
      errors: [] as string[],
    };

    try {
      const sourceFile = await this.loadFile(filePath);
      
      for (const importSpec of imports) {
        try {
          // Check if import already exists
          const existingImport = sourceFile.getImportDeclaration(
            importSpec.moduleSpecifier
          );

          if (existingImport) {
            // Merge with existing import
            if (importSpec.namedImports) {
              const existingNamedImports = existingImport.getNamedImports();
              const existingNames = existingNamedImports.map(ni => ni.getName());
              
              const newImports = importSpec.namedImports.filter(
                name => !existingNames.includes(name)
              );
              
              if (newImports.length > 0) {
                existingImport.addNamedImports(newImports);
                result.addedImports.push(
                  `Named imports [${newImports.join(', ')}] to ${importSpec.moduleSpecifier}`
                );
              } else {
                result.skippedImports.push(
                  `All named imports already exist for ${importSpec.moduleSpecifier}`
                );
              }
            }
            
            if (importSpec.defaultImport && !existingImport.getDefaultImport()) {
              existingImport.setDefaultImport(importSpec.defaultImport);
              result.addedImports.push(
                `Default import ${importSpec.defaultImport} to ${importSpec.moduleSpecifier}`
              );
            }
            
            if (importSpec.namespaceImport && !existingImport.getNamespaceImport()) {
              existingImport.setNamespaceImport(importSpec.namespaceImport);
              result.addedImports.push(
                `Namespace import ${importSpec.namespaceImport} to ${importSpec.moduleSpecifier}`
              );
            }
          } else {
            // Add new import
            const importDeclaration: any = {
              moduleSpecifier: importSpec.moduleSpecifier,
            };
            
            if (importSpec.namedImports) {
              importDeclaration.namedImports = importSpec.namedImports;
            }
            
            if (importSpec.defaultImport) {
              importDeclaration.defaultImport = importSpec.defaultImport;
            }
            
            if (importSpec.namespaceImport) {
              importDeclaration.namespaceImport = importSpec.namespaceImport;
            }
            
            sourceFile.addImportDeclaration(importDeclaration);
            result.addedImports.push(
              `New import from ${importSpec.moduleSpecifier}`
            );
          }
        } catch (error) {
          const errorMsg = `Failed to add import ${importSpec.moduleSpecifier}: ${error.message}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }
      
      // Organize imports
      sourceFile.organizeImports();
      
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to process imports: ${error.message}`);
      return result;
    }
  }

  /**
   * Safely add React component to JSX
   */
  async addJsxComponent(
    filePath: string,
    options: {
      componentName: string;
      props?: Record<string, string>;
      children?: string;
      insertLocation: 'before' | 'after' | 'inside';
      targetSelector: string; // CSS-like selector or JSX element name
      position?: 'start' | 'end';
    }
  ): Promise<{
    success: boolean;
    message: string;
    insertedAt?: string;
  }> {
    try {
      const sourceFile = await this.loadFile(filePath);
      
      // Find JSX elements
      const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
      const jsxSelfClosingElements = sourceFile.getDescendantsOfKind(
        SyntaxKind.JsxSelfClosingElement
      );
      
      const allJsxElements = [...jsxElements, ...jsxSelfClosingElements];
      
      // Find target element
      let targetElement: Node | undefined;
      
      for (const element of allJsxElements) {
        const elementName = this.getJsxElementName(element);
        if (elementName === options.targetSelector) {
          targetElement = element;
          break;
        }
      }
      
      if (!targetElement) {
        return {
          success: false,
          message: `Target element '${options.targetSelector}' not found`,
        };
      }
      
      // Build component JSX
      const props = options.props
        ? Object.entries(options.props)
            .map(([key, value]) => `${key}={${value}}`)
            .join(' ')
        : '';
      
      const componentJsx = options.children
        ? `<${options.componentName}${props ? ' ' + props : ''}>${options.children}</${options.componentName}>`
        : `<${options.componentName}${props ? ' ' + props : ''} />`;
      
      // Insert component
      let insertedAt = '';
      
      switch (options.insertLocation) {
        case 'before':
          targetElement.replaceWithText(
            `${componentJsx}\n${targetElement.getFullText()}`
          );
          insertedAt = 'before target element';
          break;
          
        case 'after':
          targetElement.replaceWithText(
            `${targetElement.getFullText()}\n${componentJsx}`
          );
          insertedAt = 'after target element';
          break;
          
        case 'inside':
          if (targetElement.getKind() === SyntaxKind.JsxElement) {
            const jsxElement = targetElement as any;
            const children = jsxElement.getJsxChildren();
            
            if (options.position === 'start') {
              if (children.length > 0) {
                children[0].replaceWithText(
                  `${componentJsx}\n${children[0].getFullText()}`
                );
              } else {
                jsxElement.addJsxChild(componentJsx);
              }
              insertedAt = 'at start of target element';
            } else {
              jsxElement.addJsxChild(componentJsx);
              insertedAt = 'at end of target element';
            }
          } else {
            return {
              success: false,
              message: 'Cannot insert inside self-closing element',
            };
          }
          break;
      }
      
      return {
        success: true,
        message: `Component ${options.componentName} added successfully`,
        insertedAt,
      };
    } catch (error) {
      logger.error('Failed to add JSX component', {
        filePath,
        componentName: options.componentName,
        error: error.message,
      });
      
      return {
        success: false,
        message: `Failed to add component: ${error.message}`,
      };
    }
  }

  /**
   * Safely add function or method
   */
  async addFunction(
    filePath: string,
    options: {
      name: string;
      parameters: Array<{ name: string; type?: string; defaultValue?: string }>;
      returnType?: string;
      body: string;
      isAsync?: boolean;
      isExport?: boolean;
      insertLocation: 'top' | 'bottom' | 'after' | 'before';
      targetFunction?: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const sourceFile = await this.loadFile(filePath);
      
      // Check if function already exists
      const existingFunction = sourceFile.getFunction(options.name);
      if (existingFunction) {
        return {
          success: false,
          message: `Function '${options.name}' already exists`,
        };
      }
      
      // Build function parameters
      const params = options.parameters
        .map(p => {
          let param = p.name;
          if (p.type) param += `: ${p.type}`;
          if (p.defaultValue) param += ` = ${p.defaultValue}`;
          return param;
        })
        .join(', ');
      
      // Build function
      const asyncKeyword = options.isAsync ? 'async ' : '';
      const exportKeyword = options.isExport ? 'export ' : '';
      const returnTypeAnnotation = options.returnType ? `: ${options.returnType}` : '';
      
      const functionCode = `${exportKeyword}${asyncKeyword}function ${options.name}(${params})${returnTypeAnnotation} {\n${options.body}\n}`;
      
      // Insert function
      switch (options.insertLocation) {
        case 'top':
          sourceFile.insertText(0, functionCode + '\n\n');
          break;
          
        case 'bottom':
          sourceFile.addText('\n\n' + functionCode);
          break;
          
        case 'after':
        case 'before':
          if (!options.targetFunction) {
            return {
              success: false,
              message: 'Target function required for relative positioning',
            };
          }
          
          const targetFunc = sourceFile.getFunction(options.targetFunction);
          if (!targetFunc) {
            return {
              success: false,
              message: `Target function '${options.targetFunction}' not found`,
            };
          }
          
          if (options.insertLocation === 'after') {
            targetFunc.insertText(targetFunc.getEnd(), '\n\n' + functionCode);
          } else {
            targetFunc.insertText(targetFunc.getStart(), functionCode + '\n\n');
          }
          break;
      }
      
      return {
        success: true,
        message: `Function '${options.name}' added successfully`,
      };
    } catch (error) {
      logger.error('Failed to add function', {
        filePath,
        functionName: options.name,
        error: error.message,
      });
      
      return {
        success: false,
        message: `Failed to add function: ${error.message}`,
      };
    }
  }

  /**
   * Save all changes to disk
   */
  async saveChanges(): Promise<{
    success: boolean;
    savedFiles: string[];
    errors: string[];
  }> {
    const result = {
      success: true,
      savedFiles: [] as string[],
      errors: [] as string[],
    };
    
    try {
      const unsavedFiles = this.project.getSourceFiles().filter(sf => !sf.isSaved());
      
      for (const sourceFile of unsavedFiles) {
        try {
          await sourceFile.save();
          result.savedFiles.push(sourceFile.getFilePath());
        } catch (error) {
          const errorMsg = `Failed to save ${sourceFile.getFilePath()}: ${error.message}`;
          result.errors.push(errorMsg);
          result.success = false;
        }
      }
      
      logger.info('AST changes saved', {
        savedFiles: result.savedFiles.length,
        errors: result.errors.length,
      });
      
      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(`Failed to save changes: ${error.message}`);
      return result;
    }
  }

  /**
   * Get preview of changes without saving
   */
  async getChangesPreview(): Promise<Array<{
    filePath: string;
    originalContent: string;
    modifiedContent: string;
    diff: string;
  }>> {
    const changes: Array<{
      filePath: string;
      originalContent: string;
      modifiedContent: string;
      diff: string;
    }> = [];
    
    try {
      const unsavedFiles = this.project.getSourceFiles().filter(sf => !sf.isSaved());
      
      for (const sourceFile of unsavedFiles) {
        const filePath = sourceFile.getFilePath();
        const modifiedContent = sourceFile.getFullText();
        
        // Read original content from disk
        const originalContent = await fs.readFile(filePath, 'utf-8');
        
        // Simple diff (in a real implementation, you might use a proper diff library)
        const diff = this.generateSimpleDiff(originalContent, modifiedContent);
        
        changes.push({
          filePath,
          originalContent,
          modifiedContent,
          diff,
        });
      }
      
      return changes;
    } catch (error) {
      logger.error('Failed to generate changes preview', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Helper: Get JSX element name
   */
  private getJsxElementName(element: Node): string {
    if (element.getKind() === SyntaxKind.JsxElement) {
      const jsxElement = element as any;
      return jsxElement.getOpeningElement().getTagNameNode().getText();
    } else if (element.getKind() === SyntaxKind.JsxSelfClosingElement) {
      const jsxSelfClosing = element as any;
      return jsxSelfClosing.getTagNameNode().getText();
    }
    return '';
  }

  /**
   * Helper: Generate simple diff
   */
  private generateSimpleDiff(original: string, modified: string): string {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    const diff: string[] = [];
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const modifiedLine = modifiedLines[i] || '';
      
      if (originalLine !== modifiedLine) {
        if (originalLine && !modifiedLine) {
          diff.push(`- ${originalLine}`);
        } else if (!originalLine && modifiedLine) {
          diff.push(`+ ${modifiedLine}`);
        } else {
          diff.push(`- ${originalLine}`);
          diff.push(`+ ${modifiedLine}`);
        }
      }
    }
    
    return diff.join('\n');
  }

  /**
   * Dispose of the project
   */
  dispose(): void {
    // Clean up project resources if needed
  }
}

// Export factory function
export function createAstPatcher(tsConfigPath?: string): AstPatcher {
  return new AstPatcher(tsConfigPath);
}