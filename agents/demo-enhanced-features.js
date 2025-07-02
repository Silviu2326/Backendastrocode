/**
 * Demo script for Enhanced Frontend Agents System
 * Demonstrates all 6 new improvements:
 * 1. Token Persistence
 * 2. Context Re-use
 * 3. AST Patch Safe-merge
 * 4. Dry-run Mode
 * 5. Dependency-based Ordering
 * 6. Plugin System
 */

const { tokenTracker } = require('./shared/utils/tokenTracker');
const { contextCache } = require('./shared/utils/contextCache');
const { createAstPatcher } = require('./shared/utils/astPatcher');
const { globalDryRun } = require('./shared/utils/dryRunMode');
const { createDependencyOrdering } = require('./shared/utils/dependencyOrdering');
const { pluginSystem } = require('./shared/utils/pluginSystem');

async function demonstrateEnhancedFeatures() {
  console.log('🚀 Demonstrating Enhanced Frontend Agents System Features\n');

  try {
    // 1. Token Persistence Demo
    console.log('📊 1. TOKEN PERSISTENCE DEMO');
    console.log('=' .repeat(50));
    
    const storyId = 'story-demo-001';
    const projectId = 'project-demo';
    
    // Simulate token usage
    await tokenTracker.incrementStoryTokens(storyId, 1500, {
      projectId,
      operation: 'fe-draft-generation',
      model: 'gpt-4',
      provider: 'openai'
    });
    
    await tokenTracker.incrementStoryTokens(storyId, 800, {
      projectId,
      operation: 'fe-style-generation',
      model: 'gpt-4',
      provider: 'openai'
    });
    
    // Get token usage statistics
    const storyTokens = await tokenTracker.getStoryTokens(storyId);
    const projectTokens = await tokenTracker.getProjectTokens(projectId);
    const dailyTokens = await tokenTracker.getDailyTokens();
    
    console.log(`Story ${storyId} tokens:`, storyTokens);
    console.log(`Project ${projectId} tokens:`, projectTokens);
    console.log('Daily tokens:', dailyTokens);
    
    // Calculate costs
    const storyCost = await tokenTracker.calculateCost(storyTokens, 'gpt-4');
    console.log(`Estimated cost for story: $${storyCost.toFixed(4)}\n`);

    // 2. Context Re-use Demo
    console.log('🔄 2. CONTEXT RE-USE DEMO');
    console.log('=' .repeat(50));
    
    const contextKey = 'component-skeleton:LoginForm';
    const mockContext = {
      component: 'LoginForm',
      props: ['username', 'password', 'onSubmit'],
      imports: ['React', 'useState'],
      skeleton: 'const LoginForm = ({ onSubmit }) => { ... }'
    };
    
    // Cache the context
    await contextCache.set(contextKey, mockContext, {
      component: 'LoginForm',
      operation: 'skeleton-generation',
      model: 'gpt-4'
    });
    
    // Retrieve from cache
    const cachedContext = await contextCache.get(contextKey);
    console.log('Cached context retrieved:', !!cachedContext);
    console.log('Cache hit saved tokens:', cachedContext ? 'Yes' : 'No');
    
    // Get cache statistics
    const cacheStats = await contextCache.getStats();
    console.log('Cache statistics:', cacheStats, '\n');

    // 3. AST Patch Safe-merge Demo
    console.log('🔧 3. AST PATCH SAFE-MERGE DEMO');
    console.log('=' .repeat(50));
    
    const astPatcher = createAstPatcher();
    
    // Create a sample React component file
    const sampleComponent = `import React from 'react';

const MyComponent = () => {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
};

export default MyComponent;`;
    
    // Write sample file
    const fs = require('fs').promises;
    const path = require('path');
    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const sampleFile = path.join(tempDir, 'MyComponent.tsx');
    await fs.writeFile(sampleFile, sampleComponent);
    
    // Load and modify using AST
    await astPatcher.loadFile(sampleFile);
    
    // Add imports safely
    astPatcher.addImport('useState', 'react');
    astPatcher.addImport('Button', './Button');
    
    // Add a new component inside the JSX
    astPatcher.addReactComponent(
      'div',
      '<Button onClick={() => console.log("clicked")}>Click me</Button>',
      'inside'
    );
    
    // Preview changes
    const changes = astPatcher.previewChanges();
    console.log('AST changes preview:');
    console.log('- Added imports:', changes.imports?.length || 0);
    console.log('- Modified JSX:', changes.jsx?.length || 0);
    
    // Save changes
    await astPatcher.saveChanges();
    console.log('✅ AST patches applied safely\n');

    // 4. Dry-run Mode Demo
    console.log('🧪 4. DRY-RUN MODE DEMO');
    console.log('=' .repeat(50));
    
    // Enable dry-run mode
    globalDryRun.enable();
    console.log('Dry-run mode enabled:', globalDryRun.isEnabled());
    
    // Simulate file operations
    globalDryRun.recordFileOperation('create', '/src/components/NewComponent.tsx', 'component content');
    globalDryRun.recordFileOperation('update', '/src/App.tsx', 'updated app content', 'original app content');
    globalDryRun.recordFileOperation('delete', '/src/OldComponent.tsx');
    
    // Get dry-run summary
    const dryRunSummary = globalDryRun.getSummary();
    console.log('Dry-run summary:');
    console.log(`- Files to create: ${dryRunSummary.operations.create}`);
    console.log(`- Files to update: ${dryRunSummary.operations.update}`);
    console.log(`- Files to delete: ${dryRunSummary.operations.delete}`);
    console.log(`- Total operations: ${dryRunSummary.totalOperations}`);
    
    // Export as JSON
    const dryRunJson = globalDryRun.exportAsJson();
    console.log('Dry-run data exported for API preview\n');
    
    // Disable dry-run mode
    globalDryRun.disable();

    // 5. Dependency-based Ordering Demo
    console.log('📋 5. DEPENDENCY-BASED ORDERING DEMO');
    console.log('=' .repeat(50));
    
    const dependencyOrdering = createDependencyOrdering();
    
    // Sample stories with dependencies
    const stories = [
      {
        id: 'story-header',
        dependencies: [],
        priority: 1,
        metadata: { title: 'Create Header Component' }
      },
      {
        id: 'story-navigation',
        dependencies: ['story-header'],
        priority: 2,
        metadata: { title: 'Create Navigation Component' }
      },
      {
        id: 'story-main-page',
        dependencies: ['story-header', 'story-navigation'],
        priority: 3,
        metadata: { title: 'Create Main Page' }
      },
      {
        id: 'story-footer',
        dependencies: [],
        priority: 1,
        metadata: { title: 'Create Footer Component' }
      }
    ];
    
    // Build dependency graph
    dependencyOrdering.buildFromStories(stories);
    
    // Get processing order
    const readyNodes = dependencyOrdering.getReadyNodes();
    const dependencyLevels = dependencyOrdering.getDependencyLevels();
    
    console.log('Ready to process (no dependencies):', readyNodes);
    console.log('Dependency levels for parallel processing:');
    dependencyLevels.forEach((level, index) => {
      console.log(`  Level ${index}: [${level.join(', ')}]`);
    });
    
    // Get graph statistics
    const graphStats = dependencyOrdering.getGraphStats();
    console.log('Graph statistics:', graphStats, '\n');

    // 6. Plugin System Demo
    console.log('🔌 6. PLUGIN SYSTEM DEMO');
    console.log('=' .repeat(50));
    
    // Initialize plugin system
    await pluginSystem.initialize();
    
    // Create a sample plugin context
    const pluginContext = {
      jobId: 'demo-job-001',
      queueName: 'fe-draft',
      data: {
        userStory: {
          id: 'story-demo-plugin',
          title: 'Create Login Form',
          description: 'User can login with "username" and "password" fields'
        }
      },
      metadata: {
        timestamp: new Date(),
        worker: 'fe-draft'
      },
      timestamp: new Date()
    };
    
    // Execute plugin hooks
    console.log('Executing plugin hooks...');
    
    await pluginSystem.executeOnStart(pluginContext);
    console.log('✅ onStart hooks executed');
    
    await pluginSystem.executeOnProgress({
      ...pluginContext,
      progress: 50,
      message: 'Generating component'
    });
    console.log('✅ onProgress hooks executed');
    
    await pluginSystem.executeOnComplete({
      ...pluginContext,
      result: {
        success: true,
        generatedFiles: [
          {
            path: '/src/components/LoginForm.tsx',
            content: 'const LoginForm = () => { return <form>...</form>; }'
          }
        ]
      },
      duration: 5000
    });
    console.log('✅ onComplete hooks executed');
    
    // Get plugin statistics
    const pluginStats = pluginSystem.getStats();
    console.log('Plugin system statistics:', pluginStats, '\n');

    // Summary
    console.log('🎉 DEMO COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(50));
    console.log('All 6 enhanced features demonstrated:');
    console.log('✅ Token Persistence - Track and calculate costs');
    console.log('✅ Context Re-use - Cache LLM responses');
    console.log('✅ AST Patch Safe-merge - Safe code modifications');
    console.log('✅ Dry-run Mode - Preview changes without writing');
    console.log('✅ Dependency-based Ordering - Smart job scheduling');
    console.log('✅ Plugin System - Extensible architecture');
    
    // Cleanup
    await fs.rmdir(tempDir, { recursive: true });
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    console.error(error.stack);
  }
}

// Run the demo
if (require.main === module) {
  demonstrateEnhancedFeatures()
    .then(() => {
      console.log('\n🏁 Demo finished. Check the output above for results.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Demo crashed:', error);
      process.exit(1);
    });
}

module.exports = { demonstrateEnhancedFeatures };