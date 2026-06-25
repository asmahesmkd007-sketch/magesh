import { findBestMove } from "./engine";

type Request = { token: number; fen: string; level: number };

self.onmessage = (e: MessageEvent<Request>) => {
  const { token, fen, level } = e.data;
  // Small artificial delay so low levels feel human, high levels feel instant-strong
  const started = Date.now();
  const move = findBestMove(fen, level);
  const elapsed = Date.now() - started;
  const minThink = level <= 2 ? 550 : 350;
  const wait = Math.max(0, minThink - elapsed);
  setTimeout(() => {
    (self as unknown as Worker).postMessage({ token, move });
  }, wait);
};
