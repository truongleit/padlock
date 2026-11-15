import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-2.5 rounded bg-surface px-4 py-[11px] font-medium text-[13px] text-foreground shadow-float",
          success: "[&_[data-icon]]:text-success-700",
          error: "[&_[data-icon]]:text-error-700",
        },
      }}
    />
  );
}
