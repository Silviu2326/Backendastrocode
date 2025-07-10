import { logger } from '@shared/utils/logger';
import type { BeTypefixJobData } from '@shared/types/queues';

interface TypeFixResult {
  fixes: TypeFix[];
  summary: {
    totalIssues: number;
    fixedIssues: number;
    remainingIssues: number;
    confidence: number;
  };
  dependencies: string[];
  devDependencies: string[];
}

interface TypeFix {
  file: string;
  line: number;
  column: number;
  issue: string;
  fix: string;
  confidence: 'high' | 'medium' | 'low';
  category: 'type-annotation' | 'import' | 'interface' | 'generic' | 'assertion' | 'other';
}

interface TypeIssue {
  file: string;
  line: number;
  column: number;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

class BeTypefixGenerator {
  private processedCount = 0;
  private errorCount = 0;

  async generateTypeFixes(data: BeTypefixJobData): Promise<TypeFixResult> {
    try {
      logger.info('Starting TypeScript type fixing', {
        userStoryId: data.userStory.id,
        issueCount: data.typeIssues.length
      });

      const fixes: TypeFix[] = [];
      const dependencies: string[] = [];
      const devDependencies: string[] = [];

      // Process each type issue
      for (const issue of data.typeIssues) {
        const fix = await this.generateFixForIssue(issue, data);
        if (fix) {
          fixes.push(fix);
        }
      }

      // Add necessary dependencies
      this.addTypeDependencies(data, dependencies, devDependencies);

      const summary = {
        totalIssues: data.typeIssues.length,
        fixedIssues: fixes.length,
        remainingIssues: data.typeIssues.length - fixes.length,
        confidence: this.calculateOverallConfidence(fixes)
      };

      this.processedCount++;
      
      logger.info('Type fixing completed', {
        userStoryId: data.userStory.id,
        fixesGenerated: fixes.length,
        confidence: summary.confidence
      });

      return {
        fixes,
        summary,
        dependencies,
        devDependencies
      };
    } catch (error) {
      this.errorCount++;
      logger.error('Error generating type fixes', {
        userStoryId: data.userStory.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  private async generateFixForIssue(issue: TypeIssue, data: BeTypefixJobData): Promise<TypeFix | null> {
    try {
      // Analyze the type issue and generate appropriate fix
      const category = this.categorizeIssue(issue);
      const fix = this.generateFixByCategory(issue, category, data);
      
      if (!fix) {
        return null;
      }

      return {
        file: issue.file,
        line: issue.line,
        column: issue.column,
        issue: issue.message,
        fix: fix.code,
        confidence: fix.confidence,
        category
      };
    } catch (error) {
      logger.warn('Could not generate fix for issue', {
        file: issue.file,
        line: issue.line,
        message: issue.message,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private categorizeIssue(issue: TypeIssue): TypeFix['category'] {
    const message = issue.message.toLowerCase();
    
    if (message.includes('cannot find module') || message.includes('import')) {
      return 'import';
    }
    if (message.includes('property') && message.includes('does not exist')) {
      return 'interface';
    }
    if (message.includes('type') && message.includes('annotation')) {
      return 'type-annotation';
    }
    if (message.includes('generic') || message.includes('type argument')) {
      return 'generic';
    }
    if (message.includes('assertion') || message.includes('as')) {
      return 'assertion';
    }
    
    return 'other';
  }

  private generateFixByCategory(
    issue: TypeIssue, 
    category: TypeFix['category'], 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    switch (category) {
      case 'type-annotation':
        return this.generateTypeAnnotationFix(issue, data);
      case 'import':
        return this.generateImportFix(issue, data);
      case 'interface':
        return this.generateInterfaceFix(issue, data);
      case 'generic':
        return this.generateGenericFix(issue, data);
      case 'assertion':
        return this.generateAssertionFix(issue, data);
      default:
        return this.generateGenericTypeFix(issue, data);
    }
  }

  private generateTypeAnnotationFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    const language = data.project.language;
    
    if (issue.message.includes('Parameter') && issue.message.includes('implicitly has an \'any\' type')) {
      // Extract parameter name from error message
      const paramMatch = issue.message.match(/Parameter '(\w+)'/);;
      const paramName = paramMatch ? paramMatch[1] : 'param';
      
      // Infer type based on context
      const inferredType = this.inferParameterType(issue, data);
      
      return {
        code: `${paramName}: ${inferredType}`,
        confidence: inferredType === 'any' ? 'low' : 'medium'
      };
    }
    
    if (issue.message.includes('Variable') && issue.message.includes('implicitly has an \'any\' type')) {
      const varMatch = issue.message.match(/Variable '(\w+)'/);;
      const varName = varMatch ? varMatch[1] : 'variable';
      
      const inferredType = this.inferVariableType(issue, data);
      
      return {
        code: `const ${varName}: ${inferredType}`,
        confidence: inferredType === 'any' ? 'low' : 'medium'
      };
    }
    
    return null;
  }

  private generateImportFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    if (issue.message.includes('Cannot find module')) {
      const moduleMatch = issue.message.match(/Cannot find module '([^']+)'/);
      const moduleName = moduleMatch ? moduleMatch[1] : '';
      
      if (moduleName.startsWith('./') || moduleName.startsWith('../')) {
        // Local import - suggest creating the file or fixing the path
        return {
          code: `// Create file: ${moduleName}.ts or fix import path`,
          confidence: 'medium'
        };
      } else {
        // External module - suggest installing types
        return {
          code: `// Install types: npm install --save-dev @types/${moduleName}`,
          confidence: 'high'
        };
      }
    }
    
    return null;
  }

  private generateInterfaceFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    if (issue.message.includes('Property') && issue.message.includes('does not exist on type')) {
      const propMatch = issue.message.match(/Property '(\w+)' does not exist on type '([^']+)'/);
      if (propMatch) {
        const [, propName, typeName] = propMatch;
        
        // Suggest adding property to interface
        const propType = this.inferPropertyType(propName, issue, data);
        
        return {
          code: `// Add to ${typeName} interface: ${propName}: ${propType};`,
          confidence: 'medium'
        };
      }
    }
    
    return null;
  }

  private generateGenericFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    if (issue.message.includes('Generic type') && issue.message.includes('requires')) {
      const typeMatch = issue.message.match(/Generic type '([^']+)' requires (\d+) type argument/);
      if (typeMatch) {
        const [, typeName, argCount] = typeMatch;
        const args = Array(parseInt(argCount)).fill('any').join(', ');
        
        return {
          code: `${typeName}<${args}>`,
          confidence: 'low'
        };
      }
    }
    
    return null;
  }

  private generateAssertionFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    if (issue.message.includes('Type assertion')) {
      // Suggest safer type assertion or type guard
      return {
        code: '// Consider using type guard instead of assertion',
        confidence: 'medium'
      };
    }
    
    return null;
  }

