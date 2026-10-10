/** What an import produces: a draft for the editor, never a saved post. */
export interface ImportedDocument {
  /** From the document (Title style, metadata) when it has one. */
  title: string | null;
  markdown: string;
  /** What could not be carried over, in words for the author. */
  warnings: string[];
}

/** Stores an image found in the document; its path, or null if refused. */
export type SaveImage = (data: Buffer, mimetype: string) => Promise<string | null>;
