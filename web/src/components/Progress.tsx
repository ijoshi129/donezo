interface Props {
  remaining: number;
  done: number;
}

export function Progress({ remaining, done }: Props) {
  const total = remaining + done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="px-0.5">
      <div className="label-mono mb-2 flex items-baseline justify-between !text-ink-2">
        <span>
          <b className="font-semibold text-ink">{remaining}</b> Left · {done} Done
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-[9px] overflow-hidden border-[1.8px] border-ink bg-sheet-2">
        <div
          className="h-full bg-acid transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--acid) 0 6px, var(--acid-deep) 6px 12px)",
          }}
        />
      </div>
    </div>
  );
}
