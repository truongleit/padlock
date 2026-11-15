import { cn } from "@/lib/utils";

const brand =
  "inline-flex items-center gap-2.5 font-bold text-base text-neutral-900 tracking-[-0.01em] no-underline";

function Mark() {
  return (
    <svg aria-hidden height="28" viewBox="0 0 28 28" width="28">
      <rect className="fill-primary-600" height="28" rx="8" width="28" />
      <path
        className="fill-none stroke-white stroke-2 [stroke-linecap:round]"
        d="M10 12.5V10.5a4 4 0 0 1 8 0v2"
      />
      <rect
        className="fill-white"
        height="9"
        rx="2.5"
        width="12"
        x="8"
        y="12.5"
      />
      <circle className="fill-primary-600" cx="14" cy="16.5" r="1.4" />
    </svg>
  );
}

export function Logo({
  href,
  className,
}: {
  href?: string;
  className?: string;
}) {
  if (href)
    return (
      <a className={cn(brand, className)} href={href}>
        <Mark />
        PadLock
      </a>
    );
  return (
    <span className={cn(brand, className)}>
      <Mark />
      PadLock
    </span>
  );
}
