import 'server-only';
import { z } from 'zod';

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Megabytes (conservative limit for in-memory streaming)
export const MIN_FILE_SIZE_BYTES = 1; // Disallow empty 0-byte files

export const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_CATEGORIES = [
  'general',
  'financial',
  'legal',
  'personal',
  'technical',
] as const;

/**
 * Zod schema for validating non-file document metadata inputs.
 */
export const documentMetadataInputSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Document name cannot be empty')
    .max(255, 'Document name cannot exceed 255 characters')
    .refine((val) => !/[\x00-\x1F\x7F]/.test(val), {
      message: 'Document name cannot contain control characters',
    })
    .refine((val) => !/[<>]/.test(val), {
      message: 'Document name cannot contain HTML brackets',
    })
    .refine((val) => !/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(val), {
      message: 'Document name cannot contain path traversal sequences',
    }),
  category: z
    .string()
    .trim()
    .max(50, 'Category cannot exceed 50 characters')
    .optional()
    .default('general'),
});

export type DocumentMetadataInput = z.infer<typeof documentMetadataInputSchema>;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  detectedMimeType?: AllowedMimeType;
  sanitizedFilename: string;
}

/**
 * Validates file magic bytes (signatures) against the file buffer to prevent MIME spoofing.
 */
export function detectMagicBytes(buffer: Uint8Array): AllowedMimeType | null {
  if (buffer.length < 4) {
    return null;
  }

  // PDF signature: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // PNG signature: \x89PNG\r\n\x1a\n (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG signature: \xFF\xD8\xFF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  // Plain text validation:
  // Must be valid UTF-8/ASCII and contain zero null bytes (0x00) or binary control sequences
  let isText = true;
  for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
    const byte = buffer[i];
    // Reject null byte (typical in executables/binaries)
    if (byte === 0x00) {
      isText = false;
      break;
    }
  }

  if (isText) {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      decoder.decode(buffer.subarray(0, Math.min(buffer.length, 4096)));
      return 'text/plain';
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Sanitizes display filenames by stripping directory paths, null bytes,
 * and dangerous shell/header characters.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'document';

  // 1. Remove path separators and directories
  const basename = filename.split(/[/\\]/).pop() || 'document';

  // 2. Remove null bytes and non-printable control characters
  let clean = basename.replace(/[\x00-\x1F\x7F]/g, '');

  // 3. Remove path traversal patterns
  clean = clean.replace(/\.\.+/g, '.');

  // 4. Strip dangerous characters (<, >, :, ", |, ?, *, ;, \r, \n)
  clean = clean.replace(/[<>:"|?*;\r\n]/g, '_');

  // 5. Collapse consecutive underscores
  clean = clean.replace(/_+/g, '_');

  // 6. Trim leading and trailing whitespace, dots, and underscores
  clean = clean.trim().replace(/^[\._]+|[\._]+$/g, '');

  if (!clean || clean === '') {
    return 'document';
  }

  return clean.slice(0, 255);
}

/**
 * Extracts and canonicalizes the file extension.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Comprehensive server-side file validator.
 * Enforces size limits, extension allow-listing, magic-byte inspection,
 * and filename safety.
 */
export function validateUploadedFile(
  fileBuffer: Uint8Array,
  originalFilename: string
): FileValidationResult {
  const sanitized = sanitizeFilename(originalFilename);

  // 1. File size checks
  if (fileBuffer.length < MIN_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: 'Uploaded file is empty (0 bytes)',
      sanitizedFilename: sanitized,
    };
  }

  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size (${fileBuffer.length} bytes) exceeds the maximum allowed limit of ${MAX_FILE_SIZE_BYTES} bytes (15MB)`,
      sanitizedFilename: sanitized,
    };
  }

  // 2. Filename safety checks
  if (/[\x00]/.test(originalFilename) || /\.\./.test(originalFilename)) {
    return {
      isValid: false,
      error: 'Unsafe filename: null bytes and path traversal sequences are strictly prohibited',
      sanitizedFilename: sanitized,
    };
  }

  // 3. Extension allow-list check
  const ext = getFileExtension(originalFilename);
  if (!ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    return {
      isValid: false,
      error: `File extension '${ext}' is not permitted. Only PDF, PNG, JPEG, and plain text files (.txt) are allowed.`,
      sanitizedFilename: sanitized,
    };
  }

  // 4. Magic-byte inspection (do NOT trust client-supplied MIME headers)
  const detectedType = detectMagicBytes(fileBuffer);
  if (!detectedType) {
    return {
      isValid: false,
      error: 'File content does not match allowed binary formats (invalid magic bytes or binary data detected)',
      sanitizedFilename: sanitized,
    };
  }

  // 5. Extension-to-MIME alignment check
  if (ext === '.pdf' && detectedType !== 'application/pdf') {
    return {
      isValid: false,
      error: 'File content mismatch: PDF extension does not match file bytes',
      sanitizedFilename: sanitized,
    };
  }

  if (ext === '.png' && detectedType !== 'image/png') {
    return {
      isValid: false,
      error: 'File content mismatch: PNG extension does not match file bytes',
      sanitizedFilename: sanitized,
    };
  }

  if (
    (ext === '.jpg' || ext === '.jpeg') &&
    detectedType !== 'image/jpeg'
  ) {
    return {
      isValid: false,
      error: 'File content mismatch: JPEG extension does not match file bytes',
      sanitizedFilename: sanitized,
    };
  }

  if (ext === '.txt' && detectedType !== 'text/plain') {
    return {
      isValid: false,
      error: 'File content mismatch: TXT extension contains invalid or binary characters',
      sanitizedFilename: sanitized,
    };
  }

  return {
    isValid: true,
    detectedMimeType: detectedType,
    sanitizedFilename: sanitized,
  };
}
