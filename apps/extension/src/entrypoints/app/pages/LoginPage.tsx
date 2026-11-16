import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { useVault } from "@/components/VaultProvider";
import { errorText } from "@/lib/api";
import { loginSchema } from "@/lib/schemas";
import { login, unlock } from "@/lib/vault";

/** W-03. Same account as cached: unlock locally. Otherwise: full server login. */
export function LoginPage() {
  const { account } = useVault();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof loginSchema>,
    unknown,
    z.output<typeof loginSchema>
  >({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: account?.email ?? "", master: "" },
  });

  const onSubmit = handleSubmit(async ({ email, master }) => {
    try {
      await (email === account?.email ? unlock(master) : login(email, master));
    } catch (e) {
      setError("master", {
        message: errorText(e, "Incorrect email or master password."),
      });
    }
  });

  return (
    <AuthLayout>
      <form className="flex flex-col gap-6" noValidate onSubmit={onSubmit}>
        <AuthHeader title="Log in to your vault">
          Enter your master password to unlock PadLock.
        </AuthHeader>
        <div className="flex flex-col gap-5">
          <Field error={errors.email?.message} label="Email">
            <Input autoComplete="email" type="email" {...register("email")} />
          </Field>
          <Field error={errors.master?.message} label="Master password">
            <PasswordInput
              autoComplete="current-password"
              autoFocus
              {...register("master")}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Button block disabled={isSubmitting} type="submit">
            {isSubmitting ? "Unlocking…" : "Log in"}
          </Button>
          <div className="flex flex-wrap justify-between gap-2">
            <Button asChild variant="link">
              <Link to="/forgot">Forgot master password?</Link>
            </Button>
            {!account && (
              <Button asChild variant="link">
                <Link to="/signup">Create an account</Link>
              </Button>
            )}
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}
