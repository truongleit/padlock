import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const tones = {
  info: {
    className: "border-primary-200 bg-primary-50",
    icon: "text-primary-700",
    Icon: Info,
  },
  warn: {
    className: "border-warning-200 bg-warning-50",
    icon: "text-warning-700",
    Icon: TriangleAlert,
  },
  error: {
    className: "border-error-200 bg-error-50",
    icon: "text-error-700",
    Icon: TriangleAlert,
  },
  success: {
    className: "border-success-200 bg-success-50",
    icon: "text-success-700",
    Icon: CircleCheck,
  },
};

export function Note({
  tone = "info",
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  const t = tones[tone];
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3.5 text-[13.5px]/5 text-neutral-800 [&_strong]:font-[650]",
        t.className,
        className
      )}
      {...props}
    >
      <t.Icon
        aria-hidden
        className={cn("mt-px size-[18px] flex-none", t.icon)}
      />
      {children}
    </div>
  );
}
