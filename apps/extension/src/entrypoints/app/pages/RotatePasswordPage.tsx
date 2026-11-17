import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { AppLayout, BackLink } from "@/components/AppLayout";
import { StatusBadge } from "@/components/CredentialRow";
import { PasswordOutput } from "@/components/PasswordOutput";
import { Button } from "@/components/ui/button";
import { hintClass } from "@/components/ui/field";
import { H2 } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import { errorText } from "@/lib/api";
import { randomPassword } from "@/lib/generator";
import { analyze, itemStatus } from "@/lib/health";
import { type Credential, saveCredential } from "@/lib/vault";

const DAY = 86_400_000;

/** W-13: change an expiring password (FR-6.4), keeping the same expiry interval. */
export function RotatePasswordPage({ item }: { item: Credential }) {
  const navigate = useNavigate();
  const { vaultKey, items, settings } = useVault();
  const gen = () =>
    randomPassword({
      ...settings.generatorDefaults,
      upper: true,
      lower: true,
      avoidAmbiguous: false,
    });
  const [password, setPassword] = useState(gen);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!vaultKey) return;
    setBusy(true);
    const interval = item.expiresAt
      ? Date.parse(item.expiresAt) - Date.parse(item.passwordChangedAt)
      : 0;
    const expiresAt =
      interval > 0
        ? new Date(Date.now() + Math.round(interval / DAY) * DAY)
            .toISOString()
            .slice(0, 10)
        : null;
    try {
      await saveCredential(vaultKey, { ...item, password, expiresAt }, item);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save. Try again."));
      setBusy(false);
      return;
    }
    toast.success(`Password for ${item.site} changed.`);
    void navigate(`/vault/${item.id}`);
  }

  return (
    <AppLayout className="max-w-[840px]">
      <BackLink to={`/vault/${item.id}`}>Back to credential</BackLink>
      <section
        aria-labelledby="rotate"
        className="border-border mt-4 flex flex-col gap-4 rounded-lg border p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <H2 id="rotate">Change password for {item.site}</H2>
          <StatusBadge status={itemStatus(item, analyze(items).reused)} />
        </div>
        <PasswordOutput
          onRegenerate={() => setPassword(gen())}
          password={password}
        >
          <Button disabled={busy} onClick={onSave}>
            {item.expiresAt ? "Save and reset expiry" : "Save password"}
          </Button>
        </PasswordOutput>
        <p className={hintClass}>
          Update the password on {item.site} too. Reminders appear only while
          your vault is unlocked; the server cannot see expiration dates.
        </p>
      </section>
    </AppLayout>
  );
}
