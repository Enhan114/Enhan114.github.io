/**
 * Communicate with the Service Worker to manage Cache Storage.
 * Unlike the browser's HTTP disk cache, Cache Storage has a
 * JavaScript API — we can delete individual entries from it.
 */

const REGISTERED = Symbol();

let ready = false;

export const registerSW = () => {
  if (!("serviceWorker" in navigator)) return;
  // Prevent double-registration
  if ((navigator as any)[REGISTERED]) return;
  (navigator as any)[REGISTERED] = true;

  navigator.serviceWorker
    .register("/sw-v2.js")
    .then((reg) => {
      console.log("[SW] registered, scope:", reg.scope);
      ready = true;
    })
    .catch((e) => {
      console.warn("[SW] registration failed:", e);
    });
};

const send = (data: { type: string; url?: string }) => {
  if (!ready || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage(data);
};

/** Delete a single audio URL from Cache Storage */
export const deleteFromSWCache = (url: string) => {
  send({ type: "DELETE_AUDIO_CACHE", url });
};

/** Delete all audio cache from Cache Storage */
export const deleteAllFromSWCache = () => {
  send({ type: "DELETE_ALL_AUDIO_CACHE" });
};
