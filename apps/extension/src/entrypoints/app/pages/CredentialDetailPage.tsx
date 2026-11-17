import { Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { AppLayout, BackLink } from "@/components/AppLayout";
import { Favicon } from "@/components/CredentialRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogIcon,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { H1, H3 } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import { errorText } from "@/lib/api";
import {
  analyze,
  daysUntil,
  formatAge,
  formatDate,
  formatDays,
  monthsSince,
} from "@/lib/health";
import { LEVEL_LABELS, level, score } from "@/lib/strength";
import { useCopy } from "@/lib/use-copy";
import { type Credential, deleteCredential } from "@/lib/vault";

function Row({
  label,
  children,
  actions,
}: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="border-border grid min-h-16 grid-cols-[140px_minmax(0,1fr)_auto] items-center gap-4 border-b py-3">
      <span className="text-[13px] font-semibold text-neutral-600">
        {label}
      </span>
      <span className="text-[15px] wrap-anywhere text-neutral-900">
        {children}
      </span>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[12.5px]">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2 text-[15px] font-semibold">
        {children}
      </dd>
    </div>
  );
}

const TONE = ["error", "error", "warning", "success", "success"] as const;

/** W-09. */
export function CredentialDetailPage({ item }: { item: Credential }) {
  const navigate = useNavigate();
  const { items } = useVault();
  const [show, setShow] = useState(false);
  const copy = useCopy();
  const s = score(item.password);
  const reusedWith = analyze(items)
    .reusedGroups.find((g) => g.some((i) => i.id === item.id))
    ?.filter((i) => i.id !== item.id);
  const days = item.expiresAt ? daysUntil(item.expiresAt) : null;

  async function onDelete() {
    try {
      await deleteCredential(item.id);
    } catch (e) {
      toast.error(errorText(e, "Couldn't delete. Try again."));
      return;
    }
    toast.success(`${item.site} deleted.`);
    void navigate("/vault");
  }

  return (
    <AppLayout className="max-w-[760px]">
      <div className="mb-6 flex flex-col gap-4">
        <BackLink to="/vault">Back to vault</BackLink>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Favicon large name={item.site} />
            <div className="min-w-0">
              <H1 className="truncate">{item.site}</H1>
              <p className="text-muted-foreground text-[13px]">
                Last updated {formatDate(item.updatedAt)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link to={`/vault/${item.id}/edit`}>
                <Pencil aria-hidden />
                Edit
              </Link>
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="danger-quiet">
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[420px]">
                <DialogIcon tone="error">
                  <Trash2 />
                </DialogIcon>
                <div className="flex flex-col gap-2">
                  <DialogTitle>Delete {item.site}?</DialogTitle>
                  <DialogDescription>
                    This credential will be permanently removed from your vault.
                    This can't be undone.
                  </DialogDescription>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">Cancel</Button>
                  </DialogClose>
                  <Button onClick={onDelete} variant="danger">
                    Delete credential
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="border-border border-t">
        <Row
          actions={
            item.username && (
              <Button
                onClick={() => copy(item.username, "Username")}
                size="sm"
                variant="secondary"
              >
                <Copy aria-hidden />
                Copy
              </Button>
            )
          }
          label="Username"
        >
          {item.username || "—"}
        </Row>
        <Row
          actions={
            <>
              <Button
                aria-pressed={show}
                className="min-w-[88px]"
                onClick={() => setShow(!show)}
                size="sm"
                variant="secondary"
              >
                {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {show ? "Hide" : "Show"}
              </Button>
              <Button
                onClick={() => copy(item.password, "Password", true)}
                size="sm"
                variant="secondary"
              >
                <Copy aria-hidden />
                Copy
              </Button>
            </>
          }
          label="Password"
        >
          <span className="font-mono tracking-[0.04em]">
            {show
              ? item.password
              : "•".repeat(Math.min(item.password.length, 16))}
          </span>
        </Row>
        {item.url && (
          <Row
            actions={
              <Button
                onClick={() => browser.tabs.create({ url: item.url })}
                size="sm"
                variant="secondary"
              >
                <ExternalLink aria-hidden />
                Open
              </Button>
            }
            label="Website"
          >
            {item.url}
          </Row>
        )}
        {item.notes && <Row label="Notes">{item.notes}</Row>}
      </div>

      <section aria-labelledby="health" className="mt-8">
        <H3 className="mb-3" id="health">
          Password health
        </H3>
        <dl className="border-border bg-surface-muted m-0 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-5 rounded-lg border p-5">
          <Stat label="Security score">
            {s} <Badge tone={TONE[level(s)]}>{LEVEL_LABELS[level(s)]}</Badge>
          </Stat>
          <Stat label="Password age">
            {formatAge(monthsSince(item.passwordChangedAt))}
          </Stat>
          <Stat label="Last changed">{formatDate(item.passwordChangedAt)}</Stat>
          <Stat label="Reused on other sites">
            {reusedWith?.length
              ? reusedWith.map((i) => i.site).join(", ")
              : "None"}
          </Stat>
          <Stat label="Expires">
            {item.expiresAt && days !== null ? (
              <>
                {formatDate(item.expiresAt)}
                {days <= 14 && (
                  <Button asChild size="sm" variant="link">
                    <Link to={`/vault/${item.id}/rotate`}>
                      {days < 0 ? "Expired" : `In ${formatDays(days)}`} · Change
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              "Not set"
            )}
          </Stat>
        </dl>
      </section>
    </AppLayout>
  );
}
