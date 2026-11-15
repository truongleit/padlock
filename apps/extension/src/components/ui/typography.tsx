import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function H1({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1
      className={cn(
        "text-[28px]/[34px] font-[650] tracking-[-0.022em]",
        className
      )}
      {...props}
    />
  );
}

export function H2({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-xl/7 font-[650] tracking-[-0.015em]", className)}
      {...props}
    />
  );
}

export function H3({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("text-[15px]/[22px] font-semibold", className)}
      {...props}
    />
  );
}

export function PageHead({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <H1>{title}</H1>
      {description && <p className="text-muted-foreground">{description}</p>}
    </div>
  );
}
