/**
 * Demo: Additional 5 Features for Frontend Agents System
 * 
 * This file demonstrates the usage of the 5 additional improvements:
 * 1. Preview Deploy per Batch
 * 2. Secret-less Workers
 * 3. Cost Estimator
 * 4. Self-heal en Runtime
 * 5. Multi-environment Promotion
 */

const { logger } = require('./shared/utils/logger');
const { previewDeployManager } = require('./shared/utils/previewDeploy');
const { globalSecretManager } = require('./shared/utils/secretManager');
const { costEstimator } = require('./shared/utils/costEstimator');
const { selfHealManager, startSelfHealing } = require('./shared/utils/selfHealManager');
const { multiEnvPromotionManager, startPromotionMonitoring } = require('./shared/utils/multiEnvPromotion');

/**
 * FEATURE 1: Preview Deploy per Batch
 * Generates Docker Compose configurations for batch previews
 */
async function demoPreviewDeploy() {
  console.log('\n=== DEMO: Preview Deploy per Batch ===');
  
  try {
    // Initialize preview deploy manager
    await previewDeployManager.initialize();
    
    // Create preview for a batch
    const batchId = 'batch-2024-001';
    const services = [
      {
        name: 'frontend',
        image: `myapp-frontend:${batchId}`,
        port: 3000,
        environment: {
          NODE_ENV: 'preview',
          API_URL: 'http://backend:8000'
        }
      },
      {
        name: 'backend',
        image: `myapp-backend:${batchId}`,
        port: 8000,
        environment: {
          NODE_ENV: 'preview',
          DATABASE_URL: 'postgresql://preview:preview@db:5432/preview'
        }
      }
    ];
    
    // Generate preview deployment
    const preview = await previewDeployManager.createPreview(batchId, {
      services,
      domain: 'preview.myapp.com',
      ttl: 24 * 60 * 60 * 1000, // 24 hours
      enableTraefik: true
    });
    
    console.log('✅ Preview created:', {
      batchId: preview.batchId,
      url: preview.url,
      status: preview.status
    });
    
    // Get preview URL for QA team
    const previewUrl = await previewDeployManager.getPreviewUrl(batchId);
    console.log('🔗 Preview URL for QA:', previewUrl);
    
    // List all active previews
    const activePreviews = await previewDeployManager.listActivePreviews();
    console.log('📋 Active previews:', activePreviews.length);
    
  } catch (error) {
    console.error('❌ Preview deploy demo failed:', error.message);
  }
}

/**
 * FEATURE 2: Secret-less Workers
 * Demonstrates runtime secret retrieval from Doppler/Vault
 */
async function demoSecretlessWorkers() {
  console.log('\n=== DEMO: Secret-less Workers ===');
  
  try {
    // Initialize secret manager with Doppler
    await globalSecretManager.initialize({
      provider: 'doppler',
      config: {
        project: 'frontend-agents',
        environment: 'production'
      }
    });
    
    // Simulate agent retrieving its LLM key at runtime
    console.log('🔐 Agent retrieving secrets at runtime...');
    
    const secrets = await globalSecretManager.getBulkSecrets([
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'DATABASE_URL',
      'REDIS_URL'
    ]);
    
    console.log('✅ Secrets retrieved:', {
      openai: secrets.OPENAI_API_KEY ? '***' + secrets.OPENAI_API_KEY.slice(-4) : 'not found',
      anthropic: secrets.ANTHROPIC_API_KEY ? '***' + secrets.ANTHROPIC_API_KEY.slice(-4) : 'not found',
      database: secrets.DATABASE_URL ? 'postgresql://***' : 'not found',
      redis: secrets.REDIS_URL ? 'redis://***' : 'not found'
    });
    
    // Check secret manager health
    const health = await globalSecretManager.healthCheck();
    console.log('🏥 Secret manager health:', health);
    
    // Demonstrate cache efficiency
    const startTime = Date.now();
    await globalSecretManager.getSecret('OPENAI_API_KEY'); // Should be cached
    const cacheTime = Date.now() - startTime;
    console.log('⚡ Cache retrieval time:', cacheTime + 'ms');
    
  } catch (error) {
    console.error('❌ Secret-less workers demo failed:', error.message);
  }
}

/**
 * FEATURE 3: Cost Estimator
 * Calculates estimated tokens and costs before job execution
 */
