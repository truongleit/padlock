import { zodResolver } from "@hookform/resolvers/zod";
import {
  Clock,
  Copy,
  ExternalLink,
  LockKeyhole,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Favicon } from "@/components/CredentialRow";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Field, hintClass } from "@/components/ui/field";
import { Input, PasswordInput } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { useVault } from "@/components/VaultProvider";
import { analyze, daysUntil, formatDays } from "@/lib/health";
import { unlockSchema } from "@/lib/schemas";
import { useCopy } from "@/lib/use-copy";
import { type Credential, lock, unlock } from "@/lib/vault";

function openApp(path: string) {
  browser.tabs.create({
    url: `${browser.runtime.getURL("/app.html")}#${path}`,
  });
  window.close();
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Same site, or a subdomain of it (login.example.com matches example.com). */
const matchesHost = (item: Credential, host: string) => {
  const h = hostOf(item.url) || item.site.toLowerCase();
  return !!host && !!h && (host === h || host.endsWith(`.${h}`));
};

/** FR-3.1: runs in the page; uses the native setter so React/Vue inputs see the change. */
function fillLogin(username: string, password: string) {
  const pw = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!pw) return false;
  const setValue = (el: HTMLInputElement, value: string) => {
    el.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const user = [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[type="email"], input[type="text"], input:not([type])'
    ),
  ]
    .filter(
      (el) => pw.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING
    )
    .pop();
  if (user && username) setValue(user, username);
  setValue(pw, password);
  return true;
}

function Header() {
  const { status } = useVault();
  return (
    <header className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
      <Logo />
      <div className="flex gap-1">
        <Button
          aria-label="Open full vault"
          onClick={() => openApp("/vault")}
          size="icon-sm"
          variant="ghost"
        >
          <ExternalLink aria-hidden />
        </Button>
        {status === "unlocked" && (
          <Button
            aria-label="Lock vault"
            onClick={() => lock()}
            size="icon-sm"
            variant="ghost"
          >
            <LockKeyhole aria-hidden />
          </Button>
        )}
      </div>
    </header>
  );
}

function Unlock() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof unlockSchema>>({
    resolver: zodResolver(unlockSchema),
    defaultValues: { master: "" },
  });

  const onSubmit = handleSubmit(async ({ master }) => {
    try {
      await unlock(master);
    } catch {
      setError("master", { message: "Incorrect master password." });
    }
  });

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
      <Field error={errors.master?.message} label="Master password">
        <PasswordInput
          autoComplete="current-password"
          autoFocus
          {...register("master")}
        />
      </Field>
      <Button block disabled={isSubmitting} type="submit">
        {isSubmitting ? "Unlocking…" : "Unlock"}
      </Button>
      <Button
        className="self-center"
        onClick={() => openApp("/forgot")}
        size="sm"
        variant="link"
      >
        Forgot master password?
      </Button>
    </form>
  );
}

function Row({ item, onFill }: { item: Credential; onFill?: () => void }) {
  const copy = useCopy();
  return (
    <div className="[&+&]:border-border grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 [&+&]:border-t">
      <Favicon name={item.site} />
      <div className="min-w-0">
        <div className="truncate font-semibold">{item.site}</div>
        <div className="text-muted-foreground truncate text-[13px]">
          {item.username}
        </div>
      </div>
      {onFill ? (
        <Button onClick={onFill} size="sm">
          Autofill
        </Button>
      ) : (
        <Button
          onClick={() => copy(item.password, "Password", true)}
          size="sm"
          variant="secondary"
        >
          <Copy aria-hidden />
          Copy
        </Button>
      )}
    </div>
  );
}

function Unlocked() {
  const { items, settings } = useVault();
  const [tab, setTab] = useState<{ id?: number; host: string }>({ host: "" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      setTab({ id: t?.id, host: hostOf(t?.url ?? "") });
    });
  }, []);

  const matches = items.filter((i) => matchesHost(i, tab.host));
  const q = query.trim().toLowerCase();
  const results = q
    ? items.filter((i) =>
        [i.site, i.username, i.url].some((f) => f.toLowerCase().includes(q))
      )
    : [];
  const expiring = analyze(items).expiring[0];

  async function fill(item: Credential) {
    if (tab.id === undefined) return;
    const [res] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillLogin,
      args: [item.username, item.password],
    });
    if (res?.result) window.close();
    else toast.error("No password field on this page.");
  }

  return (
    <>
      <section aria-labelledby="matches">
        <h2
          className="text-muted-foreground mb-1 text-[13px] font-medium"
          id="matches"
        >
          {tab.host ? (
            <>
              Matches for{" "}
              <span className="text-foreground font-semibold">{tab.host}</span>
            </>
          ) : (
            "No website open"
          )}
        </h2>
        {matches.length ? (
          matches.map((i) => <Row item={i} key={i.id} onFill={() => fill(i)} />)
        ) : (
          <p className={`${hintClass} py-2`}>No saved logins for this site.</p>
        )}
      </section>

      {expiring?.expiresAt && (
        <Note className="items-center px-3 py-2.5" role="status" tone="warn">
          <p className="min-w-0 flex-1 text-[13px]">
            <strong>{expiring.site}</strong>{" "}
            {daysUntil(expiring.expiresAt) < 0
              ? "has expired."
              : `expires in ${formatDays(daysUntil(expiring.expiresAt))}.`}
          </p>
          <Button
            onClick={() => openApp(`/vault/${expiring.id}/rotate`)}
            size="sm"
            variant="link"
          >
            Change
          </Button>
        </Note>
      )}

      <hr className="bg-border h-px border-0" />

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="absolute top-[13px] left-3 size-[18px] text-neutral-500"
          />
          <Input
            aria-label="Search vault"
            className="pl-10"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vault"
            type="search"
            value={query}
          />
        </div>
        {q &&
          (results.length ? (
            <div>
              {results.slice(0, 5).map((i) => (
                <Row item={i} key={i.id} />
              ))}
            </div>
          ) : (
            <p className={hintClass}>No matches.</p>
          ))}
        <Button block onClick={() => openApp("/generator")} variant="secondary">
          <Sparkles aria-hidden />
          Generate password
        </Button>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2">
        <Button onClick={() => openApp("/vault")} size="sm" variant="link">
          Open full vault
        </Button>
        <span className={`${hintClass} flex items-center gap-1.5`}>
          <Clock aria-hidden className="size-3.5" />
          Auto-locks after {settings.autoLockMinutes} min idle
        </span>
      </div>
    </>
  );
}

/** W-16. */
export function App() {
  const { status } = useVault();
  if (status === "loading") return null;
  return (
    <div className="bg-surface flex min-h-[540px] w-[400px] flex-col">
      <Header />
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {status === "none" && (
          <>
            <p className="text-muted-foreground">
              Log in or create a PadLock account to save and autofill passwords.
            </p>
            <Button block onClick={() => openApp("/login")}>
              Log in
            </Button>
            <Button
              block
              onClick={() => openApp("/signup")}
              variant="secondary"
            >
              Create account
            </Button>
          </>
        )}
        {status === "locked" && <Unlock />}
        {status === "unlocked" && <Unlocked />}
      </div>
    </div>
  );
}
