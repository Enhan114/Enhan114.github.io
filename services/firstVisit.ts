const KEY = "aura:first-visit-done";

export const isFirstVisit = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return !window.localStorage.getItem(KEY);
  } catch {
    return false;
  }
};

export const markVisited = () => {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {}
};
