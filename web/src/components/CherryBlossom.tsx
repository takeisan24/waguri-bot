"use client";

import React, { useEffect, useRef } from "react";

interface Petal {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
}

export default function CherryBlossom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A11y: tôn trọng prefers-reduced-motion — không chạy vòng lặp RAF cánh hoa (tránh gây khó
    // chịu cho người nhạy cảm với chuyển động). Canvas để trống, không tốn CPU.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let animationFrameId: number;
    const petals: Petal[] = [];
    const maxPetals = 40;

    const resizeCanvas = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // Create initial petals
    for (let i = 0; i < maxPetals; i++) {
      petals.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 6,
        h: Math.random() * 6 + 4,
        opacity: Math.random() * 0.6 + 0.3,
        speedX: Math.random() * 1.5 - 0.5,
        speedY: Math.random() * 1.2 + 0.8,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 2 - 1,
      });
    }

    const drawPetal = (ctx: CanvasRenderingContext2D, petal: Petal) => {
      ctx.save();
      ctx.translate(petal.x, petal.y);
      ctx.rotate((petal.rotation * Math.PI) / 180);
      ctx.beginPath();
      
      // Draw a cherry blossom petal shape (like a curved droplet or oval)
      ctx.ellipse(0, 0, petal.w, petal.h, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 183, 197, ${petal.opacity})`;
      ctx.fill();

      // Add a center line for details
      ctx.beginPath();
      ctx.moveTo(0, -petal.h);
      ctx.quadraticCurveTo(0, 0, 0, petal.h);
      ctx.strokeStyle = `rgba(255, 150, 170, ${petal.opacity * 0.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.restore();
    };

    const updateAndDraw = () => {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        
        // Update positions
        p.y += p.speedY;
        p.x += p.speedX + Math.sin(p.y / 30) * 0.3; // subtle wave movement
        p.rotation += p.rotationSpeed;

        // Reset petal if it falls off bottom or sides
        if (p.y > canvas.height || p.x > canvas.width || p.x < -p.w * 2) {
          p.x = Math.random() * canvas.width;
          p.y = -p.h * 2;
          p.opacity = Math.random() * 0.6 + 0.3;
          p.speedY = Math.random() * 1.2 + 0.8;
          p.speedX = Math.random() * 1.5 - 0.5;
        }

        drawPetal(ctx, p);
      }

      animationFrameId = requestAnimationFrame(updateAndDraw);
    };

    updateAndDraw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="canvas-container">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
