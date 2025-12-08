export default function StatCard({
  value,
  label,
  onClick,
}: {
  value: number | string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-center"
    >
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[11px] text-[var(--text)]/60">{label}</div>
    </button>
  );
}
