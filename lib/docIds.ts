// ─── Firestore document ids ─────────────────────────────────────────────────
//
// A document id has to be a non-empty string with no "/" in it. Anything else
// gets as far as ResourcePath.fromString inside the SDK and dies there:
//
//   n.split is not a function. (In 'n.split("/")', 'n.split' is undefined)
//
// doc() only validates its first argument, the collection name, which in our
// code is always a literal. The id after it is never checked, so a bad one
// reaches the SDK and comes back naming neither the collection, nor the field,
// nor the record it came from — nothing an admin can act on.
//
// Every id that comes out of stored data rather than a literal goes through
// here first.

export function isDocId(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && !value.includes("/")
  );
}

function preview(value: unknown): string {
  try {
    const json = JSON.stringify(value) ?? String(value);
    return json.length > 60 ? `${json.slice(0, 57)}…` : json;
  } catch {
    return String(value);
  }
}

/** Says what the value actually is, in words, for an error an admin reads. */
export function describeDocId(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "empty";
  if (Array.isArray(value)) return `a list — ${preview(value)}`;
  if (typeof value === "string") {
    if (value.trim().length === 0) return "blank";
    return `"${value}", which contains a "/"`;
  }
  if (typeof value === "object") return `an object — ${preview(value)}`;
  return `a ${typeof value} — ${preview(value)}`;
}

export function requireDocId(value: unknown, subject: string): string {
  if (isDocId(value)) return value;
  throw new Error(`${subject} is ${describeDocId(value)}.`);
}

/**
 * Collects bad ids rather than throwing at the first one, so a publish that
 * trips over three broken records names all three instead of one per attempt.
 */
export class DocIdProblems {
  private readonly problems: string[] = [];

  check(value: unknown, subject: string): void {
    if (isDocId(value)) return;
    const problem = `${subject} is ${describeDocId(value)}`;
    // Two records broken the same way in the same place read as one line
    // repeated, which looks like a rendering fault rather than two problems.
    if (!this.problems.includes(problem)) this.problems.push(problem);
  }

  get length(): number {
    return this.problems.length;
  }

  /** Throws one error naming every bad record, or returns if there are none. */
  throwIfAny(action: string): void {
    if (this.problems.length === 0) return;
    const list = this.problems.map((problem) => `• ${problem}`).join("\n");
    throw new Error(
      `${action} because ${
        this.problems.length === 1 ? "a record is" : "some records are"
      } missing an id:\n${list}\n\nThis is stored data, not a bug in the form — ` +
        "the records above need fixing before this will go through."
    );
  }
}
