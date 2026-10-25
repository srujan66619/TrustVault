import { z } from 'zod';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_ACTIONS = [
  'LOGIN',
  'SYSTEM',
  'READ',
  'DOWNLOAD',
  'EDIT',
  'DELETE',
  'GRANT',
  'REVOKE',
  'VIEW_AUDIT',
  'AUDIT_VIEW',
  'AUDIT_VERIFY',
] as const;

const ALLOWED_RESULTS = [
  'SUCCESS',
  'ACCESS_DENIED',
  'FAILURE',
  'ALLOWED',
  'DENIED',
  'ERROR',
] as const;

/**
 * Zod schema for validating audit history query parameters.
 * Enforces strict limits, valid UUIDs, ISO dates, and known actions/results.
 */
export const auditHistoryQuerySchema = z
  .object({
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 50))
      .pipe(z.number().int().min(1).max(100)),
    offset: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 0))
      .pipe(z.number().int().min(0)),
    documentId: z
      .string()
      .regex(UUID_REGEX, { message: 'documentId must be a valid UUID' })
      .optional()
      .nullable(),
    action: z
      .enum(ALLOWED_ACTIONS, {
        message: 'Invalid audit action filter',
      })
      .optional()
      .nullable(),
    result: z
      .enum(ALLOWED_RESULTS, {
        message: 'Invalid audit result filter',
      })
      .optional()
      .nullable(),
    startTime: z
      .string()
      .refine(
        (val) => !val || !isNaN(Date.parse(val)),
        { message: 'startTime must be a valid ISO 8601 timestamp' }
      )
      .optional()
      .nullable(),
    endTime: z
      .string()
      .refine(
        (val) => !val || !isNaN(Date.parse(val)),
        { message: 'endTime must be a valid ISO 8601 timestamp' }
      )
      .optional()
      .nullable(),
  })
  .strict();

export type AuditHistoryQuery = z.infer<typeof auditHistoryQuerySchema>;
