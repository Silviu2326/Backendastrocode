# Enhanced Frontend Agents System

A powerful, type-safe, and observable system for automated frontend development with advanced features for production use.

## 🚀 Recent Enhancements (6 Major Improvements)

This system has been enhanced with 6 major improvements that significantly increase reliability, cost-effectiveness, and extensibility:

### 1. 📊 Token Persistence
**Location**: `backend/shared/utils/tokenTracker.ts`

- **What**: Tracks and persists token usage in Redis for every LLM call
- **Why**: Enables precise cost tracking per story, project, and time period
- **Benefits**:
  - Exact cost calculation per user story
  - Daily/hourly usage analytics
  - Budget monitoring and alerts
  - Cost optimization insights

```typescript
// Track tokens for a story
await tokenTracker.incrementStoryTokens('story-123', 1500, {
  projectId: 'project-abc',
  operation: 'fe-draft-generation',
  model: 'gpt-4',
  provider: 'openai'
});

// Get cost analysis
const cost = await tokenTracker.calculateCost(tokens, 'gpt-4');
```

### 2. 🔄 Context Re-use
**Location**: `backend/shared/utils/contextCache.ts`

- **What**: Caches LLM prompts and responses in Redis
- **Why**: Reduces token consumption by up to 20% on re-attempts
- **Benefits**:
  - Instant responses for repeated requests
  - Significant cost savings
  - Improved response times
  - Smart cache invalidation

```typescript
// Cache a response
await contextCache.set('component-skeleton:LoginForm', result, metadata);

// Retrieve cached response (saves tokens)
const cached = await contextCache.get('component-skeleton:LoginForm');
```

### 3. 🔧 AST Patch Safe-merge
**Location**: `backend/shared/utils/astPatcher.ts`

- **What**: Uses `ts-morph` for safe code modifications instead of string replacement
- **Why**: Zero risk of corrupting human-written code
- **Benefits**:
  - Safe import additions
  - Intelligent JSX modifications
  - Preserves code formatting
  - Prevents syntax errors

```typescript
const patcher = createAstPatcher();
await patcher.loadFile('Component.tsx');
patcher.addImport('useState', 'react');
patcher.addReactComponent('div', '<Button>Click</Button>', 'inside');
await patcher.saveChanges();
```

### 4. 🧪 Dry-run Mode
**Location**: `backend/shared/utils/dryRunMode.ts`

- **What**: Preview mode that executes LLM calls but doesn't write to disk
- **Why**: PMs can review changes before spending tokens on style/test generation
- **Benefits**:
  - Risk-free previews
  - Change validation
  - Cost control
  - Diff generation

```typescript
// Enable dry-run mode
globalDryRun.enable();

// All file operations are recorded, not executed
// Get preview of changes
const summary = globalDryRun.getSummary();
const htmlReport = globalDryRun.generateHtmlReport();
```

### 5. 📋 Dependency-based Ordering
**Location**: `backend/shared/utils/dependencyOrdering.ts`

- **What**: Calculates dependency graph and processes leaf nodes first
- **Why**: Prevents failures when story-102 depends on header from story-101
- **Benefits**:
  - Intelligent job scheduling
  - Reduced failure rates
  - Parallel processing optimization
  - Circular dependency detection

```typescript
const ordering = createDependencyOrdering();
ordering.buildFromStories(stories);
const readyNodes = ordering.getReadyNodes(); // Process these first
const levels = ordering.getDependencyLevels(); // For parallel processing
```

### 6. 🔌 Plugin System
**Location**: `backend/shared/utils/pluginSystem.ts`

- **What**: Extensible hook system with `onEnqueue`, `onComplete`, etc.
- **Why**: Add i18n, Cypress, mocks, etc. without touching core code
- **Benefits**:
  - Zero-impact extensibility
  - Community plugins
  - Custom workflows
  - Easy maintenance

```typescript
// Plugin hooks available:
// - onStart, onProgress, onComplete
// - onEnqueue, onError, onCancel

// Example: I18n plugin automatically adds translation support
class I18nPlugin {
  async onComplete(context) {
    // Add i18n imports and translation calls
    this.addI18nToGeneratedComponents(context.result);
  }
}
```

