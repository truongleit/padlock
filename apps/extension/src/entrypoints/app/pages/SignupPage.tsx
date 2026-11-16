import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { NewMasterFields } from "@/components/NewMasterFields";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, errorText } from "@/lib/api";
import { useNavigateWithSecret } from "@/lib/router";
import { signupSchema } from "@/lib/schemas";
import { signup } from "@/lib/vault";

/** W-01. */
export function SignupPage() {
  const toRecoveryKey = useNavigateWithSecret();
  const form = useForm<
    z.input<typeof signupSchema>,
    unknown,
    z.output<typeof signupSchema>
  >({
    resolver: zodResolver(signupSchema),
    mode: "onTouched",
    defaultValues: { email: "", master: "", confirm: "", ack: false },
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid },
  } = form;

  const onSubmit = handleSubmit(async ({ email, master }) => {
    try {
      toRecoveryKey("/recovery-key", await signup(email, master));
    } catch (e) {
      setError("email", {
        message:
          e instanceof ApiError && e.code === "EMAIL_TAKEN"
            ? "An account with this email already exists."
            : errorText(e, "Couldn't create the account. Try again."),
      });
    }
  });

  return (
    <AuthLayout>
      <FormProvider {...form}>
        <form className="flex flex-col gap-6" noValidate onSubmit={onSubmit}>
          <AuthHeader title="Create your account">
            Choose one master password. It's the only one you'll need to
            remember.
          </AuthHeader>
          <div className="flex flex-col gap-5">
            <Field error={errors.email?.message} label="Email">
              <Input
                autoComplete="email"
                placeholder="you@example.com"
                type="email"
                {...register("email")}
              />
            </Field>
            <NewMasterFields />
            <Checkbox {...register("ack")}>
              I understand that PadLock cannot recover my master password.
            </Checkbox>
          </div>
          <div className="flex flex-col gap-2">
            <Button block disabled={!isValid || isSubmitting} type="submit">
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
            <Button asChild className="self-start" variant="link">
              <Link to="/login">Already have an account? Log in</Link>
            </Button>
          </div>
        </form>
      </FormProvider>
    </AuthLayout>
  );
}
