import { useEffect, useRef } from "react";

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  opacity: number;
  hue: number;
  wobble: number;
  wobbleSpeed: number;
  life: number;
  maxLife: number;
}

function spawnBubble(x: number, y: number): Bubble {
  const r = 8 + Math.random() * 22;
  const maxLife = 90 + Math.random() * 80;
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 0.8,
    vy: -(0.6 + Math.random() * 1.0),
    r,
    opacity: 0.55 + Math.random() * 0.3,
    hue: 160 + Math.random() * 200,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.025 + Math.random() * 0.02,
    life: maxLife,
    maxLife,
  };
}

function drawBubble(ctx: CanvasRenderingContext2D, b: Bubble) {
  const { x, y, r, opacity, hue } = b;

  ctx.save();

  // Iridescent fill
  const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
  grad.addColorStop(0, `hsla(${hue}, 90%, 97%, ${opacity * 0.35})`);
  grad.addColorStop(0.4, `hsla(${hue + 60}, 75%, 80%, ${opacity * 0.12})`);
  grad.addColorStop(0.8, `hsla(${hue + 140}, 65%, 70%, ${opacity * 0.08})`);
  grad.addColorStop(1, `hsla(${hue + 200}, 60%, 60%, ${opacity * 0.04})`);

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Outer rim
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue + 40}, 70%, 88%, ${opacity * 0.75})`;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Inner rim highlight
  ctx.beginPath();
  ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
  ctx.strokeStyle = `hsla(${hue + 80}, 80%, 95%, ${opacity * 0.18})`;
  ctx.lineWidth = 0.6;
  ctx.stroke();

  // Specular highlight top-left
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.85})`;
  ctx.fill();

  // Tiny secondary highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y - r * 0.5, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.55})`;
  ctx.fill();

  ctx.restore();
}

export default function SoapBubbles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const bubbles: Bubble[] = [];
    let mouseX = width / 2;
    let mouseY = height / 2;
    let lastSpawn = 0;
    let frameId: number;

    const onResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      const now = performance.now();
      if (now - lastSpawn > 55) {
        lastSpawn = now;
        bubbles.push(spawnBubble(
          mouseX + (Math.random() - 0.5) * 20,
          mouseY + (Math.random() - 0.5) * 20,
        ));
      }
    };

    const tick = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];

        b.wobble += b.wobbleSpeed;
        b.x += b.vx + Math.sin(b.wobble) * 0.4;
        b.y += b.vy;
        b.life--;

        // Fade in for first 15 frames, fade out near end
        const progress = b.life / b.maxLife;
        if (b.life > b.maxLife - 15) {
          b.opacity = ((b.maxLife - b.life) / 15) * 0.85;
        } else if (progress < 0.25) {
          b.opacity = progress / 0.25 * 0.85;
        }

        if (b.life <= 0 || b.y + b.r < 0) {
          bubbles.splice(i, 1);
          continue;
        }

        drawBubble(ctx, b);
      }

      frameId = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);
    frameId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 99998,
      }}
    />
  );
}
