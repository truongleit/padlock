import { Shell } from "@/components/Shell";

export function App() {
  return (
    <Shell>
      <h1 className="text-xl font-semibold">Padlock</h1>
      <button
        className="mt-4 rounded bg-black px-3 py-1 text-white"
        onClick={() =>
          browser.tabs.create({ url: browser.runtime.getURL("/app.html") })
        }
      >
        Open full app
      </button>
    </Shell>
  );
}
