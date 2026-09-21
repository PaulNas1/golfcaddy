import type { ValidationIssue } from "@/lib/courseValidation";

const GENDER_LABEL: Record<string, string> = {
  men: "Men's",
  women: "Women's",
  mixed: "Mixed",
};

export function genderLabel(gender: string): string {
  return GENDER_LABEL[gender] ?? gender;
}

/**
 * The correctness feedback loop for the whole feature (Brief 1 §5).
 *
 * Blocking issues are red and stop the save. Warnings are amber and only
 * ask for a confirmation — a real club card sometimes genuinely has an odd
 * par total or a missing distance, and an admin who knows that should not be
 * stuck.
 */
export function TeeIssueList({
  issues,
  className = "",
}: {
  issues: ValidationIssue[];
  className?: string;
}) {
  if (issues.length === 0) return null;

  const blocking = issues.filter((issue) => issue.severity === "block");
  const warnings = issues.filter((issue) => issue.severity === "warn");

  return (
    <div className={`space-y-2 ${className}`}>
      {blocking.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-red-700">
            Cannot save
          </p>
          <ul className="mt-1.5 space-y-1">
            {blocking.map((issue) => (
              <li key={`${issue.code}-${issue.message}`} className="text-xs text-red-700">
                <span className="font-semibold">{issue.code}</span> · {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
            Check before saving
          </p>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((issue) => (
              <li key={`${issue.code}-${issue.message}`} className="text-xs text-amber-700">
                <span className="font-semibold">{issue.code}</span> · {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
