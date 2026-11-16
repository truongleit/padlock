import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Search,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";

import { AppLayout } from "@/components/AppLayout";
import { CredentialRow, List } from "@/components/CredentialRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Note } from "@/components/ui/note";
import { PageHead } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import { analyze, daysUntil, formatDays, itemStatus } from "@/lib/health";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

function Chip({
  to,
  tone,
  children,
}: {
  to: string;
  tone: "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <Link
      className={cn(
        "border-border bg-surface inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium text-neutral-800 no-underline hover:bg-neutral-50 [&_svg]:size-3.5",
        tone === "ok" && "[&_svg]:text-success-700",
        tone === "warn" && "[&_svg]:text-warning-700",
        tone === "bad" && "[&_svg]:text-error-700"
      )}
      to={to}
    >
      {children}
    </Link>
  );
}

let bannerDismissed = false;

/** W-07, with the W-13 expiry banner (FR-6.3). */
export function VaultPage() {
  const { items } = useVault();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [dismissed, setDismissed] = useState(bannerDismissed);
  const health = analyze(items);
  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) =>
        [i.site, i.url, i.username, i.notes].some((f) =>
          f.toLowerCase().includes(q)
        )
      )
    : items;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const soonest = health.expiring[0];

  return (
    <AppLayout>
      <PageHead
        description={`${items.length} credential${items.length === 1 ? "" : "s"}, encrypted on this device.`}
        title="Vault"
      />

      {soonest?.expiresAt && !dismissed && (
        <Note className="mb-5 items-center" role="status" tone="warn">
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <p>
              <strong>
                {health.expiring.length} password
                {health.expiring.length === 1 ? "" : "s"} expiring soon.
              </strong>{" "}
              {soonest.site}{" "}
              {daysUntil(soonest.expiresAt) < 0
                ? "has expired."
                : `has ${formatDays(daysUntil(soonest.expiresAt))} left.`}
            </p>
            <Button asChild size="sm" variant="secondary">
              <Link to={`/vault/${soonest.id}/rotate`}>Change</Link>
            </Button>
          </div>
          <Button
            aria-label="Dismiss reminder"
            className="text-neutral-700"
            onClick={() => {
              bannerDismissed = true;
              setDismissed(true);
            }}
            size="icon-sm"
            variant="ghost"
          >
            <X aria-hidden />
          </Button>
        </Note>
      )}

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            aria-hidden
            className="absolute top-[13px] left-3 size-[18px] text-neutral-500"
          />
          <Input
            aria-label="Search credentials"
            className="pl-10"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search credentials"
            type="search"
            value={query}
          />
        </div>
        <Button asChild>
          <Link to="/vault/new">
            <Plus aria-hidden />
            Add credential
          </Link>
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Chip to="/security" tone="ok">
            <ShieldCheck aria-hidden />
            Security score {health.score}
          </Chip>
          {health.reused.size > 0 && (
            <Chip to="/security" tone="bad">
              <TriangleAlert aria-hidden />
              {health.reused.size} reused
            </Chip>
          )}
          {health.expiring.length > 0 && (
            <Chip to="/security" tone="warn">
              <Clock aria-hidden />
              {health.expiring.length} expiring soon
            </Chip>
          )}
        </div>
      )}

      {slice.length ? (
        <List>
          {slice.map((item) => (
            <CredentialRow
              item={item}
              key={item.id}
              status={itemStatus(item, health.reused)}
            />
          ))}
        </List>
      ) : (
        <List className="text-muted-foreground px-6 py-10 text-center">
          {q
            ? `No credentials match “${query}”.`
            : "No credentials yet. Add your first one."}
        </List>
      )}

      {shown.length > PAGE_SIZE && (
        <div className="text-muted-foreground mt-3.5 flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <span>
            Showing {current * PAGE_SIZE + 1}–
            {current * PAGE_SIZE + slice.length} of {shown.length}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              variant="link"
            >
              <ChevronLeft aria-hidden />
              Previous
            </Button>
            <Button
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              variant="link"
            >
              Next page
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
