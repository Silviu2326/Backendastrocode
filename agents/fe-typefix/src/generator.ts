import { ContextualLogger } from '../../../shared/utils/logger';
import { LLMOrchestrator } from '../../../shared/llm/llmOrchestrator';
import { FileWriter } from '../../../shared/utils/fileWriter';
import { config } from '../../../shared/config/env';
import * as ts from 'typescript';
import { Project, SourceFile, Node } from 'ts-morph';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TypeFixJob {
  userStory: {
    id: string;
    title: string;
    description: string;
    acceptanceCriteria: string[];
    priority: number;
    complexity: number;
  };
  component: {
    name: string;
    path: string;
    type: 'page' | 'component' | 'layout';
    existingCode?: string;
    typeErrors?: TypeScriptError[];
  };
  project: {
    framework: string;
    tsConfigPath: string;
    strictMode: boolean;
    targetVersion: string;
    dependencies: Record<string, string>;
  };
  requirements: {
    fixTypeErrors: boolean;
    improveTypeSafety: boolean;
    addMissingTypes: boolean;
    optimizeTypes: boolean;
    generateInterfaces: boolean;
    strictNullChecks: boolean;
  };
}

interface TypeScriptError {
  code: number;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  category: string;
}

interface TypeFixResult {
  success: boolean;
  fixedFilePath: string;
  fixedCode: string;
  typeDefinitions: {
    interfaces: string[];
    types: string[];
    enums: string[];
    generics: string[];
  };
  errorsFixed: {
    before: TypeScriptError[];
    after: TypeScriptError[];
    resolved: TypeScriptError[];
  };
  improvements: {
    addedTypes: string[];
    improvedSafety: string[];
    optimizations: string[];
  };
  documentation: string;
  metrics: {
    errorsFixed: number;
    typesAdded: number;
    safetyScore: number;
    complexityReduction: number;
  };
}

export class FeTypefixGenerator {
  private logger: ContextualLogger;
  private llmOrchestrator: LLMOrchestrator;
  private fileWriter: FileWriter;
  private project: Project;

  constructor() {
    this.logger = new ContextualLogger('fe-typefix-generator');
    this.llmOrchestrator = new LLMOrchestrator();
    this.fileWriter = new FileWriter();
    this.project = new Project();
  }