  private generateGenericTypeFix(
    issue: TypeIssue, 
    data: BeTypefixJobData
  ): { code: string; confidence: TypeFix['confidence'] } | null {
    // Generic fallback for other type issues
    return {
      code: `// TODO: Fix type issue - ${issue.message}`,
      confidence: 'low'
    };
  }

  private inferParameterType(issue: TypeIssue, data: BeTypefixJobData): string {
    // Simple type inference based on context
    const message = issue.message.toLowerCase();
    
    if (message.includes('request') || message.includes('req')) {
      return 'Request';
    }
    if (message.includes('response') || message.includes('res')) {
      return 'Response';
    }
    if (message.includes('next')) {
      return 'NextFunction';
    }
    if (message.includes('id')) {
      return 'string';
    }
    if (message.includes('count') || message.includes('number')) {
      return 'number';
    }
    if (message.includes('data') || message.includes('body')) {
      return 'any';
    }
    
    return 'any';
  }

  private inferVariableType(issue: TypeIssue, data: BeTypefixJobData): string {
    // Simple type inference for variables
    const message = issue.message.toLowerCase();
    
    if (message.includes('result') || message.includes('data')) {
      return 'any';
    }
    if (message.includes('error')) {
      return 'Error';
    }
    if (message.includes('config')) {
      return 'object';
    }
    
    return 'any';
  }

  private inferPropertyType(propName: string, issue: TypeIssue, data: BeTypefixJobData): string {
    // Infer property type based on name and context
    const name = propName.toLowerCase();
    
    if (name.includes('id')) {
      return 'string';
    }
    if (name.includes('count') || name.includes('number') || name.includes('age')) {
      return 'number';
    }
    if (name.includes('is') || name.includes('has') || name.includes('can')) {
      return 'boolean';
    }
    if (name.includes('date') || name.includes('time')) {
      return 'Date';
    }
    if (name.includes('list') || name.includes('items')) {
      return 'any[]';
    }
    
    return 'any';
  }

  private addTypeDependencies(
    data: BeTypefixJobData, 
    dependencies: string[], 
    devDependencies: string[]
  ): void {
    // Add common TypeScript dependencies
    devDependencies.push('@types/node');
    
    if (data.project.framework === 'express') {
      devDependencies.push('@types/express');
    }
    
    if (data.project.database === 'mongodb') {
      devDependencies.push('@types/mongoose');
    }
    
    // Add TypeScript if not present
    if (!dependencies.includes('typescript') && !devDependencies.includes('typescript')) {
      devDependencies.push('typescript');
    }
  }

  private calculateOverallConfidence(fixes: TypeFix[]): number {
    if (fixes.length === 0) {
      return 0;
    }
    
    const confidenceValues = fixes.map(fix => {
      switch (fix.confidence) {
        case 'high': return 0.9;
        case 'medium': return 0.6;
        case 'low': return 0.3;
        default: return 0.1;
      }
    });
    
    const average = confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length;
    return Math.round(average * 100);
  }

  getProcessedCount(): number {
    return this.processedCount;
  }

  getErrorCount(): number {
    return this.errorCount;
  }
}

export const beTypefixGenerator = new BeTypefixGenerator();