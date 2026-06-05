/**
 * Blob-URL leak diagnostic — patches URL.createObjectURL to log every
 * call so we can see exactly which code paths are creating blobs.
 *
 * Open the browser console after deploying and look for:
 *   [blob-debug] URL.createObjectURL  called N times
 *   [blob-debug] Top callers:
 *     SmartImage.tsx:xxx  — N calls
 *     ...
 */

const original = URL.createObjectURL.bind(URL);
const callers = new Map<string, number>();
let totalCalls = 0;

URL.createObjectURL = function (obj: Blob | MediaSource, ...rest: any[]) {
  totalCalls++;
  // Capture a short stack trace
  const stack = new Error().stack || '';
  const lines = stack.split('\n').slice(2, 5); // skip Error + createObjectURL lines
  const caller = lines
    .map((l) => {
      const m = l.match(/\/([^/]+\.(?:tsx?|jsx?):\d+:\d+)/);
      return m ? m[1] : l.trim().substring(0, 60);
    })
    .join(' → ');
  callers.set(caller, (callers.get(caller) || 0) + 1);

  return original(obj as Blob, ...rest);
} as typeof URL.createObjectURL;

// Report every 5 seconds
setInterval(() => {
  if (totalCalls === 0) return;
  console.log(
    `%c[blob-debug] URL.createObjectURL 共调用 ${totalCalls} 次`,
    'color:#ff6b6b;font-weight:bold',
  );
  const sorted = [...callers.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  sorted.forEach(([caller, count]) => {
    console.log(`  ${count.toString().padStart(4)}  ${caller}`);
  });
}, 5000);

export {};
