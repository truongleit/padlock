import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "focus-visible:outline-ring disabled:border-border disabled:bg-muted inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded border border-transparent px-[18px] text-sm leading-none font-semibold whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:text-neutral-500 [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-700",
        secondary:
          "bg-surface border-neutral-300 text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50 hover:text-neutral-900",
        ghost: "text-primary-700 hover:bg-primary-50 bg-transparent",
        danger: "bg-error-700 text-primary-foreground hover:bg-error-800",
        "danger-quiet":
          "border-error-200 bg-surface text-error-700 hover:bg-error-50",
        link: "text-primary-700 hover:text-primary-800 border-0 bg-transparent px-0 disabled:bg-transparent",
      },
      size: {
        default: "",
        sm: "min-h-10 px-3.5 text-[13px] [&_svg]:size-3.5",
        icon: "min-w-11 px-0",
        "icon-sm": "min-h-10 min-w-10 px-0",
      },
      block: { true: "flex w-full" },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export function Button({
  className,
  variant,
  size,
  block,
  asChild,
  type = "button",
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, block }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}
