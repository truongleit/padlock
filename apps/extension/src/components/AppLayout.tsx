import {
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lock } from "@/lib/vault";

const NAV = [
  { to: "/vault", label: "Vault", Icon: LockKeyhole },
  { to: "/generator", label: "Generator", Icon: Sparkles },
  { to: "/security", label: "Security", Icon: ShieldCheck },
  { to: "/settings", label: "Settings", Icon: SlidersHorizontal },
];

/** Top bar + centred page column for unlocked screens. */
export function AppLayout({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-border bg-surface flex min-h-[68px] flex-wrap items-center gap-x-7 gap-y-2 border-b px-8 py-2.5">
        <Logo to="/vault" />
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
          {NAV.map(({ to, label, Icon }) => (
            // NavLink sets aria-current="page" on this route and its children.
            <NavLink
              className="hover:bg-muted aria-[current=page]:bg-primary-50 aria-[current=page]:text-primary-700 inline-flex min-h-11 items-center gap-2 rounded px-3.5 font-medium text-neutral-600 no-underline hover:text-neutral-900 aria-[current=page]:font-semibold"
              key={to}
              to={to}
            >
              <Icon aria-hidden className="size-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button onClick={() => lock()} size="sm" variant="secondary">
          <LockKeyhole aria-hidden />
          Lock
        </Button>
      </header>
      <main
        className={cn(
          "mx-auto w-full max-w-[1080px] px-8 pt-9 pb-12",
          className
        )}
      >
        {children}
      </main>
    </div>
  );
}

export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="text-primary-700 hover:text-primary-800 inline-flex min-h-8 items-center gap-1.5 self-start text-[13px] font-semibold no-underline"
      to={to}
    >
      <svg
        aria-hidden
        className="size-3.5 fill-none stroke-current stroke-2"
        viewBox="0 0 24 24"
      >
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      {children}
    </Link>
  );
}
