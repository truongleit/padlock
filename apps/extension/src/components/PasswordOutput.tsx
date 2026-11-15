import { Copy, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Meter } from "@/components/ui/meter";
import { LEVEL_LABELS, level, score } from "@/lib/strength";
import { useCopy } from "@/lib/use-copy";

/** Generated-password box with its score, Regenerate, Copy and extra actions. */
export function PasswordOutput({
  password,
  scoreLabel,
  onRegenerate,
  children,
}: {
  password: string;
  scoreLabel?: string;
  onRegenerate: () => void;
  children?: ReactNode;
}) {
  const copy = useCopy();
  const s = score(password);
  const lvl = level(s);
  return (
    <div className="flex flex-col gap-5">
      <div
        aria-live="polite"
        className="bg-surface-muted flex min-h-22 items-center justify-center rounded-lg border border-neutral-300 px-5 py-4 text-center font-mono text-2xl font-medium tracking-[0.02em] wrap-anywhere text-neutral-900"
      >
        {password}
      </div>
      <Meter
        label={`Score ${s} · ${scoreLabel ?? LEVEL_LABELS[lvl]}`}
        level={lvl}
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={onRegenerate} variant="secondary">
          <RefreshCw aria-hidden />
          Regenerate
        </Button>
        <Button
          onClick={() => copy(password, "Password", true)}
          variant="secondary"
        >
          <Copy aria-hidden />
          Copy
        </Button>
        {children}
      </div>
    </div>
  );
}
