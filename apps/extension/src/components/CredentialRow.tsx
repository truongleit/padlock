import { Check, Clock, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import type { ItemStatus } from "@/lib/health";
import { cn } from "@/lib/utils";
import type { Credential } from "@/lib/vault";

const ICONS = { ok: Check, alert: TriangleAlert, clock: Clock };

export function Favicon({ name, large }: { name: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-primary-100 bg-primary-50 text-primary-700 grid size-10 flex-none place-items-center rounded-[10px] border text-[15px] font-bold",
        large && "size-12 text-lg"
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  const Icon = ICONS[status.icon];
  return (
    <Badge tone={status.tone}>
      <Icon aria-hidden />
      {status.label}
    </Badge>
  );
}

/** Bordered list box that rows sit in. */
export function List({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-border bg-surface overflow-hidden rounded-lg border",
        className
      )}
      {...props}
    />
  );
}

export function CredentialRow({
  item,
  status,
}: {
  item: Credential;
  status: ItemStatus;
}) {
  return (
    <Link
      className="border-border grid min-h-[68px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3.5 border-t px-[18px] py-3 text-inherit no-underline first:border-t-0 hover:bg-neutral-50"
      to={`/vault/${item.id}`}
    >
      <Favicon name={item.site} />
      <div className="min-w-0">
        <div className="truncate font-semibold text-neutral-900">
          {item.site}
        </div>
        <div className="text-muted-foreground truncate text-[13px]">
          {item.username}
        </div>
      </div>
      <StatusBadge status={status} />
    </Link>
  );
}
