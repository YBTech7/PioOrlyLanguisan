import React, { useEffect, useRef } from 'react';

interface NodePoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  gold: boolean;
}

export const NetworkCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    const pointer = { x: -9999, y: -9999 };
    const nodes: NodePoint[] = [];

    const setupNodes = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const targetCount = Math.min(44, Math.max(18, Math.floor((width * height) / 28000)));
      nodes.length = 0;
      for (let i = 0; i < targetCount; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.28,
          vy: (Math.random() - 0.5) * 0.28,
          radius: i % 5 === 0 ? 2.2 : 1.5,
          gold: i % 4 === 0,
        });
      }
    };

    const drawFrame = (stepMotion: boolean) => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (stepMotion) {
          n.x += n.vx;
          n.y += n.vy;

          if (n.x < 0 || n.x > width) n.vx *= -1;
          if (n.y < 0 || n.y > height) n.vy *= -1;

          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 140 && dist > 1) {
            n.x -= (dx / dist) * 0.18;
            n.y -= (dy / dist) * 0.18;
          }
        }
      }

      const maxDist = 155;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle =
              a.gold || b.gold
                ? `rgba(200, 162, 83, ${alpha * 0.85})`
                : `rgba(38, 128, 142, ${alpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.gold ? 'rgba(229, 206, 147, 0.55)' : 'rgba(54, 152, 168, 0.45)';
        ctx.fill();
      }
    };

    setupNodes();

    if (prefersReduced) {
      drawFrame(false);
    } else {
      const render = () => {
        drawFrame(true);
        animationFrameId = window.requestAnimationFrame(render);
      };
      animationFrameId = window.requestAnimationFrame(render);
    }

    const handleResize = () => {
      setupNodes();
      if (prefersReduced) drawFrame(false);
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };

    const handlePointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-75"
    />
  );
};
