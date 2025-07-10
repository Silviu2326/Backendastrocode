import { z } from 'zod';

// Base schemas for common structures
const userStorySchema = z.object({
  id: z.string().min(1, 'User story ID is required'),
  title: z.string().min(1, 'User story title is required'),
  description: z.string().min(1, 'User story description is required'),
  acceptanceCriteria: z.array(z.string()).min(1, 'At least one acceptance criteria is required'),
  priority: z.number().min(1).max(10, 'Priority must be between 1 and 10'),
  complexity: z.number().min(1).max(10, 'Complexity must be between 1 and 10')
});

const componentPropSchema = z.object({
  name: z.string().min(1, 'Prop name is required'),
  type: z.string().min(1, 'Prop type is required'),
  required: z.boolean(),
  description: z.string().optional(),
  defaultValue: z.any().optional()
});

const componentSchema = z.object({
  name: z.string().min(1, 'Component name is required'),
  path: z.string().min(1, 'Component path is required'),
  type: z.enum(['page', 'component', 'layout'], {
    errorMap: () => ({ message: 'Component type must be page, component, or layout' })
  }),
  existingCode: z.string().optional(),
  props: z.array(componentPropSchema).optional(),
  hooks: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  designTokens: z.object({
    colors: z.record(z.string()),
    spacing: z.record(z.string()),
    typography: z.record(z.any()),
    breakpoints: z.record(z.string())
  }).optional()
});

const projectSchema = z.object({
  framework: z.string().min(1, 'Framework is required'),
  typescript: z.boolean().optional(),
  styling: z.enum(['css', 'scss', 'tailwind', 'styled-components'], {
    errorMap: () => ({ message: 'Styling must be css, scss, tailwind, or styled-components' })
  }),
  stateManagement: z.string().optional(),
  apiClient: z.string().optional(),
  designSystem: z.object({
    theme: z.record(z.any()),
    components: z.record(z.any())
  }).optional()
});

// FE Draft Job Schema
export const feDraftJobSchema = z.object({
  id: z.string().min(1, 'Job ID is required'),
  stories: z.array(userStorySchema).min(1, 'At least one user story is required'),
  metadata: z.object({
    pageId: z.string().min(1, 'Page ID is required'),
    projectId: z.string().min(1, 'Project ID is required'),
    userId: z.string().min(1, 'User ID is required')
  }),
  project: projectSchema,
  component: componentSchema.optional(),
  requirements: z.object({
    componentType: z.string().min(1, 'Component type is required'),
    features: z.array(z.string()).min(1, 'At least one feature is required'),
    constraints: z.array(z.string()).optional()
  }).optional()
});

// FE Logic Job Schema
export const feLogicJobSchema = z.object({
  userStory: userStorySchema,
  component: componentSchema,
  project: projectSchema,
  requirements: z.object({
    businessLogic: z.array(z.string()).min(1, 'Business logic requirements are required'),
    stateManagement: z.array(z.string()).optional(),
    dataFetching: z.array(z.string()).optional(),
    eventHandling: z.array(z.string()).optional(),
    validation: z.array(z.string()).optional(),
    errorHandling: z.array(z.string()).optional()
  })
});

// FE Style Job Schema
export const feStyleJobSchema = z.object({
  userStory: userStorySchema,
  component: componentSchema,
  project: projectSchema,
  requirements: z.object({
    responsive: z.boolean().default(true),
    darkMode: z.boolean().default(false),
    animations: z.array(z.string()).optional(),
    accessibility: z.array(z.string()).optional(),
    browserSupport: z.array(z.string()).optional()
  }),
  operation: z.enum(['generate', 'enhance', 'optimize']).optional().default('generate')
});

