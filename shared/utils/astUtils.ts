import * as ts from 'typescript';
import { logger } from './logger';

interface ComponentAnalysis {
  componentName: string;
  props: PropDefinition[];
  hooks: string[];
  imports: ImportDefinition[];
  exports: ExportDefinition[];
  functions: FunctionDefinition[];
  interfaces: InterfaceDefinition[];
  dependencies: string[];
  complexity: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    numberOfFunctions: number;
    numberOfHooks: number;
  };
}

interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

interface ImportDefinition {
  module: string;
  imports: string[];
  isDefault: boolean;
  isNamespace: boolean;
}

interface ExportDefinition {
  name: string;
  type: 'function' | 'component' | 'interface' | 'type' | 'const';
  isDefault: boolean;
}

interface FunctionDefinition {
  name: string;
  parameters: ParameterDefinition[];
  returnType: string;
  isAsync: boolean;
  isArrow: boolean;
}

interface ParameterDefinition {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

interface InterfaceDefinition {
  name: string;
  properties: PropertyDefinition[];
  extends?: string[];
}

interface PropertyDefinition {
  name: string;
  type: string;
  optional: boolean;
  readonly: boolean;
}

class AstUtils {
  
  /**
   * Analiza un componente React TypeScript
   */
  async analyzeComponent(code: string): Promise<ComponentAnalysis> {
    try {
      const sourceFile = ts.createSourceFile(
        'component.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      const analysis: ComponentAnalysis = {
        componentName: '',
        props: [],
        hooks: [],
        imports: [],
        exports: [],
        functions: [],
        interfaces: [],
        dependencies: [],
        complexity: {
          cyclomaticComplexity: 0,
          linesOfCode: code.split('\n').length,
          numberOfFunctions: 0,
          numberOfHooks: 0
        }
      };

      this.visitNode(sourceFile, analysis);
      
      // Extraer dependencias de los imports
      analysis.dependencies = analysis.imports
        .filter(imp => !imp.module.startsWith('.') && !imp.module.startsWith('/'))
        .map(imp => imp.module);

      logger.debug('Component analysis completed', {
        componentName: analysis.componentName,
        propsCount: analysis.props.length,
        hooksCount: analysis.hooks.length,
        importsCount: analysis.imports.length
      });

      return analysis;
      
    } catch (error) {
      logger.error('Error analyzing component', { error: error.message });
      throw error;
    }
  }

  /**
   * Extrae información de props de una interfaz
   */
  extractPropsFromInterface(code: string, interfaceName: string): PropDefinition[] {
    try {
      const sourceFile = ts.createSourceFile(
        'props.ts',
        code,
        ts.ScriptTarget.Latest,
        true
      );

      const props: PropDefinition[] = [];
      
      const visit = (node: ts.Node) => {
        if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
          node.members.forEach(member => {
            if (ts.isPropertySignature(member) && member.name) {
              const prop: PropDefinition = {
                name: member.name.getText(),
                type: member.type ? member.type.getText() : 'any',
                required: !member.questionToken,
                description: this.extractJSDocComment(member)
              };
              
              props.push(prop);
            }
          });
        }
        
        ts.forEachChild(node, visit);
      };
      
      visit(sourceFile);
      return props;
      
    } catch (error) {
      logger.error('Error extracting props from interface', { error: error.message });
      return [];
    }
  }

