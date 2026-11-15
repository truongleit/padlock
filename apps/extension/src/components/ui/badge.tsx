import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 items-center gap-[5px] rounded-full border pr-2.5 pl-[7px] text-xs font-semibold whitespace-nowrap [&_svg]:size-[13px]",
  {
    variants: {
      tone: {
        success: "border-success-200 bg-success-50 text-success-800",
        warning: "border-warning-200 bg-warning-50 text-warning-800",
        error: "border-error-200 bg-error-50 text-error-800",
        neutral: "border-border bg-muted text-neutral-700",
        primary: "border-primary-200 bg-primary-50 text-primary-800",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
