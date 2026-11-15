import { KeyRound } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";

import { AppLayout } from "@/components/AppLayout";
import { NewMasterFields } from "@/components/NewMasterFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogIcon,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Switch } from "@/components/ui/switch";
import { H3, PageHead } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import { masterReady } from "@/lib/strength";
import { changeMaster, lock, type Settings, saveSettings } from "@/lib/vault";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border-border grid gap-x-12 gap-y-4 border-t py-7 first-of-type:border-t-0 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <H3>{title}</H3>
        <p className="text-muted-foreground text-[13px]">{description}</p>
      </div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function SetRow({
  title,
  hint,
  htmlFor,
  children,
}: {
  title: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const Title = htmlFor ? "label" : "b";
  return (
    <div className="border-border flex min-h-14 flex-wrap items-center justify-between gap-4 py-1.5 [&+&]:border-t">
      <div className="flex-[1_1_240px]">
        <Title className="block font-semibold" htmlFor={htmlFor}>
          {title}
        </Title>
        {hint && (
          <span className="text-muted-foreground text-[13px]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** W-14, with the W-15 change-master dialog. */
export function SettingsPage({ path }: { path: string }) {
  const { account, settings } = useVault();
  const [form, setForm] = useState<Settings>(settings);
  const gen = form.generatorDefaults;
  const setGen = (patch: Partial<Settings["generatorDefaults"]>) =>
    setForm({ ...form, generatorDefaults: { ...gen, ...patch } });

  async function onSave() {
    await saveSettings(form);
    toast.success("Settings saved.");
  }

  return (
    <AppLayout className="max-w-[880px]" path={path}>
      <PageHead
        description="Preferences for this PadLock account."
        title="Account & settings"
      />
      <Section description="Your sign-in details." title="Account">
        <SetRow
          hint="Used to sign in and to receive reset links."
          title="Email"
        >
          <span className="font-semibold">{account?.email}</span>
        </SetRow>
        <SetRow
          hint="Your saved credentials and recovery key stay the same."
          title="Master password"
        >
          <ChangeMasterDialog />
        </SetRow>
      </Section>
      <Section
        description="When PadLock locks and clears copied passwords."
        title="Security"
      >
        <SetRow
          hint="Applies to the web app and the browser extension."
          htmlFor="auto-lock"
          title="Auto-lock after"
        >
          <div className="flex-[0_0_200px]">
            <Select
              id="auto-lock"
              onChange={(e) =>
                setForm({ ...form, autoLockMinutes: Number(e.target.value) })
              }
              value={form.autoLockMinutes}
            >
              {[1, 5, 15, 30].map((m) => (
                <option key={m} value={m}>
                  {m} minute{m === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
          </div>
        </SetRow>
        <SetRow
          hint="Copied passwords are removed after this time."
          htmlFor="clipboard"
          title="Clear clipboard after"
        >
          <div className="flex-[0_0_200px]">
            <Select
              id="clipboard"
              onChange={(e) =>
                setForm({
                  ...form,
                  clipboardClearSeconds: Number(e.target.value),
                })
              }
              value={form.clipboardClearSeconds}
            >
              {[15, 30, 60].map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </Select>
          </div>
        </SetRow>
      </Section>
      <Section
        description="Defaults used when you open the generator."
        title="Password generator"
      >
        <SetRow htmlFor="length" title="Default length">
          <div className="flex-[0_0_200px]">
            <Input
              id="length"
              max={64}
              min={8}
              onChange={(e) =>
                setGen({
                  length: Math.min(64, Math.max(8, Number(e.target.value))),
                })
              }
              type="number"
              value={gen.length}
            />
          </div>
        </SetRow>
        <SetRow title="Include symbols">
          <Switch
            aria-label="Include symbols"
            checked={gen.symbols}
            onCheckedChange={(symbols) => setGen({ symbols })}
          />
        </SetRow>
        <SetRow title="Include numbers">
          <Switch
            aria-label="Include numbers"
            checked={gen.numbers}
            onCheckedChange={(numbers) => setGen({ numbers })}
          />
        </SetRow>
      </Section>
      <div className="border-border flex flex-wrap gap-3 border-t pt-6">
        <Button onClick={onSave}>Save settings</Button>
        <Button onClick={() => lock()} variant="secondary">
          Log out
        </Button>
      </div>
    </AppLayout>
  );
}

function ChangeMasterDialog() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    setCurrent("");
    setPw("");
    setConfirm("");
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await changeMaster(current, pw);
      onOpenChange(false);
      toast.success("Master password changed.");
    } catch {
      setError("Incorrect master password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Change master password
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        asChild
        className="max-w-[480px]"
      >
        <form onSubmit={onSubmit}>
          <div className="flex items-center gap-3">
            <DialogIcon>
              <KeyRound />
            </DialogIcon>
            <DialogTitle>Change master password</DialogTitle>
          </div>
          <Field error={error || undefined} label="Current master password">
            <Input
              autoComplete="current-password"
              onChange={(e) => setCurrent(e.target.value)}
              required
              type="password"
              value={current}
            />
          </Field>
          <NewMasterFields
            confirm={confirm}
            label="New master password"
            onChange={setPw}
            onConfirmChange={setConfirm}
            value={pw}
          />
          <Note tone="info">
            <p>
              Your saved credentials stay intact. Your recovery key does not
              change.
            </p>
          </Note>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button disabled={!masterReady(pw, confirm) || busy} type="submit">
              {busy ? "Changing…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
