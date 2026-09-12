'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Node3D {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  value: string;
}

export const HolographicNeuralMesh: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeNodesCount, setActiveNodesCount] = useState<number>(18);
  const [selectedCoord, setSelectedCoord] = useState<string>('TENSOR_CORE_SYNC');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', onResize);

    // Generate 3D nodes for neural constellation
    const nodeLabels = [
      'TECH_M15', 'MACRO_10Y', 'CORR_DXY', 'INST_COT', 'GEO_RISK',
      'NEWS_NLP', 'SENT_SKEW', 'RISK_CAP', 'VISION_FVG', 'MT5_EXEC',
      'REGIME_VOL', 'ALPHA_TENSOR', 'SMT_SILVER', 'FLOW_ABSORB'
    ];

    const nodes: Node3D[] = nodeLabels.map((lbl, idx) => ({
      id: `node-${idx}`,
      label: lbl,
      x: (Math.random() - 0.5) * 260,
      y: (Math.random() - 0.5) * 240,
      z: (Math.random() - 0.5) * 260,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      vz: (Math.random() - 0.5) * 0.4,
      color: idx % 3 === 0 ? '#fbbf24' : '#00f0ff',
      value: (Math.random() * 100).toFixed(1)
    }));

    let angleX = 0;
    let angleY = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const fov = 340;
      const centerX = width / 2;
      const centerY = height / 2;

      angleY += 0.003;
      angleX += 0.001;

      const cosY = Math.cos(angleY);
      const sinY = Math.sin(angleY);
      const cosX = Math.cos(angleX);
      const sinX = Math.sin(angleX);

      // Transform nodes
      const projected = nodes.map((node) => {
        // Rotate Y
        let x1 = node.x * cosY - node.z * sinY;
        let z1 = node.z * cosY + node.x * sinY;

        // Rotate X
        let y1 = node.y * cosX - z1 * sinX;
        let z2 = z1 * cosX + node.y * sinX;

        // Perspective projection
        const scale = fov / (fov + z2 + 200);
        const x2D = centerX + x1 * scale;
        const y2D = centerY + y1 * scale;

        return {
          ...node,
          x2D,
          y2D,
          scale,
          z2
        };
      });

      // Sort by depth
      projected.sort((a, b) => b.z2 - a.z2);

      // Draw connecting holographic lines
      for (let i = 0; i < projected.length; i++) {
        for (let j = i + 1; j < projected.length; j++) {
          const dx = projected[i].x2D - projected[j].x2D;
          const dy = projected[i].y2D - projected[j].y2D;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 115) {
            const alpha = (1 - dist / 115) * 0.45;
            const isGolden = projected[i].color === '#fbbf24' || projected[j].color === '#fbbf24';

            ctx.beginPath();
            ctx.moveTo(projected[i].x2D, projected[i].y2D);
            ctx.lineTo(projected[j].x2D, projected[j].y2D);
            ctx.strokeStyle = isGolden
              ? `rgba(251, 191, 36, ${alpha})`
              : `rgba(0, 240, 255, ${alpha})`;
            ctx.lineWidth = isGolden ? 1.2 : 0.8;
            ctx.stroke();

            // Intermittent data pulse dot along line
            if (Math.random() < 0.015) {
              const t = Math.random();
              const px = projected[i].x2D + (projected[j].x2D - projected[i].x2D) * t;
              const py = projected[i].y2D + (projected[j].y2D - projected[i].y2D) * t;
              ctx.beginPath();
              ctx.arc(px, py, 2, 0, Math.PI * 2);
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = '#00ffff';
              ctx.shadowBlur = 6;
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }
        }
      }

      // Draw node particles
      projected.forEach((node) => {
        const radius = Math.max(1.8, 3.5 * node.scale);

        // Halo glow
        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = node.color === '#fbbf24' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(0, 240, 255, 0.15)';
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Text coordinate label
        if (node.scale > 0.85) {
          ctx.font = '7.5px monospace';
          ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
          ctx.fillText(node.label, node.x2D + 6, node.y2D - 4);
          ctx.fillStyle = node.color;
          ctx.fillText(`${node.value}%`, node.x2D + 6, node.y2D + 5);
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div className="relative bg-[#02050e]/95 border-2 border-cyan-500/70 rounded-2xl p-4 shadow-[0_0_35px_rgba(0,240,255,0.18)] overflow-hidden flex flex-col h-[420px]">
      {/* High-Tech Grid Overlays & Corner Reticles */}
      <div className="absolute top-2 left-2 flex items-center space-x-2 text-[10px] font-mono text-cyan-400">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span className="font-bold tracking-widest uppercase">3D HOLOGRAPHIC NEURAL MATRIX</span>
      </div>

      <div className="absolute top-2 right-2 text-right text-[9px] font-mono text-gray-400">
        <div className="text-amber-400 font-bold">FEF-TENSOR://COORD_SYNC</div>
        <div className="text-gray-500">3D ROTATION: 0.003 RAD/S</div>
      </div>

      {/* Decorative Corner Bracket Lines */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>

      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />

      {/* Floating Tactical Coordinate Readouts matching user image */}
      <div className="absolute bottom-3 left-3 bg-[#030814]/80 backdrop-blur-md border border-cyan-900/80 rounded-lg p-2 text-[9px] font-mono text-gray-300 space-y-0.5">
        <div className="text-cyan-400 font-bold flex items-center space-x-1">
          <span className="text-xs">☵</span>
          <span>COLLECTIVE CONVERGENCE MESH</span>
        </div>
        <div className="flex space-x-3 text-gray-400">
          <span>NODES: <span className="text-white font-bold">{activeNodesCount} Active</span></span>
          <span>LATENCY: <span className="text-emerald-400 font-bold">12ms</span></span>
          <span>TENSOR: <span className="text-amber-400 font-bold">81.4% Net</span></span>
        </div>
      </div>

      <div className="absolute bottom-3 right-3 bg-[#030814]/80 backdrop-blur-md border border-cyan-900/80 rounded-lg px-2.5 py-1 text-[9px] font-mono text-cyan-300 flex items-center space-x-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span>ALL AGENTS SYNCHRONIZED</span>
      </div>
    </div>
  );
};
