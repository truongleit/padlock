import { CircleAlert } from "lucide-react";
import {
  type ComponentProps,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";

import { cn } from "@/lib/utils";

export const labelClass = "font-semibold text-[13px] text-neutral-800";
export const hintClass = "text-[12.5px]/[18px] text-muted-foreground";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** Label + control + optional extra row, hint and error, wired for a11y. */
export function Field({
  label,
  hint,
  error,
  extra,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  extra?: ReactNode;
  className?: string;
  children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {extra}
      {error ? (
        <span
          className="text-error-700 flex items-center gap-1.5 text-[12.5px] font-medium"
          id={`${id}-error`}
          role="alert"
        >
          <CircleAlert aria-hidden className="size-3.5" />
          {error}
        </span>
      ) : (
        hint && (
          <p className={hintClass} id={`${id}-hint`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Checkbox({
  children,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-2.5 py-2.5 text-sm/[22px]",
        className
      )}
    >
      <input
        className="accent-primary mt-0.5 size-[18px] flex-none"
        type="checkbox"
        {...props}
      />
      <span>{children}</span>
    </label>
  );
}
