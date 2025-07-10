// Simple test script to demonstrate Zod validation
const { z } = require('zod');

// Since we can't directly require TypeScript files, let's demonstrate the validation concept
console.log('📋 Note: This demonstrates the Zod validation concept.');
console.log('   In the actual TypeScript workers, the validation is fully implemented.');
console.log('');

// Define a simplified schema for demonstration
const userStorySchema = z.object({
  id: z.string().min(1, 'User story ID is required'),
  title: z.string().min(1, 'User story title is required'),
  description: z.string().min(1, 'User story description is required'),
  acceptanceCriteria: z.array(z.string()).min(1, 'At least one acceptance criteria is required'),
  priority: z.number().min(1).max(10, 'Priority must be between 1 and 10'),
  complexity: z.number().min(1).max(10, 'Complexity must be between 1 and 10')
});

const componentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  path: z.string().min(1, 'Component path is required'),
  type: z.enum(['page', 'component', 'layout'], {
    errorMap: () => ({ message: 'Component type must be page, component, or layout' })
  })
});

const projectSchema = z.object({
  framework: z.string().min(1, 'Framework is required'),
  styling: z.enum(['css', 'scss', 'tailwind', 'styled-components'], {
    errorMap: () => ({ message: 'Styling must be css, scss, tailwind, or styled-components' })
  }),
  typescript: z.boolean().optional()
});

const feLogicJobSchema = z.object({
  userStory: userStorySchema,
  component: componentSchema,
  project: projectSchema,
  requirements: z.object({
    businessLogic: z.array(z.string()).min(1, 'Business logic requirements are required')
  })
});

// Validation helper function
function validateJobData(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      }).join('; ');
      
      throw new Error(`Job data validation failed: ${errorMessages}`);
    }
    throw error;
  }
}

console.log('🧪 Testing Zod Validation for Job Data\n');

// Test 1: Valid fe-logic job data
console.log('✅ Test 1: Valid fe-logic job data');
const validLogicData = {
  userStory: {
    id: 'story-123',
    title: 'User Login Feature',
    description: 'As a user, I want to log in to access my account',
    acceptanceCriteria: ['User can enter credentials', 'System validates credentials'],
    priority: 8,
    complexity: 5
  },
  component: {
    name: 'LoginForm',
    path: '/src/components/LoginForm.tsx',
    type: 'component'
  },
  project: {
    framework: 'React',
    styling: 'tailwind',
    typescript: true
  },
  requirements: {
    businessLogic: ['Form validation', 'Authentication']
  }
};

try {
  const result = validateJobData(feLogicJobSchema, validLogicData);
  console.log('   ✓ Validation passed successfully');
  console.log('   ✓ Component name:', result.component.name);
  console.log('   ✓ User story priority:', result.userStory.priority);
} catch (error) {
  console.log('   ✗ Unexpected validation error:', error.message);
}

// Test 2: Invalid data - missing required field
console.log('\n❌ Test 2: Invalid data - missing user story ID');
const invalidData = {
  userStory: {
    // id is missing!
    title: 'User Login Feature',
    description: 'As a user, I want to log in to access my account',
    acceptanceCriteria: ['User can enter credentials'],
    priority: 8,
    complexity: 5
  },
  component: {
    name: 'LoginForm',
    path: '/src/components/LoginForm.tsx',
    type: 'component'
  },
  project: {
    framework: 'React',
    styling: 'tailwind'
  },
  requirements: {
    businessLogic: ['Form validation']
  }
};

try {
  validateJobData(feLogicJobSchema, invalidData);
  console.log('   ✗ Validation should have failed!');
} catch (error) {
  console.log('   ✓ Validation correctly failed:', error.message);
}

// Test 3: Invalid data - wrong enum value
console.log('\n❌ Test 3: Invalid data - wrong component type');
const invalidEnumData = {
  userStory: {
    id: 'story-123',
    title: 'User Login Feature',
    description: 'As a user, I want to log in to access my account',
    acceptanceCriteria: ['User can enter credentials'],
    priority: 8,
    complexity: 5
  },
  component: {
    name: 'LoginForm',
    path: '/src/components/LoginForm.tsx',
    type: 'invalid-type' // Should be 'page', 'component', or 'layout'
  },
  project: {
    framework: 'React',
    styling: 'tailwind'
  },
  requirements: {
    businessLogic: ['Form validation']
  }
};

try {
  validateJobData(feLogicJobSchema, invalidEnumData);
  console.log('   ✗ Validation should have failed!');
} catch (error) {
  console.log('   ✓ Validation correctly failed:', error.message);
}

// Test 4: Valid data with optional fields
console.log('\n✅ Test 4: Valid data with optional TypeScript field');
const validOptionalData = {
  userStory: {
    id: 'story-456',
    title: 'Responsive Design',
    description: 'Make the login form responsive',
    acceptanceCriteria: ['Works on mobile', 'Works on desktop'],
    priority: 6,
    complexity: 3
  },
  component: {
    name: 'LoginForm',
    path: '/src/components/LoginForm.tsx',
    type: 'component'
  },
  project: {
    framework: 'React',
    styling: 'scss',
    typescript: true // Optional field
  },
  requirements: {
    businessLogic: ['Form validation', 'State management']
  }
};

try {
  const result = validateJobData(feLogicJobSchema, validOptionalData);
  console.log('   ✓ Validation passed successfully');
  console.log('   ✓ TypeScript enabled:', result.project.typescript);
  console.log('   ✓ Business logic count:', result.requirements.businessLogic.length);
} catch (error) {
  console.log('   ✗ Unexpected validation error:', error.message);
}

console.log('\n🎉 Validation tests completed!');
console.log('\n📝 Summary:');
console.log('   • Zod validation prevents runtime errors from invalid job data');
console.log('   • Clear error messages help identify issues quickly');
console.log('   • Type safety ensures data structure consistency');
console.log('   • Workers are now protected from malformed payloads');