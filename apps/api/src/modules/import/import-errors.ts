import { UnprocessableEntityException } from '@nestjs/common';

/** Where in the uploaded file a problem is: whichever of these applies. */
export type ImportLocation = {
  row?: number;
  column?: string;
  line?: number;
  path?: string;
};

export type ImportIssue = ImportLocation & { message: string };

// Enough for an author to fix a file in a few passes without an unbounded body.
export const MAX_REPORTED_ISSUES = 100;

export function describeLocation(location: ImportLocation) {
  const parts: string[] = [];
  if (location.row !== undefined) parts.push(`Row ${location.row}`);
  if (location.column) parts.push(`Column ${location.column}`);
  if (location.line !== undefined) parts.push(`Line ${location.line}`);
  if (location.path) parts.push(location.path);
  return parts.join(', ');
}

/** "Row 5, Column D: Missing correct answer index". */
export function issueAt(location: ImportLocation, text: string): ImportIssue {
  const where = describeLocation(location);
  return { ...location, message: where ? `${where}: ${text}` : text };
}

/** 422 with every located problem, so the file can be fixed in one pass. */
export class ImportValidationException extends UnprocessableEntityException {
  constructor(issues: ImportIssue[]) {
    super({
      statusCode: 422,
      message: 'IMPORT_VALIDATION_FAILED',
      code: 'IMPORT_VALIDATION_FAILED',
      errors: issues.slice(0, MAX_REPORTED_ISSUES),
      totalErrors: issues.length,
    });
  }
}

export const failImport = (location: ImportLocation, text: string): never => {
  throw new ImportValidationException([issueAt(location, text)]);
};
