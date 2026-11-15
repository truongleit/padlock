import { Field, hintClass } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { Meter } from "@/components/ui/meter";
import { MIN_MASTER_LENGTH, masterStrength } from "@/lib/strength";

/** New master password + confirm, with the strength meter (sign-up, reset, change). */
export function NewMasterFields({
  label = "Master password",
  value,
  confirm,
  onChange,
  onConfirmChange,
}: {
  label?: string;
  value: string;
  confirm: string;
  onChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}) {
  const s = masterStrength(value);
  const mismatch = confirm.length > 0 && confirm !== value;
  return (
    <>
      <Field
        extra={
          <Meter
            aside={
              <span className={hintClass}>
                Minimum {MIN_MASTER_LENGTH} characters
              </span>
            }
            label={`Strength: ${s.label}`}
            level={s.level}
          />
        }
        label={label}
      >
        <PasswordInput
          autoComplete="new-password"
          minLength={MIN_MASTER_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          required
          value={value}
        />
      </Field>
      <Field
        error={mismatch ? "Passwords don't match." : undefined}
        label={`Confirm ${label.toLowerCase()}`}
      >
        <Input
          autoComplete="new-password"
          onChange={(e) => onConfirmChange(e.target.value)}
          required
          type="password"
          value={confirm}
        />
      </Field>
    </>
  );
}
