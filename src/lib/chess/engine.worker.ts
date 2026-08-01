import { findBestMove } from "./engine";

type Request = { token: number; fen: string; level: number };

self.onmessage = (e: MessageEvent<Request>) => {
  const { token, fen, level } = e.data;
  // Snappy & fast response delay (80-100ms) so bot returns move almost instantly
  const started = Date.now();
  const move = findBestMove(fen, level);
  const elapsed = Date.now() - started;
  const minThink = level <= 2 ? 100 : 80;
  const wait = Math.max(0, minThink - elapsed);
  setTimeout(() => {
    (self as unknown as Worker).postMessage({ token, move });
  }, wait);
};
