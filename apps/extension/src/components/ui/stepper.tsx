import { Check } from "lucide-react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

/** Progress through a multi-step flow; `current` is the 0-based active step. */
export function Stepper({
  steps,
  current,
  label,
}: {
  steps: string[];
  current: number;
  label: string;
}) {
  return (
    <nav aria-label={label} className="flex w-full items-center gap-2">
      {steps.map((step, i) => (
        <Fragment key={step}>
          {i > 0 && (
            <hr
              className={cn(
                "mb-5 h-[1.5px] flex-1 border-0",
                i <= current ? "bg-primary" : "bg-neutral-300"
              )}
            />
          )}
          <div
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex min-w-[72px] flex-col items-center gap-1.5 text-center text-xs font-medium text-neutral-600",
              i <= current && "font-semibold text-neutral-900"
            )}
          >
            <b
              className={cn(
                "bg-surface grid size-7 place-items-center rounded-full border-[1.5px] border-neutral-300 text-[12.5px] font-[650] text-neutral-600",
                i < current &&
                  "border-primary bg-primary text-primary-foreground",
                i === current && "border-primary bg-primary-50 text-primary-700"
              )}
            >
              {i < current ? <Check aria-hidden className="size-3.5" /> : i + 1}
            </b>
            {step}
          </div>
        </Fragment>
      ))}
    </nav>
  );
}
