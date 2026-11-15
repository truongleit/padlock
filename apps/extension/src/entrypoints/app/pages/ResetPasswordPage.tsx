import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

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
import { navigate } from "@/lib/router";
import { masterReady } from "@/lib/strength";
import { resetAccount, resetWithRecovery } from "@/lib/vault";

/** W-05, with the W-06 account-reset dialog. */
export function ResetPasswordPage() {
  const [recoveryKey, setRecoveryKey] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = masterReady(pw, confirm);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      navigate("/recovery-key", await resetWithRecovery(recoveryKey, pw));
    } catch {
      setError("That recovery key doesn't unlock this vault.");
      setBusy(false);
    }
  }

  return (
    <AuthLayout footNote={false} wide>
      <Stepper current={2} label="Reset progress" steps={RESET_STEPS} />
      <AuthHeader title="Reset master password">
        Enter your recovery key and choose a new master password. Your saved
        credentials stay intact.
      </AuthHeader>
      <form className="flex flex-col gap-5" onSubmit={onSubmit}>
        <Field error={error || undefined} label="Recovery key">
          <Input
            autoComplete="off"
            className="font-mono text-[13px]"
            onChange={(e) => setRecoveryKey(e.target.value)}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            required
            spellCheck={false}
            value={recoveryKey}
          />
        </Field>
        <NewMasterFields
          confirm={confirm}
          label="New master password"
          onChange={setPw}
          onConfirmChange={setConfirm}
          value={pw}
        />
        <div className="flex flex-col gap-2">
          <Button block disabled={!ready || busy} type="submit">
            {busy ? "Resetting…" : "Reset password and unlock"}
          </Button>
          <p className={hintClass}>
            A new recovery key will be shown next. The old one stops working.
          </p>
        </div>
      </form>
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
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!master) return;
    setBusy(true);
    navigate("/recovery-key", await resetAccount(master));
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
