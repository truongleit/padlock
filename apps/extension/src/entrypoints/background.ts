import { accountStore, isIdle, sessionStore } from "@/lib/vault";

// FR-7.1: lock every extension page after the configured idle time.
export default defineBackground(() => {
  browser.alarms.create("auto-lock", { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(async () => {
    const [session, account] = await Promise.all([
      sessionStore.getValue(),
      accountStore.getValue(),
    ]);
    if (session && account && isIdle(session, account))
      await sessionStore.removeValue();
  });
});
