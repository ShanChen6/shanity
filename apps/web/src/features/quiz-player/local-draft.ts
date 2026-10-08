// A device-local copy of an answer that the server has not confirmed yet, so a
// dropped connection (or a closed tab) never loses what the learner typed.

export const localDraftKey = (attemptId: string, questionId: string) =>
  `shanity:essay-draft:${attemptId}:${questionId}`;

type Stored<T> = { value: T; at: number };

export function readLocalDraft<T>(key: string): Stored<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    return parsed && typeof parsed === "object" && "value" in parsed
      ? parsed
      : null;
  } catch {
    // Private mode, blocked storage or corrupt JSON: behave as if empty.
    return null;
  }
}

export function writeLocalDraft<T>(key: string, value: T) {
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ value, at: Date.now() } satisfies Stored<T>),
    );
  } catch {
    // Quota or blocked storage: the server copy still works while online.
  }
}

export function clearLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clean up.
  }
}
