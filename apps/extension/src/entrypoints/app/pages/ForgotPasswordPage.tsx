import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";

import { BackLink } from "@/components/AppLayout";
import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Stepper } from "@/components/ui/stepper";
import { useVault } from "@/components/VaultProvider";

export const RESET_STEPS = [
  "Email",
  "Check inbox",
  "Recovery key",
  "New password",
];

/** W-04. */
export function ForgotPasswordPage() {
  const { account } = useVault();
  const [email, setEmail] = useState(account?.email ?? "");
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // ponytail: no user reset-email endpoint exists yet (FR-1.4). The email proves
    // ownership server-side; locally the recovery key alone unlocks the reset.
    setSent(true);
  }

  return (
    <AuthLayout footNote={false} wide>
      <Stepper
        current={sent ? 1 : 0}
        label="Reset progress"
        steps={RESET_STEPS}
      />
      <AuthHeader title="Forgot your master password?">
        Enter the email address of your account. If it's registered, we'll send
        a reset link that is valid for 30 minutes.
      </AuthHeader>
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Field label="Email">
          <Input
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Button block type="submit" variant={sent ? "secondary" : "primary"}>
          <Mail aria-hidden />
          {sent ? "Resend link" : "Send reset link"}
        </Button>
        {sent && (
          <>
            <Note role="status" tone="success">
              <p>If that email is registered, a reset link is on its way.</p>
            </Note>
            <Button asChild block>
              <Link to="/reset">Continue with my recovery key</Link>
            </Button>
          </>
        )}
      </form>
      <BackLink to="/login">Back to log in</BackLink>
    </AuthLayout>
  );
}