## 🏗️ System Architecture

### Core Components

```
backend/agents/
├── types/
│   └── queues.d.ts           # Type-safe job definitions
├── shared/
│   ├── tracing.ts            # OpenTelemetry integration
│   └── utils/
│       ├── tokenTracker.ts   # Token persistence
│       ├── contextCache.ts   # Context re-use
│       ├── astPatcher.ts     # Safe code merging
│       ├── dryRunMode.ts     # Preview mode
│       ├── dependencyOrdering.ts # Smart scheduling
│       └── pluginSystem.ts   # Extensibility
├── fe-manager/               # Orchestrator with all enhancements
├── fe-draft/                 # Component generation
├── fe-logic/                 # Business logic
├── fe-style/                 # Styling
├── fe-test/                  # Testing
├── fe-a11y/                  # Accessibility
├── fe-typefix/               # Type checking
├── fe-report/                # Reporting
└── plugins/                  # Plugin directory
    └── example-i18n-plugin.js
```

### Queue Configuration

```typescript
export const QUEUE_TIMEOUTS = {
  'fe-draft': { jobsOptions: { delay: 0 }, settings: { stalledInterval: 60000 } },
  'fe-logic': { jobsOptions: { delay: 5000 }, settings: { stalledInterval: 120000 } },
  'fe-style': { jobsOptions: { delay: 10000 }, settings: { stalledInterval: 90000 } },
  'fe-test': { jobsOptions: { delay: 15000 }, settings: { stalledInterval: 180000 } },
  'fe-a11y': { jobsOptions: { delay: 20000 }, settings: { stalledInterval: 120000 } },
  'fe-typefix': { jobsOptions: { delay: 25000 }, settings: { stalledInterval: 60000 } },
  'fe-report': { jobsOptions: { delay: 30000 }, settings: { stalledInterval: 90000 } },
  'fe-manager': { jobsOptions: { delay: 0 }, settings: { stalledInterval: 300000 } },
} as const;
```

## 🔧 Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password

# OpenTelemetry Tracing
JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_SERVICE_NAME=frontend-agents

# Token Tracking
OPENAI_API_KEY=your_openai_key
TOKEN_BUDGET_DAILY=100000
TOKEN_BUDGET_HOURLY=10000

# Dry-run Mode
DRY_RUN_ENABLED=false

# Plugin System
PLUGINS_DIRECTORY=./plugins
PLUGINS_ENABLED=true
```

### Dependencies

```json
{
  "dependencies": {
    "bullmq": "^4.15.0",
    "ioredis": "^5.3.2",
    "ts-morph": "^20.0.0",
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.45.0",
    "@opentelemetry/exporter-jaeger": "^1.18.0",
    "@opentelemetry/instrumentation-http": "^0.45.0",
    "@opentelemetry/instrumentation-express": "^0.34.0",
    "@opentelemetry/instrumentation-redis-4": "^0.35.0"
  }
}
```

## 🚀 Usage Examples

### Basic Job Processing

```typescript
import { Queue } from 'bullmq';
import { TypedJob, QueueMap } from './types/queues';

const draftQueue = new Queue<QueueMap['fe-draft']>('fe-draft');

// Type-safe job creation
const job = await draftQueue.add('generate-component', {
  userStory: {
    id: 'story-123',
    title: 'Create login form',
    description: 'User can login with username and password',
    priority: 'high',
    estimatedTokens: 1500
  },
  project: {
    id: 'project-abc',
    name: 'E-commerce App'
  }
});
```

### Enhanced Processing with All Features

```typescript
import { orchestrator } from './fe-manager/src/orchestrator';
import { globalDryRun } from './shared/utils/dryRunMode';
import { createDependencyOrdering } from './shared/utils/dependencyOrdering';

// Enable dry-run for preview
globalDryRun.enable();

// Create dependency ordering
const dependencyOrdering = createDependencyOrdering();
dependencyOrdering.buildFromStories(stories);

