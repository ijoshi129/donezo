import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal } from "./Modal";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Lt" },
  { value: "dark", label: "Dk" },
];

export function SettingsModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    enabled: open,
  });

  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  const autoClear = useMutation({
    mutationFn: (on: boolean) => api.updateSettings({ autoClearNoon: on }),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Settings">
      <Row
        title="Clear completed at noon"
        hint="Finished tasks are removed daily at 12:00."
      >
        <Switch
          on={!!settings?.autoClearNoon}
          onClick={() => autoClear.mutate(!settings?.autoClearNoon)}
        />
      </Row>

      <Row title="Appearance" hint="Follow system, or force a theme." last>
        <div className="flex w-[150px] overflow-hidden rounded-md border-[1.8px] border-ink">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setTheme(t.value);
                setThemePref(t.value);
              }}
              className={`flex-1 border-r-[1.8px] border-ink py-2 font-mono text-[11px] uppercase last:border-r-0 ${
                theme === t.value
                  ? "bg-acid font-semibold text-on-acid"
                  : "text-ink-2"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Row>
    </Modal>
  );
}

function Row({
  title,
  hint,
  last,
  children,
}: {
  title: string;
  hint: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-4 ${
        last ? "" : "border-b-[1.5px] border-hair"
      }`}
    >
      <div>
        <div className="font-display text-[15px] font-semibold">{title}</div>
        <div className="mt-1 max-w-[30ch] font-mono text-[11px] leading-relaxed text-ink-2">
          {hint}
        </div>
      </div>
      {children}
    </div>
  );
}

function Switch({
  on,
  disabled,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full border-[1.8px] border-ink transition-colors disabled:opacity-40 ${
        on ? "bg-acid" : "bg-transparent"
      }`}
    >
      <span
        className={`absolute top-[2.5px] size-[19px] rounded-full transition-all ${
          on ? "left-[23.5px] bg-on-acid" : "left-[2.5px] bg-ink"
        }`}
      />
    </button>
  );
}