// FE Manager Job Schema
export const feManagerJobSchema = z.object({
  storyId: z.string().min(1, 'Story ID is required').optional(),
  stories: z.array(userStorySchema).optional(),
  estimatedTokens: z.number().min(1, 'Estimated tokens must be positive').optional(),
  priority: z.number().min(1).max(100, 'Priority must be between 1 and 100').optional(),
  metadata: z.object({
    pageId: z.string().optional(),
    projectId: z.string().optional(),
    userId: z.string().optional()
  }).optional()
}).refine(
  (data) => data.storyId || (data.stories && data.stories.length > 0),
  {
    message: 'Either storyId or stories array must be provided',
    path: ['storyId']
  }
);

// Backend job schemas
export const beDraftJobSchema = z.object({
  userStory: userStorySchema,
  project: projectSchema,
  apiSpec: z.object({
    endpoints: z.array(z.object({
      path: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
      description: z.string(),
      parameters: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional()
      })).optional(),
      responses: z.array(z.object({
        status: z.number(),
        description: z.string(),
        schema: z.any().optional()
      })).optional()
    })),
    models: z.array(z.object({
      name: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean(),
        description: z.string().optional()
      })),
      relationships: z.array(z.object({
        type: z.enum(['hasOne', 'hasMany', 'belongsTo', 'belongsToMany']),
        model: z.string(),
        foreignKey: z.string().optional()
      })).optional()
    })),
    middleware: z.array(z.object({
      name: z.string(),
      type: z.enum(['auth', 'validation', 'logging', 'cors', 'rate-limit', 'custom']),
      config: z.any().optional()
    }))
  })
});

export const beLogicJobSchema = z.object({
  userStory: userStorySchema,
  project: projectSchema,
  businessRules: z.array(z.object({
    name: z.string(),
    description: z.string(),
    conditions: z.array(z.string()),
    actions: z.array(z.string())
  })),
  validationRules: z.array(z.object({
    field: z.string(),
    rules: z.array(z.string()),
    message: z.string().optional()
  })),
  integrations: z.array(z.object({
    name: z.string(),
    type: z.enum(['database', 'api', 'service', 'queue']),
    config: z.any()
  }))
});

export const beTestJobSchema = z.object({
  userStory: userStorySchema,
  project: projectSchema,
  testTypes: z.array(z.enum(['unit', 'integration', 'e2e', 'performance'])),
  coverage: z.object({
    minimum: z.number().min(0).max(100),
    target: z.number().min(0).max(100)
  })
});

export const beTypefixJobSchema = z.object({
  userStory: userStorySchema,
  project: projectSchema,
  typeIssues: z.array(z.object({
    file: z.string(),
    line: z.number(),
    column: z.number(),
    message: z.string(),
    code: z.string(),
    severity: z.enum(['error', 'warning'])
  }))
});

export const beManagerJobSchema = z.object({
  stories: z.array(userStorySchema.extend({
    apiImpact: z.boolean().optional()
  })),
  project: projectSchema,
  apiImpact: z.boolean()
});

// Static scan job schema
export const staticScanJobSchema = z.object({
  project: projectSchema,
  projectPath: z.string(),
  scanTypes: z.array(z.enum(['eslint', 'typescript', 'npm-audit', 'depcheck']))
});

// Type exports for TypeScript
export type FeDraftJobData = z.infer<typeof feDraftJobSchema>;
export type FeLogicJobData = z.infer<typeof feLogicJobSchema>;
export type FeStyleJobData = z.infer<typeof feStyleJobSchema>;
export type FeManagerJobData = z.infer<typeof feManagerJobData>;
export type BeDraftJobData = z.infer<typeof beDraftJobSchema>;
export type BeLogicJobData = z.infer<typeof beLogicJobSchema>;
export type BeTestJobData = z.infer<typeof beTestJobSchema>;
export type BeTypefixJobData = z.infer<typeof beTypefixJobSchema>;
export type BeManagerJobData = z.infer<typeof beManagerJobSchema>;
export type StaticScanJobData = z.infer<typeof staticScanJobSchema>;

// Validation helper function
export function validateJobData<T>(schema: z.ZodSchema<T>, data: unknown): T {
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