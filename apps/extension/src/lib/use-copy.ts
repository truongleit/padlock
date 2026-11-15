import { toast } from "sonner";

import { useVault } from "@/components/VaultProvider";

/** FR-7.2, FR-7.3: copy, and wipe secrets after the configured delay. */
export function useCopy() {
  const { settings } = useVault();
  return async (value: string, what: string, secret = false) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
      return;
    }
    if (!secret) {
      toast.success(`${what} copied.`);
      return;
    }
    const secs = settings.clipboardClearSeconds;
    toast.success(`${what} copied. Clipboard clears in ${secs} s.`);
    // ponytail: the timer dies with the page (the popup closes on blur); an
    // offscreen document would clear it reliably.
    setTimeout(
      () => navigator.clipboard.writeText("").catch(() => {}),
      secs * 1000
    );
  };
}