// Process with all enhancements
const result = await orchestrator.processStories(
  { stories, projectId: 'project-123' },
  {
    dryRun: true,
    dependencyOrdering,
    astPatcher: createAstPatcher(),
    contextCache,
    tokenTracker
  }
);

// Get preview of changes
const preview = globalDryRun.getSummary();
console.log(`Would create ${preview.operations.create} files`);
```

### Plugin Development

```typescript
class CustomPlugin {
  constructor() {
    this.name = 'custom-plugin';
    this.version = '1.0.0';
  }

  async onEnqueue(context) {
    console.log(`Job ${context.jobId} enqueued`);
  }

  async onComplete(context) {
    // Custom post-processing
    if (context.result.generatedFiles) {
      this.addCustomFeatures(context.result.generatedFiles);
    }
  }
}

module.exports = CustomPlugin;
```

## 📊 Monitoring & Observability

### OpenTelemetry Integration

- **Jaeger Tracing**: Full distributed tracing across all agents
- **Automatic Instrumentation**: HTTP, Express, Redis operations
- **Custom Spans**: Job processing, LLM calls, file operations
- **Performance Metrics**: Duration, token usage, error rates

### Token Analytics

```typescript
// Get comprehensive token usage
const analytics = {
  story: await tokenTracker.getStoryTokens('story-123'),
  project: await tokenTracker.getProjectTokens('project-abc'),
  daily: await tokenTracker.getDailyTokens(),
  hourly: await tokenTracker.getHourlyTokens()
};

// Calculate costs
const totalCost = await tokenTracker.calculateCost(
  analytics.project,
  'gpt-4'
);
```

### Cache Performance

```typescript
const cacheStats = await contextCache.getStats();
console.log(`Cache hit rate: ${cacheStats.hitRate}%`);
console.log(`Tokens saved: ${cacheStats.tokensSaved}`);
```

## 🧪 Testing

### Run Enhanced Features Demo

```bash
cd backend/agents
node demo-enhanced-features.js
```

### TypeScript Compilation Check

```bash
cd backend
npx tsc --noEmit --skipLibCheck
```

### Integration Tests

```bash
cd backend/agents
node test-enhanced-agents.js
```

## 🔍 Troubleshooting

### Common Issues

1. **Redis Connection Issues**
   ```bash
   # Check Redis connectivity
   redis-cli ping
   ```

2. **Plugin Loading Errors**
   ```bash
   # Check plugin directory permissions
   ls -la backend/agents/plugins/
   ```

3. **Token Tracking Issues**
   ```bash
   # Verify Redis keys
   redis-cli keys "tokens:*"
   ```

4. **AST Parsing Errors**
   ```typescript
   // Enable debug mode
   const patcher = createAstPatcher({ debug: true });
   ```

### Performance Optimization

1. **Cache Tuning**: Adjust TTL values based on usage patterns
2. **Dependency Optimization**: Use parallel processing for independent stories
3. **Token Budgeting**: Set appropriate daily/hourly limits
4. **Plugin Management**: Disable unused plugins for better performance

## 🤝 Contributing

### Adding New Features

1. Follow the existing patterns in `shared/utils/`
2. Add comprehensive TypeScript types
3. Include OpenTelemetry tracing
4. Write integration tests
5. Update documentation

### Plugin Development

1. Create plugin in `plugins/` directory
2. Implement required hooks
3. Add configuration options
4. Test with demo script
5. Document usage

## 📈 Roadmap

- [ ] **Advanced Analytics Dashboard**: Web UI for token usage and performance metrics
- [ ] **Smart Caching**: ML-based cache prediction and preloading
- [ ] **Plugin Marketplace**: Community plugin repository
- [ ] **Multi-model Support**: Support for Claude, Gemini, and other LLMs
- [ ] **Advanced Dependency Resolution**: Cross-project dependencies
- [ ] **Real-time Collaboration**: Multi-user story processing

---

**Built with ❤️ for efficient, cost-effective, and reliable frontend development automation.**