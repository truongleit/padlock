import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <ToggleGroup.Root
      aria-label={label}
      className="bg-muted inline-flex gap-1 self-start rounded-[10px] p-1"
      onValueChange={(v) => v && onValueChange(v as T)}
      type="single"
      value={value}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          className="focus-visible:outline-ring data-[state=on]:bg-surface data-[state=on]:text-primary-700 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[7px] px-4 text-sm font-semibold text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 data-[state=on]:shadow-[0_1px_2px_rgb(15_23_42/0.12),0_0_0_1px_var(--color-border)]"
          key={o.value}
          value={o.value}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
