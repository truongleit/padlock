import { Clock, Lock, TriangleAlert } from "lucide-react";

import { AppLayout } from "@/components/AppLayout";
import { List } from "@/components/CredentialRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hintClass } from "@/components/ui/field";
import { Note } from "@/components/ui/note";
import { H2, PageHead } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import {
  analyze,
  daysUntil,
  formatAge,
  formatDays,
  monthsSince,
  OLD_MONTHS,
} from "@/lib/health";
import { score } from "@/lib/strength";
import { cn } from "@/lib/utils";

const RING = 2 * Math.PI * 62;

function rating(s: number) {
  if (s < 40) return { tone: "error", label: "Poor" } as const;
  if (s < 60) return { tone: "warning", label: "Fair" } as const;
  if (s < 85) return { tone: "primary", label: "Good" } as const;
  return { tone: "success", label: "Excellent" } as const;
}

type Rec = {
  key: string;
  bad: boolean;
  title: string;
  body: string;
  href: string;
};

/** W-12 (FR-5). */
export function SecurityPage({ path }: { path: string }) {
  const { items } = useVault();
  const h = analyze(items);
  const r = rating(h.score);
  const recs: Rec[] = [
    ...h.reusedGroups.map((g) => ({
      key: `r-${g[0]!.id}`,
      bad: true,
      title: "Reused password",
      body: `${g.map((i) => i.site).join(" and ")} share one password.`,
      href: `#/vault/${g[0]!.id}/edit`,
    })),
    ...h.weak.map((i) => ({
      key: `w-${i.id}`,
      bad: true,
      title: "Weak password",
      body: `${i.site} scores ${score(i.password)}. Use at least 12 characters.`,
      href: `#/vault/${i.id}/edit`,
    })),
    ...h.old.map((i) => ({
      key: `o-${i.id}`,
      bad: false,
      title: "Old password",
      body: `${i.site} was last changed ${formatAge(monthsSince(i.passwordChangedAt))} ago.`,
      href: `#/vault/${i.id}/edit`,
    })),
    ...h.expiring.map((i) => {
      const d = daysUntil(i.expiresAt!);
      return {
        key: `e-${i.id}`,
        bad: d < 0,
        title: d < 0 ? "Expired" : "Expiring soon",
        body:
          d < 0
            ? `${i.site} has expired.`
            : `${i.site} expires in ${formatDays(d)}.`,
        href: `#/vault/${i.id}/rotate`,
      };
    }),
  ];

  return (
    <AppLayout className="max-w-[880px]" path={path}>
      <PageHead
        description="How healthy the passwords in your vault are."
        title="Security"
      />
      <div className="mb-9 flex flex-wrap gap-8">
        <div className="flex items-center gap-5">
          <div
            aria-label={`Overall security score ${h.score} out of 100`}
            className="relative size-[140px] flex-none"
            role="img"
          >
            <svg
              aria-hidden
              className="size-full -rotate-90"
              viewBox="0 0 140 140"
            >
              <circle
                className="fill-none stroke-neutral-200"
                cx="70"
                cy="70"
                r="62"
                strokeWidth="12"
              />
              <circle
                className="stroke-primary fill-none [stroke-linecap:round]"
                cx="70"
                cy="70"
                r="62"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - h.score / 100)}
                strokeWidth="12"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[40px]/[44px] font-[650] tracking-[-0.03em]">
                {h.score}
              </span>
              <span className="text-muted-foreground text-xs">out of 100</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Badge className="self-start" tone={r.tone}>
              {r.label}
            </Badge>
            <p className="text-muted-foreground max-w-[200px]">
              Overall score across {items.length} credential
              {items.length === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
        <div className="border-border bg-surface grid min-w-[320px] flex-1 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] rounded-lg border">
          {[
            [h.reused.size, "Reused"],
            [h.weak.length, "Weak"],
            [h.old.length, `Old (>${OLD_MONTHS} mo)`],
            [h.expiring.length, "Expiring soon"],
          ].map(([n, label]) => (
            <div
              className="border-border border-l px-5 py-4 first:border-l-0"
              key={label}
            >
              <b className="block text-[26px]/8 font-[650] tracking-[-0.02em]">
                {n}
              </b>
              <span className="text-muted-foreground text-[13px]">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <section aria-labelledby="recs">
        <H2 className="mb-3.5" id="recs">
          Recommendations
        </H2>
        {recs.length ? (
          <List>
            {recs.map((rec) => (
              <div
                className="border-border grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 border-t px-[18px] py-3.5 first:border-t-0"
                key={rec.key}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-9 place-items-center rounded-full [&_svg]:size-[18px]",
                    rec.bad
                      ? "bg-error-50 text-error-700"
                      : "bg-warning-50 text-warning-700"
                  )}
                >
                  {rec.bad ? <TriangleAlert /> : <Clock />}
                </span>
                <div>
                  <div className="font-semibold">{rec.title}</div>
                  <div className="text-muted-foreground text-[13px]">
                    {rec.body}
                  </div>
                </div>
                <Button asChild size="sm" variant="secondary">
                  <a href={rec.href}>Change</a>
                </Button>
              </div>
            ))}
          </List>
        ) : (
          <Note tone="success">
            <p>
              No issues found. Every password is unique, strong and current.
            </p>
          </Note>
        )}
        <p className={`${hintClass} mt-4 flex items-center gap-2`}>
          <Lock aria-hidden className="size-3.5" />
          Scores, reuse checks and password age are calculated on this device
          after you unlock. Nothing is sent to the server.
        </p>
      </section>
    </AppLayout>
  );
}
