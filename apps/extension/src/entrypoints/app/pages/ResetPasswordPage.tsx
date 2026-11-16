import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { AuthHeader, AuthLayout } from "@/components/AuthLayout";
import { NewMasterFields } from "@/components/NewMasterFields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogIcon,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, hintClass } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { Stepper } from "@/components/ui/stepper";
import { RESET_STEPS } from "@/entrypoints/app/pages/ForgotPasswordPage";
import { useNavigateWithSecret } from "@/lib/router";
import { resetPasswordSchema } from "@/lib/schemas";
import { masterReady } from "@/lib/strength";
import { resetAccount, resetWithRecovery } from "@/lib/vault";

/** W-05, with the W-06 account-reset dialog. */
export function ResetPasswordPage() {
  const toRecoveryKey = useNavigateWithSecret();
  const form = useForm<z.input<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    defaultValues: { recoveryKey: "", master: "", confirm: "" },
  });
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = form;
  const [pw, confirm] = watch(["master", "confirm"]);
  const ready = masterReady(pw, confirm);

  const onSubmit = handleSubmit(async ({ recoveryKey, master }) => {
    try {
      toRecoveryKey(
        "/recovery-key",
        await resetWithRecovery(recoveryKey, master)
      );
    } catch (e) {
      setError("recoveryKey", {
        message:
          e instanceof Error
            ? e.message
            : "That recovery key doesn't unlock this vault.",
      });
    }
  });

  return (
    <AuthLayout footNote={false} wide>
      <Stepper current={2} label="Reset progress" steps={RESET_STEPS} />
      <AuthHeader title="Reset master password">
        Enter your recovery key and choose a new master password. Your saved
        credentials stay intact.
      </AuthHeader>
      <FormProvider {...form}>
        <form className="flex flex-col gap-5" noValidate onSubmit={onSubmit}>
          <Field error={errors.recoveryKey?.message} label="Recovery key">
            <Input
              autoComplete="off"
              className="font-mono text-[13px]"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              spellCheck={false}
              {...register("recoveryKey")}
            />
          </Field>
          <NewMasterFields label="New master password" />
          <div className="flex flex-col gap-2">
            <Button block disabled={!isValid || isSubmitting} type="submit">
              {isSubmitting ? "Resetting…" : "Reset password and unlock"}
            </Button>
            <p className={hintClass}>
              A new recovery key will be shown next. The old one stops working.
            </p>
          </div>
        </form>
      </FormProvider>
      <Note tone="error">
        <div className="flex flex-col gap-3">
          <p>
            <strong>Lost your recovery key too?</strong> You can reset the
            account, but all saved credentials are permanently deleted.
          </p>
          <ResetAccountDialog master={ready ? pw : null} />
        </div>
      </Note>
    </AuthLayout>
  );
}

function ResetAccountDialog({ master }: { master: string | null }) {
  const toRecoveryKey = useNavigateWithSecret();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!master) return;
    setBusy(true);
    try {
      toRecoveryKey("/recovery-key", await resetAccount(master));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed.");
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={() => setTyped("")}>
      <div className="flex flex-col gap-1.5">
        <DialogTrigger asChild>
          <Button
            className="self-start"
            disabled={!master}
            size="sm"
            variant="danger-quiet"
          >
            Reset account…
          </Button>
        </DialogTrigger>
        {!master && (
          <p className={hintClass}>Choose a new master password above first.</p>
        )}
      </div>
      <DialogContent>
        <DialogIcon tone="error">
          <Trash2 />
        </DialogIcon>
        <div className="flex flex-col gap-2">
          <DialogTitle>Delete vault and reset account?</DialogTitle>
          <DialogDescription>
            This permanently deletes <strong>all saved credentials</strong>. It
            can't be undone, and PadLock can't recover them. Your new master
            password is set and you'll receive a new recovery key.
          </DialogDescription>
        </div>
        <Field
          label={
            <>
              Type <span className="font-mono font-semibold">DELETE</span> to
              confirm
            </>
          }
        >
          <Input
            autoComplete="off"
            className="font-mono"
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            value={typed}
          />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            disabled={typed !== "DELETE" || busy}
            onClick={onConfirm}
            variant="danger"
          >
            Delete and reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
