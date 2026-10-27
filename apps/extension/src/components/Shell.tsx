import type { ReactNode } from "react";

export function Shell({
  fullscreen,
  children,
}: {
  fullscreen?: boolean;
  children: ReactNode;
}) {
  return (
    <main
      className={fullscreen ? "min-h-screen p-8" : "h-[600px] w-[400px] p-4"}
    >
      {children}
    </main>
  );
}
