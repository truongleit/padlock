import { type FormEvent, useState } from "react";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { useVault } from "@/components/VaultProvider";
import { unlock } from "@/lib/vault";

/** W-03: log in = unlock the local vault with the master password. */
export function LoginPage() {
  const { account } = useVault();
  const [email, setEmail] = useState(account?.email ?? "");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (email.trim().toLowerCase() !== account?.email) throw new Error();
      await unlock(pw);
    } catch {
      setError("Incorrect email or master password.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <AuthHeader title="Log in to your vault">
          Enter your master password to unlock PadLock.
        </AuthHeader>
        <div className="flex flex-col gap-5">
          <Field label="Email">
            <Input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
              type="email"
              value={email}
            />
          </Field>
          <Field error={error || undefined} label="Master password">
            <PasswordInput
              autoComplete="current-password"
              autoFocus
              onChange={(e) => setPw(e.target.value)}
              required
              value={pw}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Button block disabled={busy} type="submit">
            {busy ? "Unlocking…" : "Log in"}
          </Button>
          <Button asChild className="self-start" variant="link">
            <a href="#/forgot">Forgot master password?</a>
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
