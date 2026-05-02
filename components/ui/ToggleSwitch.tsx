/**
 * ToggleSwitch
 *
 * A mobile-native feeling toggle switch to replace <input type="checkbox">
 * in forms. The native checkbox renders as a system widget on iOS/Android
 * which looks out of place in a custom-designed PWA.
 *
 * Usage:
 *   <ToggleSwitch
 *     label="Do you play senior tees?"
 *     checked={value}
 *     onChange={setValue}
 *   />
 */

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function ToggleSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted px-3 py-3 cursor-pointer select-none">
      <span className="text-xs font-medium text-ink-body">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
          transition-colors duration-200 ease-in-out focus:outline-none
          focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2
          disabled:opacity-50
          ${checked ? "bg-brand-600" : "bg-surface-overlay"}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white shadow-sm
            transition-transform duration-200 ease-in-out
            ${checked ? "translate-x-6" : "translate-x-1"}
          `}
        />
      </button>
    </label>
  );
}
