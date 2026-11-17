import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { AppLayout, BackLink } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Field, hintClass } from "@/components/ui/field";
import { Input, PasswordInput, Textarea } from "@/components/ui/input";
import { Meter } from "@/components/ui/meter";
import { H1 } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import { errorText } from "@/lib/api";
import { randomPassword } from "@/lib/generator";
import { useSecret } from "@/lib/router";
import { LEVEL_LABELS, level, score } from "@/lib/strength";
import {
  type Credential,
  type CredentialInput,
  saveCredential,
} from "@/lib/vault";

const optional = (
  <span className="text-muted-foreground font-normal">(optional)</span>
);

/** W-08: add, or edit when `existing` is set. */
export function CredentialFormPage({ existing }: { existing?: Credential }) {
  const navigate = useNavigate();
  // "Use this password" from the generator hands the password over in memory.
  const generated = useSecret<string>();
  const { vaultKey, settings } = useVault();
  const [form, setForm] = useState<CredentialInput>(() => ({
    site: existing?.site ?? "",
    url: existing?.url ?? "",
    username: existing?.username ?? "",
    password: existing?.password ?? generated ?? "",
    notes: existing?.notes ?? "",
    expiresAt: existing?.expiresAt ?? null,
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<CredentialInput>) =>
    setForm({ ...form, ...patch });
  const s = score(form.password);
  const back = existing ? `/vault/${existing.id}` : "/vault";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vaultKey) return;
    setBusy(true);
    try {
      const id = await saveCredential(vaultKey, form, existing);
      void navigate(`/vault/${id}`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save. Try again."));
      setBusy(false);
    }
  }

  return (
    <AppLayout className="max-w-[680px]">
      <div className="mb-7 flex flex-col gap-3">
        <BackLink to={back}>
          {existing ? "Back to credential" : "Back to vault"}
        </BackLink>
        <H1>{existing ? "Edit credential" : "Add credential"}</H1>
      </div>
      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5">
          <Field label="Site or app name">
            <Input
              onChange={(e) => set({ site: e.target.value })}
              placeholder="github.com"
              required
              value={form.site}
            />
          </Field>
          <Field label="Website URL">
            <Input
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://github.com/login"
              type="url"
              value={form.url}
            />
          </Field>
        </div>
        <Field label="Username or email">
          <Input
            autoComplete="off"
            onChange={(e) => set({ username: e.target.value })}
            value={form.username}
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Field label="Password">
            <PasswordInput
              autoComplete="new-password"
              onChange={(e) => set({ password: e.target.value })}
              required
              value={form.password}
            />
          </Field>
          <Button
            className="self-start"
            onClick={() =>
              set({
                password: randomPassword({
                  ...settings.generatorDefaults,
                  upper: true,
                  lower: true,
                  avoidAmbiguous: false,
                }),
              })
            }
            size="sm"
            variant="secondary"
          >
            <Sparkles aria-hidden />
            Generate
          </Button>
          {form.password && (
            <Meter
              label={`Strength: ${LEVEL_LABELS[level(s)]}`}
              level={level(s)}
            />
          )}
        </div>
        <Field label={<>Notes {optional}</>}>
          <Textarea
            onChange={(e) => set({ notes: e.target.value })}
            value={form.notes}
          />
        </Field>
        <Field
          className="max-w-[260px]"
          label={<>Expiration date {optional}</>}
        >
          <Input
            onChange={(e) => set({ expiresAt: e.target.value || null })}
            type="date"
            value={form.expiresAt ?? ""}
          />
        </Field>
        <p className={`${hintClass} -mt-2`}>
          PadLock reminds you inside the app, after you unlock your vault.
        </p>
        <div className="border-border flex justify-end gap-3 border-t pt-3">
          <Button asChild variant="secondary">
            <Link to={back}>Cancel</Link>
          </Button>
          <Button disabled={busy} type="submit">
            Save credential
          </Button>
        </div>
      </form>
    </AppLayout>
  );
}
