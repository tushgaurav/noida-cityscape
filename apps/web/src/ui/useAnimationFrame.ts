import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: (time: number) => void, fps = 30) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    let frame = 0;
    let last = 0;
    const interval = 1000 / fps;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (time - last < interval) return;
      last = time;
      saved.current(time);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [fps]);
}
