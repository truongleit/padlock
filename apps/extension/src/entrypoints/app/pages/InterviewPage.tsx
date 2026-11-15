import { Lock } from "lucide-react";
import { type FormEvent, useState } from "react";

import { AppLayout } from "@/components/AppLayout";
import { PasswordOutput } from "@/components/PasswordOutput";
import { Button } from "@/components/ui/button";
import { hintClass } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { H3 } from "@/components/ui/typography";
import { GeneratorHeader } from "@/entrypoints/app/pages/GeneratorPage";
import { INTERVIEW_QUESTIONS, interviewPassword } from "@/lib/generator";
import { navigate } from "@/lib/router";

/** W-11 (FR-4.2, FR-4.3). Answers stay in component state only (NFR-SEC-12). */
export function InterviewPage({ path }: { path: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() =>
    INTERVIEW_QUESTIONS.map(() => "")
  );
  const [password, setPassword] = useState(() => interviewPassword([]));
  const total = INTERVIEW_QUESTIONS.length;
  const last = step === total - 1;

  function onNext(e: FormEvent) {
    e.preventDefault();
    setPassword(interviewPassword(answers));
    if (!last) setStep(step + 1);
  }

  return (
    <AppLayout className="max-w-[680px]" path={path}>
      <GeneratorHeader mode="interview" />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-neutral-800">
              Question {step + 1} of {total}
            </span>
            <span className="text-muted-foreground text-xs">
              {Math.round(((step + 1) / total) * 100)}%
            </span>
          </div>
          <div
            aria-label="Interview progress"
            aria-valuemax={total}
            aria-valuemin={0}
            aria-valuenow={step + 1}
            className="h-1 rounded-xs bg-neutral-200"
            role="progressbar"
          >
            <div
              className="bg-primary h-full rounded-xs transition-[width]"
              style={{ width: `${((step + 1) / total) * 100}%` }}
            />
          </div>
        </div>
        <form className="flex flex-col gap-6" onSubmit={onNext}>
          <div className="flex flex-col gap-3">
            <label
              className="text-xl/7 font-[650] tracking-[-0.015em]"
              htmlFor="answer"
            >
              {INTERVIEW_QUESTIONS[step]}
            </label>
            <Input
              aria-describedby="privacy"
              autoComplete="off"
              className="min-h-13 text-base"
              id="answer"
              onChange={(e) =>
                setAnswers(
                  answers.map((a, i) => (i === step ? e.target.value : a))
                )
              }
              value={answers[step]}
            />
            <p className={`${hintClass} flex items-center gap-2`} id="privacy">
              <Lock aria-hidden className="size-3.5" />
              Answers are used only on this device. They're never stored or sent
              to the server.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
              variant="secondary"
            >
              Back
            </Button>
            <Button type="submit">
              {last ? "Update preview" : "Next question"}
            </Button>
          </div>
        </form>
        <hr className="bg-border h-px border-0" />
        <section aria-labelledby="preview" className="flex flex-col gap-4">
          <H3 id="preview">Preview</H3>
          <PasswordOutput
            onRegenerate={() => setPassword(interviewPassword(answers))}
            password={password}
            scoreLabel="Meets the minimum score"
          >
            <Button onClick={() => navigate("/vault/new", password)}>
              Use this password
            </Button>
          </PasswordOutput>
        </section>
      </div>
    </AppLayout>
  );
}