  async fixTypeErrors(jobData: TypeFixJob): Promise<TypeFixResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      storyId: jobData.userStory.id 
    });

    logger.info('Starting TypeScript error fixing', {
      component: jobData.component.name,
      errorsCount: jobData.component.typeErrors?.length || 0
    });

    try {
      // Initialize TypeScript project
      await this.initializeProject(jobData.project.tsConfigPath);

      // Analyze current type errors
      let currentErrors = jobData.component.typeErrors || [];
      if (jobData.component.existingCode && currentErrors.length === 0) {
        currentErrors = await this.analyzeTypeErrors(jobData.component.path, jobData.component.existingCode);
        logger.info('Analyzed type errors', { errorsFound: currentErrors.length });
      }

      // Prepare context for LLM
      const context = this.prepareLLMContext(jobData, currentErrors);

      // Generate type fixes using LLM
      const fixedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-typefix',
        context
      );

      logger.info('Generated type fixes', { 
        codeLength: fixedCode.length 
      });

      // Apply AST transformations for additional fixes
      const enhancedCode = await this.applyASTTransformations(fixedCode, jobData);

      // Validate fixes
      const validationResult = await this.validateTypeFixes(enhancedCode, jobData.component.path);

      // Extract type definitions
      const typeDefinitions = this.extractTypeDefinitions(enhancedCode);

      // Calculate improvements
      const improvements = this.calculateImprovements(jobData.component.existingCode || '', enhancedCode);

      // Write fixed component
      const fixedFilePath = await this.writeFixedComponent(
        jobData.component.path,
        enhancedCode,
        jobData.component.name
      );

      // Generate documentation
      const documentation = this.generateTypeFixDocumentation(jobData, currentErrors, validationResult.errors);

      // Calculate metrics
      const metrics = this.calculateTypeFixMetrics(currentErrors, validationResult.errors, improvements);

      logger.info('Type fixing completed successfully', {
        fixedFilePath,
        errorsFixed: metrics.errorsFixed,
        safetyScore: metrics.safetyScore
      });

      return {
        success: true,
        fixedFilePath,
        fixedCode: enhancedCode,
        typeDefinitions,
        errorsFixed: {
          before: currentErrors,
          after: validationResult.errors,
          resolved: this.getResolvedErrors(currentErrors, validationResult.errors)
        },
        improvements,
        documentation,
        metrics
      };
    } catch (error) {
      logger.error('Type fixing failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async improveTypeSafety(jobData: TypeFixJob): Promise<TypeFixResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'improve-safety'
    });

    logger.info('Improving type safety');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for type safety improvement');
      }

      // Analyze type safety opportunities
      const safetyAnalysis = await this.analyzeTypeSafetyOpportunities(jobData.component.existingCode);
      
      // Prepare improvement context
      const context = {
        ...this.prepareLLMContext(jobData, []),
        safetyAnalysis,
        mode: 'improve-safety',
        strictMode: jobData.project.strictMode
      };

      // Generate improved code
      const improvedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-typefix',
        context
      );

      return await this.processTypeFixResult(jobData, improvedCode, 'improved');
    } catch (error) {
      logger.error('Type safety improvement failed', { error: error.message });
      throw error;
    }
  }

  async generateMissingTypes(jobData: TypeFixJob): Promise<TypeFixResult> {
    const logger = this.logger.withContext({ 
      component: jobData.component.name,
      action: 'generate-types'
    });

    logger.info('Generating missing types');

    try {
      if (!jobData.component.existingCode) {
        throw new Error('No existing code provided for type generation');
      }

      // Identify missing types
      const missingTypes = await this.identifyMissingTypes(jobData.component.existingCode);
      
      // Prepare type generation context
      const context = {
        ...this.prepareLLMContext(jobData, []),
        missingTypes,
        mode: 'generate-types',
        generateInterfaces: jobData.requirements.generateInterfaces
      };

      // Generate types
      const typedCode = await this.llmOrchestrator.generateFromTemplate(
        'fe-typefix',
        context
      );

      return await this.processTypeFixResult(jobData, typedCode, 'typed');
    } catch (error) {
      logger.error('Type generation failed', { error: error.message });
      throw error;
    }
  }

  private async initializeProject(tsConfigPath: string): Promise<void> {
    try {
      this.project = new Project({
        tsConfigFilePath: tsConfigPath,
        skipAddingFilesFromTsConfig: false
      });
    } catch (error) {
      // Fallback to default configuration
      this.project = new Project({
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeJs,
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true
        }
      });
    }
  }

  private async analyzeTypeErrors(filePath: string, code: string): Promise<TypeScriptError[]> {
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    
    return diagnostics.map(diagnostic => {
      const start = diagnostic.getStart();
      const sourceFile = diagnostic.getSourceFile();
      const lineAndChar = sourceFile?.getLineAndColumnAtPos(start || 0);
      
      return {
        code: diagnostic.getCode(),
        message: diagnostic.getMessageText().toString(),
        file: filePath,
        line: lineAndChar?.line || 0,
        column: lineAndChar?.column || 0,
        severity: diagnostic.getCategory() === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        category: this.categorizeError(diagnostic.getCode())
      };
    });
  }

  private categorizeError(code: number): string {
    const errorCategories: Record<number, string> = {
      2304: 'missing-declaration',
      2339: 'property-not-exist',
      2345: 'argument-type-mismatch',
      2322: 'type-assignment-error',
      2571: 'object-literal-error',
      2740: 'missing-properties',
      2741: 'excess-properties',
      7053: 'implicit-any',
      2532: 'possibly-undefined',
      2531: 'possibly-null'
    };
    
    return errorCategories[code] || 'other';
  }

  private async applyASTTransformations(code: string, jobData: TypeFixJob): Promise<string> {
    const sourceFile = this.project.createSourceFile('temp.tsx', code, { overwrite: true });
    
    // Apply various transformations
    this.addMissingImports(sourceFile);
    this.fixImplicitAnyTypes(sourceFile);
    this.addNullChecks(sourceFile, jobData.requirements.strictNullChecks);
    this.improveTypeAnnotations(sourceFile);
    this.optimizeTypeDefinitions(sourceFile);
    
    return sourceFile.getFullText();
  }

  private addMissingImports(sourceFile: SourceFile): void {
    // Analyze usage and add missing imports
    const usedIdentifiers = this.extractUsedIdentifiers(sourceFile);
    const missingImports = this.identifyMissingImports(usedIdentifiers);
    
    missingImports.forEach(importInfo => {
      sourceFile.addImportDeclaration({
        moduleSpecifier: importInfo.module,
        namedImports: importInfo.names
      });
    });
  }

  private fixImplicitAnyTypes(sourceFile: SourceFile): void {
    // Find and fix implicit any types
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.Parameter).forEach(param => {
      if (!param.getTypeNode()) {
        const inferredType = this.inferParameterType(param);
        if (inferredType) {
          param.setType(inferredType);
        }
      }
    });
    
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.VariableDeclaration).forEach(varDecl => {
      if (!varDecl.getTypeNode() && !varDecl.getInitializer()) {
        const inferredType = this.inferVariableType(varDecl);
        if (inferredType) {
          varDecl.setType(inferredType);
        }
      }
    });
  }

  private addNullChecks(sourceFile: SourceFile, strictNullChecks: boolean): void {
    if (!strictNullChecks) return;
    
    // Add null/undefined checks where needed
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.PropertyAccessExpression).forEach(propAccess => {
      const expression = propAccess.getExpression();
      if (this.mightBeNullOrUndefined(expression)) {
        // Add optional chaining or null check
        const parent = propAccess.getParent();
        if (parent && !this.hasNullCheck(parent)) {
          // Transform to optional chaining
          propAccess.replaceWithText(`${expression.getText()}?.${propAccess.getName()}`);
        }
      }
    });
  }

  private improveTypeAnnotations(sourceFile: SourceFile): void {
    // Improve function return types
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.FunctionDeclaration).forEach(func => {
      if (!func.getReturnTypeNode()) {
        const inferredReturnType = this.inferReturnType(func);
        if (inferredReturnType) {
          func.setReturnType(inferredReturnType);
        }
      }
    });
    
    // Improve arrow function types
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.ArrowFunction).forEach(arrow => {
      if (!arrow.getReturnTypeNode()) {
        const inferredReturnType = this.inferReturnType(arrow);
        if (inferredReturnType) {
          arrow.setReturnType(inferredReturnType);
        }
      }
    });
  }

  private optimizeTypeDefinitions(sourceFile: SourceFile): void {
    // Merge similar interfaces
    const interfaces = sourceFile.getInterfaces();
    const similarInterfaces = this.findSimilarInterfaces(interfaces);
    
    similarInterfaces.forEach(group => {
      if (group.length > 1) {
        this.mergeInterfaces(group);
      }
    });
    
    // Convert repetitive types to generics
    this.convertToGenerics(sourceFile);
  }

  private async validateTypeFixes(code: string, filePath: string): Promise<{errors: TypeScriptError[]}> {
    const sourceFile = this.project.createSourceFile(filePath, code, { overwrite: true });
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    
    const errors = diagnostics.map(diagnostic => {
      const start = diagnostic.getStart();
      const sourceFile = diagnostic.getSourceFile();
      const lineAndChar = sourceFile?.getLineAndColumnAtPos(start || 0);
      
      return {
        code: diagnostic.getCode(),
        message: diagnostic.getMessageText().toString(),
        file: filePath,
        line: lineAndChar?.line || 0,
        column: lineAndChar?.column || 0,
        severity: diagnostic.getCategory() === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        category: this.categorizeError(diagnostic.getCode())
      } as TypeScriptError;
    });
    
    return { errors };
  }

  private extractTypeDefinitions(code: string): any {
    const sourceFile = this.project.createSourceFile('temp.tsx', code, { overwrite: true });
    
    return {
      interfaces: sourceFile.getInterfaces().map(i => i.getName()),
      types: sourceFile.getTypeAliases().map(t => t.getName()),
      enums: sourceFile.getEnums().map(e => e.getName()),
      generics: this.extractGenerics(sourceFile)
    };
  }

  private extractGenerics(sourceFile: SourceFile): string[] {
    const generics: string[] = [];
    
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.TypeParameter).forEach(typeParam => {
      generics.push(typeParam.getName());
    });
    
    return [...new Set(generics)];
  }

  private calculateImprovements(originalCode: string, fixedCode: string): any {
    return {
      addedTypes: this.findAddedTypes(originalCode, fixedCode),
      improvedSafety: this.findSafetyImprovements(originalCode, fixedCode),
      optimizations: this.findOptimizations(originalCode, fixedCode)
    };
  }

  private findAddedTypes(originalCode: string, fixedCode: string): string[] {
    const originalTypes = this.extractTypeNames(originalCode);
    const fixedTypes = this.extractTypeNames(fixedCode);
    
    return fixedTypes.filter(type => !originalTypes.includes(type));
  }

  private findSafetyImprovements(originalCode: string, fixedCode: string): string[] {
    const improvements: string[] = [];
    
    if (fixedCode.includes('?.') && !originalCode.includes('?.')) {
      improvements.push('Added optional chaining');
    }
    
    if (fixedCode.includes('!') && !originalCode.includes('!')) {
      improvements.push('Added non-null assertions');
    }
    
    if (this.countTypeAnnotations(fixedCode) > this.countTypeAnnotations(originalCode)) {
      improvements.push('Added type annotations');
    }
    
    return improvements;
  }

  private findOptimizations(originalCode: string, fixedCode: string): string[] {
    const optimizations: string[] = [];
    
    if (this.countGenerics(fixedCode) > this.countGenerics(originalCode)) {
      optimizations.push('Converted to generics');
    }
    
    if (this.countInterfaces(fixedCode) < this.countInterfaces(originalCode)) {
      optimizations.push('Merged similar interfaces');
    }
    
    return optimizations;
  }

  private extractTypeNames(code: string): string[] {
    const typeRegex = /(?:interface|type|enum)\s+(\w+)/g;
    const matches = [...code.matchAll(typeRegex)];
    return matches.map(match => match[1]);
  }

  private countTypeAnnotations(code: string): number {
    return (code.match(/:\s*\w+/g) || []).length;
  }

  private countGenerics(code: string): number {
    return (code.match(/<[^>]+>/g) || []).length;
  }

  private countInterfaces(code: string): number {
    return (code.match(/interface\s+\w+/g) || []).length;
  }

  private getResolvedErrors(before: TypeScriptError[], after: TypeScriptError[]): TypeScriptError[] {
    return before.filter(beforeError => 
      !after.some(afterError => 
        afterError.code === beforeError.code && 
        afterError.line === beforeError.line
      )
    );
  }

  private async analyzeTypeSafetyOpportunities(code: string): Promise<any> {
    return {
      implicitAny: this.findImplicitAny(code),
      missingNullChecks: this.findMissingNullChecks(code),
      weakTypes: this.findWeakTypes(code),
      unsafeAssertions: this.findUnsafeAssertions(code)
    };
  }

  private async identifyMissingTypes(code: string): Promise<any> {
    return {
      untyped: this.findUntypedVariables(code),
      missingInterfaces: this.findMissingInterfaces(code),
      missingGenerics: this.findMissingGenerics(code)
    };
  }

  private findImplicitAny(code: string): string[] {
    // Simplified implementation
    const implicitAnyRegex = /(?:let|const|var)\s+(\w+)(?!\s*:)/g;
    const matches = [...code.matchAll(implicitAnyRegex)];
    return matches.map(match => match[1]);
  }

  private findMissingNullChecks(code: string): string[] {
    // Simplified implementation
    const accessRegex = /(\w+)\.(\w+)/g;
    const matches = [...code.matchAll(accessRegex)];
    return matches.map(match => `${match[1]}.${match[2]}`);
  }

  private findWeakTypes(code: string): string[] {
    const weakTypes: string[] = [];
    
    if (code.includes(': any')) {
      weakTypes.push('any types found');
    }
    
    if (code.includes(': object')) {
      weakTypes.push('object types found');
    }
    
    return weakTypes;
  }

  private findUnsafeAssertions(code: string): string[] {
    const assertionRegex = /(\w+)\s+as\s+\w+/g;
    const matches = [...code.matchAll(assertionRegex)];
    return matches.map(match => match[0]);
  }

  private findUntypedVariables(code: string): string[] {
    return this.findImplicitAny(code);
  }

  private findMissingInterfaces(code: string): string[] {
    // Look for object patterns that could be interfaces
    const objectRegex = /\{\s*\w+:\s*\w+(?:,\s*\w+:\s*\w+)*\s*\}/g;
    const matches = [...code.matchAll(objectRegex)];
    return matches.map((match, index) => `ObjectType${index + 1}`);
  }

  private findMissingGenerics(code: string): string[] {
    // Look for repetitive type patterns
    const repetitiveTypes: string[] = [];
    const typeRegex = /Array<(\w+)>/g;
    const matches = [...code.matchAll(typeRegex)];
    
    if (matches.length > 1) {
      repetitiveTypes.push('Generic array types');
    }
    
    return repetitiveTypes;
  }

  // Helper methods for AST transformations
  private extractUsedIdentifiers(sourceFile: SourceFile): string[] {
    const identifiers: string[] = [];
    sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier).forEach(id => {
      identifiers.push(id.getText());
    });
    return [...new Set(identifiers)];
  }

  private identifyMissingImports(identifiers: string[]): Array<{module: string, names: string[]}> {
    // Simplified implementation - would need more sophisticated analysis
    const commonImports = {
      'react': ['React', 'useState', 'useEffect', 'useCallback', 'useMemo'],
      'react-router-dom': ['useNavigate', 'useParams', 'Link'],
      'lodash': ['debounce', 'throttle', 'cloneDeep']
    };
    
    const missing: Array<{module: string, names: string[]}> = [];
    
    Object.entries(commonImports).forEach(([module, exports]) => {
      const neededExports = exports.filter(exp => identifiers.includes(exp));
      if (neededExports.length > 0) {
        missing.push({ module, names: neededExports });
      }
    });
    
    return missing;
  }

  private inferParameterType(param: any): string | null {
    // Simplified type inference
    const name = param.getName();
    
    if (name.includes('event') || name.includes('e')) return 'React.MouseEvent';
    if (name.includes('id')) return 'string';
    if (name.includes('count') || name.includes('index')) return 'number';
    if (name.includes('enabled') || name.includes('visible')) return 'boolean';
    
    return null;
  }

  private inferVariableType(varDecl: any): string | null {
    const name = varDecl.getName();
    
    if (name.includes('list') || name.includes('items')) return 'any[]';
    if (name.includes('config') || name.includes('options')) return 'object';
    
    return null;
  }

  private inferReturnType(func: any): string | null {
    const name = func.getName?.() || '';
    
    if (name.startsWith('is') || name.startsWith('has')) return 'boolean';
    if (name.startsWith('get') && name.includes('Count')) return 'number';
    if (name.startsWith('render') || name.includes('Component')) return 'JSX.Element';
    
    return null;
  }

  private mightBeNullOrUndefined(expression: any): boolean {
    // Simplified analysis
    const text = expression.getText();
    return text.includes('find') || text.includes('getElementById') || text.includes('querySelector');
  }

  private hasNullCheck(node: any): boolean {
    const text = node.getText();
    return text.includes('?.') || text.includes('&&') || text.includes('||');
  }

  private findSimilarInterfaces(interfaces: any[]): any[][] {
    // Simplified similarity detection
    const groups: any[][] = [];
    const processed = new Set();
    
    interfaces.forEach(iface => {
      if (processed.has(iface)) return;
      
      const similar = interfaces.filter(other => 
        other !== iface && this.areInterfacesSimilar(iface, other)
      );
      
      if (similar.length > 0) {
        groups.push([iface, ...similar]);
        similar.forEach(s => processed.add(s));
      }
      
      processed.add(iface);
    });
    
    return groups;
  }

  private areInterfacesSimilar(iface1: any, iface2: any): boolean {
    // Simplified similarity check
    const props1 = iface1.getProperties().map((p: any) => p.getName());
    const props2 = iface2.getProperties().map((p: any) => p.getName());
    
    const commonProps = props1.filter((p: string) => props2.includes(p));
    const similarity = commonProps.length / Math.max(props1.length, props2.length);
    
    return similarity > 0.7; // 70% similarity threshold
  }

  private mergeInterfaces(interfaces: any[]): void {
    // Simplified interface merging
    const first = interfaces[0];
    const others = interfaces.slice(1);
    
    others.forEach(iface => {
      iface.getProperties().forEach((prop: any) => {
        if (!first.getProperty(prop.getName())) {
          first.addProperty({
            name: prop.getName(),
            type: prop.getTypeNode()?.getText() || 'any'
          });
        }
      });
      
      iface.remove();
    });
  }

  private convertToGenerics(sourceFile: SourceFile): void {
    // Simplified generic conversion
    const typeAliases = sourceFile.getTypeAliases();
    
    typeAliases.forEach(typeAlias => {
      const typeText = typeAlias.getTypeNode()?.getText() || '';
      
      if (typeText.includes('string') && typeText.includes('number')) {
        // Convert to generic
        typeAlias.setType(`T`);
        typeAlias.addTypeParameter({ name: 'T' });
      }
    });
  }

  private prepareLLMContext(jobData: TypeFixJob, errors: TypeScriptError[]): any {
    return {
      userStory: jobData.userStory,
      component: jobData.component,
      project: jobData.project,
      requirements: jobData.requirements,
      typeErrors: errors,
      typescriptBestPractices: this.getTypescriptBestPractices(),
      commonPatterns: this.getCommonTypePatterns()
    };
  }

  private getTypescriptBestPractices(): string[] {
    return [
      'Use strict type checking',
      'Prefer interfaces over type aliases for object shapes',
      'Use union types instead of any',
      'Leverage type guards for runtime type checking',
      'Use generics for reusable type-safe code',
      'Prefer readonly for immutable data',
      'Use optional chaining for safe property access',
      'Avoid any type unless absolutely necessary',
      'Use utility types like Partial, Pick, Omit',
      'Define proper return types for functions'
    ];
  }

  private getCommonTypePatterns(): any {
    return {
      props: 'interface ComponentProps { prop: type; }',
      state: 'interface ComponentState { field: type; }',
      event: 'React.MouseEvent<HTMLElement>',
      ref: 'React.RefObject<HTMLElement>',
      children: 'React.ReactNode',
      style: 'React.CSSProperties'
    };
  }

  private async writeFixedComponent(
    componentPath: string,
    fixedCode: string,
    componentName: string
  ): Promise<string> {
    await this.fileWriter.writeFile(componentPath, fixedCode);
    return componentPath;
  }

  private generateTypeFixDocumentation(jobData: TypeFixJob, beforeErrors: TypeScriptError[], afterErrors: TypeScriptError[]): string {
    const errorsFixed = beforeErrors.length - afterErrors.length;
    
    return `# TypeScript Fix Documentation for ${jobData.component.name}\n\n` +
           `## Generated for User Story: ${jobData.userStory.title}\n\n` +
           `### Errors Fixed\n` +
           `- Before: ${beforeErrors.length} errors\n` +
           `- After: ${afterErrors.length} errors\n` +
           `- Fixed: ${errorsFixed} errors\n\n` +
           `### Error Categories Fixed\n` +
           this.groupErrorsByCategory(beforeErrors, afterErrors) +
           `\n### Improvements Made\n` +
           `- Added type annotations\n` +
           `- Improved type safety\n` +
           `- Fixed implicit any types\n` +
           `- Added null checks\n\n`;
  }

  private groupErrorsByCategory(beforeErrors: TypeScriptError[], afterErrors: TypeScriptError[]): string {
    const beforeCategories = this.categorizeErrors(beforeErrors);
    const afterCategories = this.categorizeErrors(afterErrors);
    
    return Object.keys(beforeCategories)
      .map(category => {
        const before = beforeCategories[category] || 0;
        const after = afterCategories[category] || 0;
        const fixed = before - after;
        return `- ${category}: ${fixed} fixed (${before} → ${after})`;
      })
      .join('\n');
  }

  private categorizeErrors(errors: TypeScriptError[]): Record<string, number> {
    return errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private calculateTypeFixMetrics(beforeErrors: TypeScriptError[], afterErrors: TypeScriptError[], improvements: any): any {
    const errorsFixed = beforeErrors.length - afterErrors.length;
    const typesAdded = improvements.addedTypes.length;
    const safetyScore = Math.max(0, 100 - (afterErrors.length * 5));
    const complexityReduction = errorsFixed > 0 ? (errorsFixed / beforeErrors.length) * 100 : 0;
    
    return {
      errorsFixed,
      typesAdded,
      safetyScore,
      complexityReduction
    };
  }

  private async processTypeFixResult(
    jobData: TypeFixJob,
    fixedCode: string,
    mode: string
  ): Promise<TypeFixResult> {
    const validationResult = await this.validateTypeFixes(fixedCode, jobData.component.path);
    const typeDefinitions = this.extractTypeDefinitions(fixedCode);
    const improvements = this.calculateImprovements(jobData.component.existingCode || '', fixedCode);
    const fixedFilePath = await this.writeFixedComponent(
      jobData.component.path,
      fixedCode,
      jobData.component.name
    );
    
    return {
      success: true,
      fixedFilePath,
      fixedCode,
      typeDefinitions,
      errorsFixed: {
        before: [],
        after: validationResult.errors,
        resolved: []
      },
      improvements,
      documentation: this.generateTypeFixDocumentation(jobData, [], validationResult.errors),
      metrics: this.calculateTypeFixMetrics([], validationResult.errors, improvements)
    };
  }
}