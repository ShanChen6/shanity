// Generic attempt runner helpers, shared by course and standalone quizzes.

/** mm:ss, or h:mm:ss for an hour or more. Never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export type SaveState = "saving" | "saved" | "error";

/**
 * Autosave that keeps per-question writes in order: while one save of a
 * question is in flight, only its newest selection waits behind it, so the
 * server always ends with the latest choice and never a stale one.
 */
export class AutosaveQueue<T = unknown> {
  private inFlight = new Map<string, Promise<void>>();
  private pending = new Map<string, string[]>();

  constructor(
    private readonly send: (
      questionId: string,
      selection: string[],
    ) => Promise<T>,
    private readonly onState: (
      questionId: string,
      state: SaveState,
      error?: unknown,
      result?: T,
    ) => void,
  ) {}

  save(questionId: string, selection: string[]) {
    this.pending.set(questionId, selection);
    if (!this.inFlight.has(questionId)) this.drain(questionId);
  }

  private drain(questionId: string) {
    const selection = this.pending.get(questionId);
    if (!selection) {
      this.inFlight.delete(questionId);
      return;
    }
    this.pending.delete(questionId);
    this.onState(questionId, "saving");
    const run = this.send(questionId, selection)
      .then((result) => {
        if (!this.pending.has(questionId))
          this.onState(questionId, "saved", undefined, result);
      })
      .catch((error: unknown) => {
        // A newer selection still queued gets its own try.
        if (!this.pending.has(questionId))
          this.onState(questionId, "error", error);
      })
      .finally(() => this.drain(questionId));
    this.inFlight.set(questionId, run);
  }

  /** Resolves once every queued save has been sent. */
  async flush() {
    while (this.inFlight.size)
      await Promise.allSettled([...this.inFlight.values()]);
  }
}
