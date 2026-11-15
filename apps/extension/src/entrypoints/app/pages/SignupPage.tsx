import { type FormEvent, useState } from "react";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { NewMasterFields } from "@/components/NewMasterFields";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { navigate } from "@/lib/router";
import { masterReady } from "@/lib/strength";
import { signup } from "@/lib/vault";

/** W-01. */
export function SignupPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = masterReady(pw, confirm) && ack && /^\S+@\S+\.\S+$/.test(email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const recoveryKey = await signup(email.trim().toLowerCase(), pw);
      navigate("/recovery-key", recoveryKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <form className="flex flex-col gap-6" onSubmit={onSubmit}>
        <AuthHeader title="Create your account">
          Choose one master password. It's the only one you'll need to remember.
        </AuthHeader>
        <div className="flex flex-col gap-5">
          <Field label="Email">
            <Input
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </Field>
          <NewMasterFields
            confirm={confirm}
            onChange={setPw}
            onConfirmChange={setConfirm}
            value={pw}
          />
          <Checkbox checked={ack} onChange={() => setAck(!ack)}>
            I understand that PadLock cannot recover my master password.
          </Checkbox>
        </div>
        <Button block disabled={!ready || busy} type="submit">
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
