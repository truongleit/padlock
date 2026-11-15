import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-6">
        <DialogPrimitive.Content
          className={cn(
            "bg-surface shadow-float flex w-full max-w-[460px] flex-col gap-4 rounded-[14px] p-6 focus:outline-none",
            className
          )}
          {...props}
        />
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}

export function DialogIcon({
  tone = "primary",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "primary" | "error" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-10 flex-none place-items-center rounded-full [&_svg]:size-[22px]",
        tone === "error"
          ? "bg-error-100 text-error-700"
          : "bg-primary-100 text-primary-700",
        className
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-xl/7 font-[650] tracking-[-0.015em]", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-sm/[22px]", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap justify-end gap-2.5", className)}
      {...props}
    />
  );
}
