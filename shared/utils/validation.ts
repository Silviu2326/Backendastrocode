import {
  feDraftJobSchema,
  feLogicJobSchema,
  feStyleJobSchema,
  feManagerJobSchema,
  beDraftJobSchema,
  beLogicJobSchema,
  beTestJobSchema,
  beTypefixJobSchema,
  beManagerJobSchema,
  staticScanJobSchema,
  validateJobData as baseValidateJobData
} from '../validation/jobSchemas';

// Schema mapping for different queue types
const schemaMap = {
  'fe-draft': feDraftJobSchema,
  'fe-logic': feLogicJobSchema,
  'fe-style': feStyleJobSchema,
  'fe-manager': feManagerJobSchema,
  'be-draft': beDraftJobSchema,
  'be-logic': beLogicJobSchema,
  'be-test': beTestJobSchema,
  'be-typefix': beTypefixJobSchema,
  'be-manager': beManagerJobSchema,
  'static-scan': staticScanJobSchema
};

type QueueType = keyof typeof schemaMap;

// Validation function that takes queue type and data
export function validateJobData(queueType: QueueType, data: unknown): { success: boolean; error?: string; data?: any } {
  try {
    const schema = schemaMap[queueType];
    if (!schema) {
      return {
        success: false,
        error: `Unknown queue type: ${queueType}`
      };
    }

    const validatedData = baseValidateJobData(schema, data);
    return {
      success: true,
      data: validatedData
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed'
    };
  }
}

// Re-export the base validation function
export { baseValidateJobData };

// Export schema map for direct access if needed
export { schemaMap };