import { useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import { PasswordOutput } from "@/components/PasswordOutput";
import { Button } from "@/components/ui/button";
import { Checkbox, labelClass } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { H1 } from "@/components/ui/typography";
import { useVault } from "@/components/VaultProvider";
import {
  type GeneratorOptions,
  hasCharset,
  randomPassword,
} from "@/lib/generator";
import { navigate } from "@/lib/router";

export function GeneratorHeader({ mode }: { mode: "random" | "interview" }) {
  return (
    <div className="mb-7 flex flex-col gap-4">
      <H1>Password generator</H1>
      <Segmented
        label="Generator type"
        onValueChange={(v) =>
          navigate(v === "random" ? "/generator" : "/generator/interview")
        }
        options={[
          { value: "random", label: "Random" },
          { value: "interview", label: "Interview (memorable)" },
        ]}
        value={mode}
      />
    </div>
  );
}

const CHECKS: [keyof GeneratorOptions, string][] = [
  ["upper", "Uppercase letters (A–Z)"],
  ["lower", "Lowercase letters (a–z)"],
  ["numbers", "Numbers (0–9)"],
  ["symbols", "Symbols (! # $ %)"],
  ["avoidAmbiguous", "Avoid look-alike characters (O, 0, l, 1)"],
];

/** W-10 (FR-4.1, FR-4.4). */
export function GeneratorPage({ path }: { path: string }) {
  const { settings } = useVault();
  const [opts, setOpts] = useState<GeneratorOptions>(() => ({
    ...settings.generatorDefaults,
    upper: true,
    lower: true,
    avoidAmbiguous: false,
  }));
  const [password, setPassword] = useState(() => randomPassword(opts));

  function apply(patch: Partial<GeneratorOptions>) {
    const next = { ...opts, ...patch };
    if (!hasCharset(next)) return;
    setOpts(next);
    setPassword(randomPassword(next));
  }

  return (
    <AppLayout className="max-w-[680px]" path={path}>
      <GeneratorHeader mode="random" />
      <div className="flex flex-col gap-5">
        <PasswordOutput
          onRegenerate={() => setPassword(randomPassword(opts))}
          password={password}
        >
          <Button onClick={() => navigate("/vault/new", password)}>
            Use this password
          </Button>
        </PasswordOutput>
        <hr className="bg-border h-px border-0" />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className={labelClass} htmlFor="length">
              Length
            </label>
            <span className="font-mono font-semibold">{opts.length}</span>
          </div>
          <input
            className="accent-primary h-11 w-full"
            id="length"
            max={64}
            min={8}
            onChange={(e) => apply({ length: Number(e.target.value) })}
            type="range"
            value={opts.length}
          />
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>8</span>
            <span>64</span>
          </div>
        </div>
        <div className="flex flex-col">
          {CHECKS.map(([key, label]) => (
            <Checkbox
              checked={Boolean(opts[key])}
              key={key}
              onChange={() => apply({ [key]: !opts[key] })}
            >
              {label}
            </Checkbox>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
