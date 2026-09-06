interface SupportActionBarProps {
  disabled?: boolean;
  onCall(): void;
  onEscalate(): void;
}
export function SupportActionBar({ disabled, onCall, onEscalate }: SupportActionBarProps) {
  return (
    <div className="flex gap-2 border-t pt-3">
      <button disabled={disabled} onClick={onCall}>
        Call
      </button>
      <button disabled={disabled} onClick={onEscalate}>
        Escalate
      </button>
    </div>
  );
}