  /**
   * Valida sintaxis TypeScript
   */
  validateSyntax(code: string): { isValid: boolean; errors: string[] } {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      const errors: string[] = [];
      
      const visit = (node: ts.Node) => {
        // Verificar errores de sintaxis básicos
        if (node.kind === ts.SyntaxKind.Unknown) {
          errors.push(`Syntax error at position ${node.pos}`);
        }
        
        ts.forEachChild(node, visit);
      };
      
      visit(sourceFile);
      
      return {
        isValid: errors.length === 0,
        errors
      };
      
    } catch (error) {
      return {
        isValid: false,
        errors: [error.message]
      };
    }
  }

  /**
   * Genera esqueleto de componente
   */
  generateComponentSkeleton(name: string, props: PropDefinition[]): string {
    const propsInterface = props.length > 0 ? `
interface ${name}Props {
${props.map(prop => 
  `  ${prop.name}${prop.required ? '' : '?'}: ${prop.type};${prop.description ? ` // ${prop.description}` : ''}`
).join('\n')}
}
` : '';

    const propsParam = props.length > 0 ? `props: ${name}Props` : '';
    const propsDestructuring = props.length > 0 ? 
      `\n  const { ${props.map(p => p.name).join(', ')} } = props;` : '';

    return `import React from 'react';${propsInterface}
const ${name}: React.FC${props.length > 0 ? `<${name}Props>` : ''} = (${propsParam}) => {${propsDestructuring}
  return (
    <div>
      {/* TODO: Implement ${name} component */}
    </div>
  );
};

export default ${name};`;
  }

  private visitNode(node: ts.Node, analysis: ComponentAnalysis) {
    // Analizar imports
    if (ts.isImportDeclaration(node)) {
      this.analyzeImport(node, analysis);
    }
    
    // Analizar exports
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      this.analyzeExport(node, analysis);
    }
    
    // Analizar funciones y componentes
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      this.analyzeFunction(node, analysis);
    }
    
    // Analizar variables (para componentes funcionales)
    if (ts.isVariableDeclaration(node)) {
      this.analyzeVariable(node, analysis);
    }
    
    // Analizar interfaces
    if (ts.isInterfaceDeclaration(node)) {
      this.analyzeInterface(node, analysis);
    }
    
    // Analizar llamadas a hooks
    if (ts.isCallExpression(node)) {
      this.analyzeHookCall(node, analysis);
    }
    
    // Continuar visitando nodos hijos
    ts.forEachChild(node, child => this.visitNode(child, analysis));
  }

  private analyzeImport(node: ts.ImportDeclaration, analysis: ComponentAnalysis) {
    const moduleSpecifier = node.moduleSpecifier.getText().replace(/["']/g, '');
    const importClause = node.importClause;
    
    if (importClause) {
      const imports: string[] = [];
      let isDefault = false;
      let isNamespace = false;
      
      if (importClause.name) {
        imports.push(importClause.name.text);
        isDefault = true;
      }
      
      if (importClause.namedBindings) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
          imports.push(importClause.namedBindings.name.text);
          isNamespace = true;
        } else if (ts.isNamedImports(importClause.namedBindings)) {
          importClause.namedBindings.elements.forEach(element => {
            imports.push(element.name.text);
          });
        }
      }
      
      analysis.imports.push({
        module: moduleSpecifier,
        imports,
        isDefault,
        isNamespace
      });
    }
  }

  private analyzeExport(node: ts.ExportDeclaration | ts.ExportAssignment, analysis: ComponentAnalysis) {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach(element => {
          analysis.exports.push({
            name: element.name.text,
            type: 'const', // Tipo por defecto
            isDefault: false
          });
        });
      }
    } else if (ts.isExportAssignment(node)) {
      analysis.exports.push({
        name: 'default',
        type: 'const',
        isDefault: true
      });
    }
  }

  private analyzeFunction(node: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression, analysis: ComponentAnalysis) {
    analysis.complexity.numberOfFunctions++;
    
    if (ts.isFunctionDeclaration(node) && node.name) {
      const func: FunctionDefinition = {
        name: node.name.text,
        parameters: this.extractParameters(node.parameters),
        returnType: node.type ? node.type.getText() : 'void',
        isAsync: node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.AsyncKeyword) || false,
        isArrow: false
      };
      
      analysis.functions.push(func);
      
      // Verificar si es un componente React
      if (this.isReactComponent(node)) {
        analysis.componentName = func.name;
      }
    }
  }

  private analyzeVariable(node: ts.VariableDeclaration, analysis: ComponentAnalysis) {
    if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      const name = node.name.getText();
      
      if (this.isReactComponent(node.initializer)) {
        analysis.componentName = name;
      }
    }
  }

  private analyzeInterface(node: ts.InterfaceDeclaration, analysis: ComponentAnalysis) {
    const interfaceDef: InterfaceDefinition = {
      name: node.name.text,
      properties: [],
      extends: node.heritageClauses?.map(clause => 
        clause.types.map(type => type.expression.getText()).join(', ')
      ).flat()
    };
    
    node.members.forEach(member => {
      if (ts.isPropertySignature(member) && member.name) {
        interfaceDef.properties.push({
          name: member.name.getText(),
          type: member.type ? member.type.getText() : 'any',
          optional: !!member.questionToken,
          readonly: member.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ReadonlyKeyword) || false
        });
      }
    });
    
    analysis.interfaces.push(interfaceDef);
    
    // Si es una interfaz de props, extraer props
    if (interfaceDef.name.endsWith('Props')) {
      analysis.props = interfaceDef.properties.map(prop => ({
        name: prop.name,
        type: prop.type,
        required: !prop.optional,
        description: this.extractJSDocComment(member)
      }));
    }
  }

  private analyzeHookCall(node: ts.CallExpression, analysis: ComponentAnalysis) {
    const expression = node.expression;
    
    if (ts.isIdentifier(expression)) {
      const hookName = expression.text;
      
      // Verificar si es un hook de React
      if (hookName.startsWith('use')) {
        analysis.hooks.push(hookName);
        analysis.complexity.numberOfHooks++;
      }
    }
  }

  private extractParameters(parameters: ts.NodeArray<ts.ParameterDeclaration>): ParameterDefinition[] {
    return parameters.map(param => ({
      name: param.name.getText(),
      type: param.type ? param.type.getText() : 'any',
      optional: !!param.questionToken,
      defaultValue: param.initializer ? param.initializer.getText() : undefined
    }));
  }

  private isReactComponent(node: ts.Node): boolean {
    // Heurística simple para detectar componentes React
    const text = node.getText();
    return text.includes('return') && 
           (text.includes('<') || text.includes('React.createElement'));
  }

  private extractJSDocComment(node: ts.Node): string | undefined {
    const sourceFile = node.getSourceFile();
    const fullText = sourceFile.getFullText();
    const commentRanges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
    
    if (commentRanges && commentRanges.length > 0) {
      const lastComment = commentRanges[commentRanges.length - 1];
      const commentText = fullText.substring(lastComment.pos, lastComment.end);
      
      // Extraer contenido del JSDoc
      const match = commentText.match(/\/\*\*([\s\S]*?)\*\//);;
      if (match) {
        return match[1]
          .split('\n')
          .map(line => line.replace(/^\s*\*\s?/, ''))
          .join(' ')
          .trim();
      }
    }
    
    return undefined;
  }
}

export const astUtils = new AstUtils();
export {
  ComponentAnalysis,
  PropDefinition,
  ImportDefinition,
  ExportDefinition,
  FunctionDefinition,
  InterfaceDefinition
};