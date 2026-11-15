import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const TRUST = [
  {
    Icon: ShieldCheck,
    title: "Encrypted on your device",
    body: "Your vault is encrypted with AES-256-GCM before anything is sent to our servers.",
  },
  {
    Icon: KeyRound,
    title: "Only you hold the keys",
    body: "PadLock can't read your passwords, and neither can administrators.",
  },
];

/** Split shell for sign-up, log in and recovery screens. */
export function AuthLayout({
  wide,
  footNote = true,
  children,
}: {
  wide?: boolean;
  footNote?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <aside className="border-primary-100 bg-primary-50 flex max-w-[520px] flex-[1_1_420px] flex-col justify-between gap-12 border-r px-12 py-10">
        <Logo />
        <ul className="flex flex-col gap-5">
          {TRUST.map(({ Icon, title, body }) => (
            <li className="flex gap-3.5" key={title}>
              <Icon
                aria-hidden
                className="text-primary-700 mt-0.5 size-[22px] flex-none"
              />
              <div>
                <b className="block font-[650] text-neutral-900">{title}</b>
                <span className="block text-[13.5px]/5 text-neutral-700">
                  {body}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <main className="flex flex-[999_1_480px] items-center justify-center px-6 py-12">
        <div
          className={cn(
            "flex w-full max-w-[400px] flex-col gap-6",
            wide && "max-w-[480px]"
          )}
        >
          {children}
          {footNote && (
            <p className="text-muted-foreground flex items-center justify-center gap-2 text-[12.5px]">
              <Lock aria-hidden className="size-3.5" />
              Your master password never leaves this device.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export function AuthHeader({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-[28px]/[34px] font-[650] tracking-[-0.022em]">
        {title}
      </h1>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