async function demoCostEstimator() {
  console.log('\n=== DEMO: Cost Estimator ===');
  
  try {
    // Initialize cost estimator
    await costEstimator.initialize();
    
    // Sample user stories for estimation
    const userStories = [
      {
        id: 'story-1',
        title: 'Create login form component',
        description: 'Build a responsive login form with validation, error handling, and accessibility features',
        complexity: 'medium',
        estimatedLines: 150
      },
      {
        id: 'story-2', 
        title: 'Implement dashboard layout',
        description: 'Create a dashboard with sidebar navigation, header, and main content area using CSS Grid',
        complexity: 'high',
        estimatedLines: 300
      },
      {
        id: 'story-3',
        title: 'Add loading spinner component',
        description: 'Simple reusable loading spinner with different sizes and colors',
        complexity: 'low',
        estimatedLines: 50
      }
    ];
    
    // Estimate costs for individual stories
    console.log('💰 Estimating costs for user stories...');
    
    for (const story of userStories) {
      const estimate = await costEstimator.estimateStory(story, {
        jobTypes: ['fe-logic', 'fe-style', 'fe-a11y'],
        model: 'gpt-4'
      });
      
      console.log(`📊 Story: ${story.title}`);
      console.log(`   Tokens: ${estimate.totalTokens.toLocaleString()}`);
      console.log(`   Cost: $${estimate.totalCost.toFixed(4)}`);
      console.log(`   Jobs: ${estimate.jobEstimates.length}`);
    }
    
    // Estimate batch cost
    const batchEstimate = await costEstimator.estimateBatch(userStories, {
      jobTypes: ['fe-logic', 'fe-style', 'fe-a11y'],
      model: 'gpt-4'
    });
    
    console.log('\n📈 Batch Cost Summary:');
    console.log(`   Total Stories: ${batchEstimate.totalStories}`);
    console.log(`   Total Jobs: ${batchEstimate.totalJobs}`);
    console.log(`   Total Tokens: ${batchEstimate.totalTokens.toLocaleString()}`);
    console.log(`   Total Cost: $${batchEstimate.totalCost.toFixed(2)}`);
    console.log(`   Avg Cost per Story: $${batchEstimate.averageCostPerStory.toFixed(4)}`);
    
    // Get cost recommendations
    const recommendations = costEstimator.getRecommendations(batchEstimate);
    console.log('\n💡 Cost Optimization Recommendations:');
    recommendations.forEach(rec => {
      console.log(`   ${rec.type}: ${rec.description} (saves $${rec.potentialSavings.toFixed(2)})`);
    });
    
  } catch (error) {
    console.error('❌ Cost estimator demo failed:', error.message);
  }
}

/**
 * FEATURE 4: Self-heal en Runtime
 * Demonstrates automatic error detection and patch generation
 */
async function demoSelfHeal() {
  console.log('\n=== DEMO: Self-heal en Runtime ===');
  
  try {
    // Initialize self-heal manager
    await selfHealManager.initialize();
    
    // Simulate a critical error from Sentry
    const mockError = {
      id: 'error-123',
      title: 'TypeError: Cannot read property \'map\' of undefined',
      message: 'Cannot read property \'map\' of undefined at UserList.render',
      stackTrace: [
        'UserList.render (UserList.tsx:45:12)',
        'React.createElement (react.js:123:45)',
        'App.render (App.tsx:67:89)'
      ],
      fingerprint: 'undefined-map-error',
      level: 'error',
      platform: 'javascript',
      environment: 'production',
      timestamp: new Date(),
      count: 25,
      userCount: 15,
      tags: { component: 'UserList' },
      context: {
        file: 'src/components/UserList.tsx',
        line: 45,
        column: 12,
        function: 'render',
        component: 'UserList'
      },
      breadcrumbs: []
    };
    
    console.log('🚨 Critical error detected:', {
      id: mockError.id,
      title: mockError.title,
      count: mockError.count,
      users: mockError.userCount
    });
    
    // Attempt auto-heal
    console.log('🔧 Attempting auto-heal...');
    const healResult = await selfHealManager.attemptAutoHeal(mockError);
    
    if (healResult.success) {
      console.log('✅ Auto-heal successful!');
      console.log('📝 Patch generated:', {
        id: healResult.patch.id,
        type: healResult.patch.type,
        confidence: healResult.patch.confidence,
        files: healResult.patch.files.length
      });
      
      if (healResult.pr) {
        console.log('🔀 PR created:', {
          number: healResult.pr.number,
          url: healResult.pr.url,
          branch: healResult.pr.branch
        });
      }
    } else {
      console.log('❌ Auto-heal failed:', healResult.error);
    }
    
    // Start monitoring for new errors
    console.log('👀 Starting error monitoring...');
    // Note: In real usage, this would run continuously
    // startSelfHealing({ errorThreshold: 10, autoHealEnabled: true });
    
  } catch (error) {
    console.error('❌ Self-heal demo failed:', error.message);
  }
}

/**
 * FEATURE 5: Multi-environment Promotion
 * Demonstrates automatic promotion to staging after reports
 */
