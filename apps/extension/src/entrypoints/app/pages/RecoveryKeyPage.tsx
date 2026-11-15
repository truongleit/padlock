import { Copy, Download, Printer } from "lucide-react";
import { useState } from "react";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox, hintClass } from "@/components/ui/field";
import { Note } from "@/components/ui/note";
import { navigate, routeState, useRedirect } from "@/lib/router";
import { useCopy } from "@/lib/use-copy";

function download(key: string) {
  const url = URL.createObjectURL(
    new Blob([`PadLock recovery key\n\n${key}\n`], { type: "text/plain" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "padlock-recovery-key.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/** W-02. The key arrives through route state only, so a reload never shows it again. */
export function RecoveryKeyPage() {
  const [key] = useState(() => routeState<string>());
  const [ack, setAck] = useState(false);
  const copy = useCopy();
  useRedirect(!key, "/vault");
  if (!key) return null;

  return (
    <AuthLayout footNote={false} wide>
      <AuthHeader title="Save your recovery key">
        Store this key somewhere safe, away from your master password.
      </AuthHeader>
      <Note role="note" tone="warn">
        <p>
          <strong>Shown only once.</strong> If you forget your master password,
          this key is the only way to restore your vault. PadLock does not store
          it.
        </p>
      </Note>
      <div className="border-primary-200 bg-primary-50 text-primary-950 grid grid-cols-4 gap-x-4 gap-y-3 rounded-lg border px-[22px] py-5 font-mono text-[17px] font-semibold tracking-[0.04em]">
        {key.split("-").map((group, i) => (
          <span key={i}>{group}</span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => copy(key, "Recovery key", true)}
          size="sm"
          variant="secondary"
        >
          <Copy aria-hidden />
          Copy
        </Button>
        <Button onClick={() => download(key)} size="sm" variant="secondary">
          <Download aria-hidden />
          Download
        </Button>
        <Button onClick={() => window.print()} size="sm" variant="secondary">
          <Printer aria-hidden />
          Print
        </Button>
      </div>
      <hr className="bg-border h-px border-0" />
      <Checkbox checked={ack} onChange={() => setAck(!ack)}>
        I have stored my recovery key in a safe place.
      </Checkbox>
      <div className="flex flex-col gap-2">
        <Button block disabled={!ack} onClick={() => navigate("/vault")}>
          Continue to my vault
        </Button>
        {!ack && (
          <p className={hintClass}>
            This button is enabled after you confirm above.
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
