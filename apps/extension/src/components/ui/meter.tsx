import { Check, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import type { Level } from "@/lib/strength";
import { cn } from "@/lib/utils";

const FILL = [
  "",
  "bg-error-600",
  "bg-warning-600",
  "bg-success-600",
  "bg-success-600",
];

/** 4-bar strength meter with a coloured label (FR-5.4). */
export function Meter({
  level,
  label,
  aside,
}: {
  level: Level;
  label?: ReactNode;
  aside?: ReactNode;
}) {
  const ok = level >= 3;
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <i
            className={cn(
              "h-1 flex-1 rounded-xs bg-neutral-200",
              i <= level && FILL[level]
            )}
            key={i}
          />
        ))}
      </div>
      {label && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 text-[12.5px] font-semibold",
              ok
                ? "text-success-700"
                : level === 2
                  ? "text-warning-700"
                  : "text-error-700"
            )}
          >
            {ok ? (
              <Check aria-hidden className="size-3.5" />
            ) : (
              <TriangleAlert aria-hidden className="size-3.5" />
            )}
            {label}
          </span>
          {aside}
        </div>
      )}
    </div>
  );
}
