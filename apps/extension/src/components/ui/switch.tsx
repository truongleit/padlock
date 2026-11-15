import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "focus-visible:outline-ring data-[state=checked]:bg-primary relative inline-flex h-[26px] w-11 flex-none cursor-pointer rounded-full bg-neutral-300 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-surface block size-5 translate-x-[3px] rounded-full shadow-[0_1px_2px_rgb(15_23_42/0.3)] transition-transform data-[state=checked]:translate-x-[21px]" />
    </SwitchPrimitive.Root>
  );
}
