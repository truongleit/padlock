import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded border border-neutral-300 bg-surface px-3 text-foreground text-sm placeholder:text-neutral-500 hover:border-neutral-400 focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary-100 aria-invalid:border-error-600 aria-invalid:ring-3 aria-invalid:ring-error-100";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "min-h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        control,
        "min-h-22 resize-y py-2.5 leading-normal",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(control, "min-h-11 appearance-none pr-9", className)}
        {...props}
      />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-600"
      />
    </div>
  );
}

/** Password input with the Show/Hide reveal button (FR-10). */
export function PasswordInput({
  className,
  ...props
}: ComponentProps<"input">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative grow">
      <Input
        className={cn("pr-[92px]", className)}
        type={show ? "text" : "password"}
        {...props}
      />
      <Button
        aria-pressed={show}
        className="absolute inset-y-1 right-1 min-h-0 px-2.5 text-[13px] [&_svg]:size-3.5"
        onClick={() => setShow(!show)}
        variant="ghost"
      >
        {show ? <EyeOff /> : <Eye />}
        {show ? "Hide" : "Show"}
      </Button>
    </div>
  );
}
