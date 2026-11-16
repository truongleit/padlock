import { useFormContext } from "react-hook-form";

import { Field, hintClass } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { Meter } from "@/components/ui/meter";
import { MIN_MASTER_LENGTH, masterStrength } from "@/lib/strength";

/**
 * New master password + confirm, with the strength meter (sign-up, reset, change).
 * Lives inside a FormProvider whose schema spreads `newMaster` from `@/lib/schemas`.
 */
export function NewMasterFields({
  label = "Master password",
}: {
  label?: string;
}) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext<{ master: string; confirm: string }>();
  const s = masterStrength(watch("master") ?? "");
  return (
    <>
      <Field
        error={errors.master?.message}
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
        <PasswordInput autoComplete="new-password" {...register("master")} />
      </Field>
      <Field
        error={errors.confirm?.message}
        label={`Confirm ${label.toLowerCase()}`}
      >
        <Input
          autoComplete="new-password"
          type="password"
          {...register("confirm")}
        />
      </Field>
    </>
  );
}
