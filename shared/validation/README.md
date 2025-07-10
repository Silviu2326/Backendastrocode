# Job Data Validation with Zod

This directory contains Zod schemas for validating job data across all workers in the project. The validation prevents runtime errors caused by typos, missing fields, or payload structure changes.

## Overview

Each worker now validates `job.data` using Zod schemas before processing, ensuring:
- **Type Safety**: Validates data types and structure
- **Required Fields**: Ensures all mandatory fields are present
- **Data Integrity**: Prevents processing with malformed data
- **Error Prevention**: Catches issues early before they crash the queue

## Schemas

### Base Schemas
- `userStorySchema`: Validates user story structure
- `componentSchema`: Validates component metadata
- `projectSchema`: Validates project configuration

### Worker-Specific Schemas
- `feDraftJobSchema`: For fe-draft worker jobs
- `feLogicJobSchema`: For fe-logic worker jobs
- `feStyleJobSchema`: For fe-style worker jobs
- `feManagerJobSchema`: For fe-manager worker jobs

## Usage

### In Workers

```typescript
import { feLogicJobSchema, validateJobData } from '../../../shared/validation/jobSchemas';

// In worker handler
const worker = new Worker('queue-name', async (job) => {
  try {
    // Validate job.data before processing
    const validatedData = validateJobData(feLogicJobSchema, job.data);
    
    // Use validatedData instead of job.data
    const result = await processor.process(validatedData);
    return result;
  } catch (error) {
    // Validation errors are caught here
    logger.error('Job validation failed', { error: error.message });
    throw error;
  }
});
```

### Validation Function

The `validateJobData` function:
- Parses data using the provided Zod schema
- Returns validated and typed data on success
- Throws descriptive error on validation failure
- Formats error messages for easy debugging

## Error Handling

When validation fails, the error message includes:
- Field path that failed validation
- Specific validation error message
- All validation errors combined

Example error:
```
Job data validation failed: userStory.id: String must contain at least 1 character(s); component.name: Required
```

## Benefits

1. **Prevents Queue Crashes**: Invalid data is caught before processing
2. **Early Error Detection**: Issues are identified immediately
3. **Better Debugging**: Clear error messages show exactly what's wrong
4. **Type Safety**: TypeScript types are inferred from schemas
5. **Documentation**: Schemas serve as documentation for expected data structure

## Schema Validation Rules

### User Story
- `id`: Non-empty string
- `title`: Non-empty string
- `description`: Non-empty string
- `acceptanceCriteria`: Array with at least one item
- `priority`: Number between 1-10
- `complexity`: Number between 1-10

### Component
- `name`: Non-empty string
- `path`: Non-empty string
- `type`: Must be 'page', 'component', or 'layout'
- `props`: Optional array of component props
- `hooks`: Optional array of hook names
- `dependencies`: Optional array of dependency names

### Project
- `framework`: Non-empty string
- `styling`: Must be 'css', 'scss', 'tailwind', or 'styled-components'
- `typescript`: Optional boolean
- `stateManagement`: Optional string
- `apiClient`: Optional string

## Adding New Schemas

1. Define the schema using Zod:
```typescript
export const newWorkerJobSchema = z.object({
  // Define your schema here
});
```

2. Export the TypeScript type:
```typescript
export type NewWorkerJobData = z.infer<typeof newWorkerJobSchema>;
```

3. Use in your worker:
```typescript
import { newWorkerJobSchema, validateJobData } from '../path/to/jobSchemas';

const validatedData = validateJobData(newWorkerJobSchema, job.data);
```

## Testing

To test validation:

```typescript
import { validateJobData, feLogicJobSchema } from './jobSchemas';

// Valid data
const validData = {
  userStory: {
    id: 'story-1',
    title: 'Test Story',
    description: 'Test description',
    acceptanceCriteria: ['Criteria 1'],
    priority: 5,
    complexity: 3
  },
  // ... other required fields
};

try {
  const result = validateJobData(feLogicJobSchema, validData);
  console.log('Validation passed:', result);
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

## Migration Notes

All existing workers have been updated to include validation:
- ✅ fe-draft worker
- ✅ fe-logic worker
- ✅ fe-style worker
- ✅ fe-manager worker

The validation is backward compatible and will not break existing functionality, but will prevent future issues from malformed data.