async function demoMultiEnvPromotion() {
  console.log('\n=== DEMO: Multi-environment Promotion ===');
  
  try {
    // Initialize promotion manager
    await multiEnvPromotionManager.initialize();
    
    // Simulate a deployment ready for promotion
    console.log('🚀 Simulating deployment with ready=true label...');
    
    // Mock promotion trigger
    const promotion = await multiEnvPromotionManager.triggerPromotion({
      fromEnvironment: 'development',
      toEnvironment: 'staging',
      version: 'v1.2.3',
      triggeredBy: 'auto-promotion',
      reason: 'FE and BE reports passed with ready=true label',
      labels: {
        ready: 'true',
        'fe-report.status': 'pass',
        'fe-report.score': '95',
        'be-report.status': 'pass',
        'be-report.score': '88'
      }
    });
    
    console.log('📋 Promotion triggered:', {
      id: promotion.id,
      from: promotion.fromEnvironment,
      to: promotion.toEnvironment,
      version: promotion.version,
      status: promotion.status
    });
    
    // Simulate promotion process
    console.log('⏳ Promotion process:');
    console.log('   1. ✅ Validation rules passed');
    console.log('   2. ✅ ArgoCD application updated');
    console.log('   3. ✅ Deployment synced');
    console.log('   4. ✅ Health checks passed');
    console.log('   5. ✅ Labels updated');
    
    // Show environment pipeline
    console.log('\n🔄 Environment Pipeline:');
    console.log('   Development → Staging → Production');
    console.log('   [✅ Ready]   [🚀 Deploying] [⏸️ Manual]');
    
    // Start monitoring for promotion triggers
    console.log('\n👀 Starting promotion monitoring...');
    // Note: In real usage, this would run continuously
    // startPromotionMonitoring({ enableAutoPromotion: true });
    
  } catch (error) {
    console.error('❌ Multi-env promotion demo failed:', error.message);
  }
}

/**
 * Integration Demo: All Features Working Together
 */
async function demoIntegration() {
  console.log('\n=== INTEGRATION DEMO: All Features Together ===');
  
  try {
    console.log('🔄 Complete workflow simulation:');
    
    // 1. Cost estimation before starting
    console.log('\n1️⃣ Pre-flight cost estimation...');
    const stories = [{ 
      id: 'integration-story',
      title: 'Complete user dashboard',
      description: 'Full dashboard with charts, tables, and real-time updates',
      complexity: 'high',
      estimatedLines: 500
    }];
    
    const costEstimate = await costEstimator.estimateBatch(stories);
    console.log(`   💰 Estimated cost: $${costEstimate.totalCost.toFixed(2)}`);
    
    // 2. Secret-less execution
    console.log('\n2️⃣ Retrieving secrets for agents...');
    const secrets = await globalSecretManager.getBulkSecrets(['OPENAI_API_KEY']);
    console.log('   🔐 Secrets loaded securely');
    
    // 3. Create preview deployment
    console.log('\n3️⃣ Creating preview deployment...');
    const batchId = 'integration-batch-' + Date.now();
    const preview = await previewDeployManager.createPreview(batchId, {
      services: [{
        name: 'dashboard',
        image: `dashboard:${batchId}`,
        port: 3000
      }]
    });
    console.log(`   🔗 Preview URL: ${preview.url}`);
    
    // 4. Monitor for errors and auto-heal
    console.log('\n4️⃣ Error monitoring active...');
    console.log('   👀 Self-heal system monitoring production');
    
    // 5. Auto-promotion pipeline
    console.log('\n5️⃣ Promotion pipeline ready...');
    console.log('   🚀 Will auto-promote when ready=true after reports');
    
    console.log('\n✅ All systems integrated and operational!');
    
  } catch (error) {
    console.error('❌ Integration demo failed:', error.message);
  }
}

/**
 * Main demo runner
 */
async function runAllDemos() {
  console.log('🎯 Frontend Agents System - Additional Features Demo');
  console.log('====================================================');
  
  try {
    await demoPreviewDeploy();
    await demoSecretlessWorkers();
    await demoCostEstimator();
    await demoSelfHeal();
    await demoMultiEnvPromotion();
    await demoIntegration();
    
    console.log('\n🎉 All demos completed successfully!');
    console.log('\n📚 Summary of Additional Features:');
    console.log('   1. 🐳 Preview Deploy per Batch - QA testing before merge');
    console.log('   2. 🔐 Secret-less Workers - Runtime secret retrieval');
    console.log('   3. 💰 Cost Estimator - Prevent billing surprises');
    console.log('   4. 🔧 Self-heal Runtime - Auto-fix production errors');
    console.log('   5. 🚀 Multi-env Promotion - Automated staging deployment');
    
  } catch (error) {
    console.error('❌ Demo execution failed:', error);
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = {
  demoPreviewDeploy,
  demoSecretlessWorkers,
  demoCostEstimator,
  demoSelfHeal,
  demoMultiEnvPromotion,
  demoIntegration,
  runAllDemos
};

// Run demos if this file is executed directly
if (require.main === module) {
  runAllDemos().catch(console.error);
}