'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SynapseNode, BASE_SYNAPSE_NODES, INCOMING_DATA_POOL } from '@/lib/agents/synapse-data-feed';

interface FlyingParticle {
  startX: number;
  startY: number;
  targetNodeId: string;
  progress: number;
  label: string;
}

export const NeuralSynapseSphere: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<SynapseNode[]>(BASE_SYNAPSE_NODES);
  const [hoveredNode, setHoveredNode] = useState<SynapseNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<SynapseNode | null>(BASE_SYNAPSE_NODES[0]);
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [lastSpawnedName, setLastSpawnedName] = useState<string>('XAUUSD Live Spot Tick');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Mouse interaction state
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rotXRef = useRef<number>(0.2);
  const rotYRef = useRef<number>(0.4);
  const hoveredNodeRef = useRef<SynapseNode | null>(null);
  const nodesRef = useRef<SynapseNode[]>(BASE_SYNAPSE_NODES);
  const flyingParticlesRef = useRef<FlyingParticle[]>([]);
  const projectedMapRef = useRef<any[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Periodic Live Data Ingestion: An incoming data particle shoots from the cosmos into the sphere
  useEffect(() => {
    let poolIndex = 0;
    const interval = setInterval(() => {
      const template = INCOMING_DATA_POOL[poolIndex % INCOMING_DATA_POOL.length];
      poolIndex += 1;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      // Random spherical coordinates on surface
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const radius = 175 + (Math.random() - 0.5) * 20;

      const newId = `syn-${Date.now()}`;
      const newNode: SynapseNode = {
        ...template,
        id: newId,
        timestamp: timeStr,
        theta,
        phi,
        radius,
        isNew: true
      };

      // Add a flying particle trajectory from outer corner
      flyingParticlesRef.current.push({
        startX: Math.random() < 0.5 ? 20 : 600,
        startY: Math.random() < 0.5 ? 20 : 400,
        targetNodeId: newId,
        progress: 0,
        label: `${newNode.category}: ${newNode.value}`
      });

      setLastSpawnedName(`${newNode.category}: ${newNode.title} (${newNode.value})`);
      setNodes((prev) => {
        const next = [...prev.slice(-30), newNode];
        nodesRef.current = next;
        return next;
      });
      setSelectedNode(newNode);
    }, 2600);

    return () => clearInterval(interval);
  }, []);

  // 3D Canvas Rendering Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener('resize', handleResize);

    // Generate background ambient stars to form the full dense galaxy sphere from the image
    const backgroundStars: { theta: number; phi: number; radius: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < 220; i++) {
      backgroundStars.push({
        theta: Math.random() * Math.PI * 2,
        phi: (Math.random() - 0.5) * Math.PI,
        radius: 135 + Math.random() * 60,
        size: Math.random() * 1.8 + 0.6,
        alpha: Math.random() * 0.55 + 0.15
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const fov = 380;
      const cx = width / 2;
      const cy = height / 2;

      // Auto rotation when not dragging
      if (isAutoRotate && !isDraggingRef.current) {
        rotYRef.current += 0.0035;
        rotXRef.current += 0.001;
      }

      const cosX = Math.cos(rotXRef.current);
      const sinX = Math.sin(rotXRef.current);
      const cosY = Math.cos(rotYRef.current);
      const sinY = Math.sin(rotYRef.current);

      // 1. Project Background Galaxy Stars
      backgroundStars.forEach((star) => {
        const x0 = star.radius * Math.cos(star.phi) * Math.cos(star.theta);
        const y0 = star.radius * Math.sin(star.phi);
        const z0 = star.radius * Math.cos(star.phi) * Math.sin(star.theta);

        const x1 = x0 * cosY - z0 * sinY;
        const z1 = z0 * cosY + x0 * sinY;

        const y1 = y0 * cosX - z1 * sinX;
        const z2 = z1 * cosX + y0 * sinX;

        const scale = fov / (fov + z2 + 220);
        const x2D = cx + x1 * scale;
        const y2D = cy + y1 * scale;

        const depthAlpha = Math.max(0.1, (z2 + 200) / 400) * star.alpha;
        ctx.beginPath();
        ctx.arc(x2D, y2D, star.size * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(186, 230, 253, ${depthAlpha})`;
        ctx.fill();
      });

      // 2. Project Intelligent Active Synapse Nodes
      const currentNodes = nodesRef.current;
      const projectedNodes = currentNodes.map((node) => {
        const x0 = node.radius * Math.cos(node.phi) * Math.cos(node.theta);
        const y0 = node.radius * Math.sin(node.phi);
        const z0 = node.radius * Math.cos(node.phi) * Math.sin(node.theta);

        const x1 = x0 * cosY - z0 * sinY;
        const z1 = z0 * cosY + x0 * sinY;

        const y1 = y0 * cosX - z1 * sinX;
        const z2 = z1 * cosX + y0 * sinX;

        const scale = fov / (fov + z2 + 220);
        const x2D = cx + x1 * scale;
        const y2D = cy + y1 * scale;

        return {
          ...node,
          x2D,
          y2D,
          scale,
          z2
        };
      });

      projectedMapRef.current = projectedNodes;

      // Sort by depth (back to front)
      projectedNodes.sort((a, b) => a.z2 - b.z2);

      // 3. Draw Synaptic Connective Filaments between close nodes
      for (let i = 0; i < projectedNodes.length; i++) {
        for (let j = i + 1; j < projectedNodes.length; j++) {
          const p1 = projectedNodes[i];
          const p2 = projectedNodes[j];
          const dx = p1.x2D - p2.x2D;
          const dy = p1.y2D - p2.y2D;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 115) {
            const filamentAlpha = (1 - dist / 115) * 0.45 * Math.min(p1.scale, p2.scale);
            ctx.beginPath();
            ctx.moveTo(p1.x2D, p1.y2D);
            ctx.lineTo(p2.x2D, p2.y2D);
            ctx.strokeStyle = `rgba(56, 189, 248, ${filamentAlpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }

      // 4. Draw Incoming Flying Data Particles (Lively Data Collection Ingestion)
      flyingParticlesRef.current = flyingParticlesRef.current.filter((fp) => {
        fp.progress += 0.035;
        const targetNode = projectedNodes.find((n) => n.id === fp.targetNodeId);
        if (!targetNode || fp.progress >= 1) return false;

        const curX = fp.startX + (targetNode.x2D - fp.startX) * fp.progress;
        const curY = fp.startY + (targetNode.y2D - fp.startY) * fp.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(fp.label, curX + 6, curY - 4);
        return true;
      });

      // 5. Draw Glowing Star Nodes with Sparkling Lens Flares
      projectedNodes.forEach((node) => {
        const isHovered = hoveredNodeRef.current?.id === node.id;
        const isFilteredOut = filterCategory !== 'ALL' && node.category !== filterCategory;
        const opacity = isFilteredOut ? 0.2 : 1.0;
        const radius = Math.max(2, (node.size * node.scale) * (isHovered ? 1.6 : 1));

        ctx.save();
        ctx.globalAlpha = opacity;

        // Outer Ethereal Synaptic Glow
        const gradient = ctx.createRadialGradient(
          node.x2D, node.y2D, 0,
          node.x2D, node.y2D, radius * 4.2
        );
        gradient.addColorStop(0, node.color);
        gradient.addColorStop(0.35, 'rgba(56, 189, 248, 0.4)');
        gradient.addColorStop(1, 'rgba(2, 6, 23, 0)');

        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, radius * 4.2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Star Flare Cross Sparkle (Exact match to reference image)
        const flareLen = radius * 3.6;
        ctx.beginPath();
        ctx.moveTo(node.x2D - flareLen, node.y2D);
        ctx.lineTo(node.x2D + flareLen, node.y2D);
        ctx.moveTo(node.x2D, node.y2D - flareLen);
        ctx.lineTo(node.x2D, node.y2D + flareLen);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        // Core White-Hot Star Point
        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label on Node
        if (isHovered || node.isNew || node.scale > 0.95) {
          ctx.font = 'bold 8.5px monospace';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(node.title, node.x2D + 12, node.y2D - 4);
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = node.color;
          ctx.fillText(String(node.value), node.x2D + 12, node.y2D + 7);
        }

        ctx.restore();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isAutoRotate, filterCategory]);

  // Mouse Handlers for 3D Orbiting & Hover Node Detection
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDraggingRef.current) {
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      rotYRef.current += dx * 0.006;
      rotXRef.current -= dy * 0.006;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const found = projectedMapRef.current.find((n) => {
        const d = Math.hypot(mouseX - n.x2D, mouseY - n.y2D);
        return d < 20;
      });

      if (found) {
        hoveredNodeRef.current = found;
        setHoveredNode(found);
        setSelectedNode(found);
      } else {
        hoveredNodeRef.current = null;
        setHoveredNode(null);
      }
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className="relative bg-[#020409] border border-cyan-500/30 rounded-3xl p-4 sm:p-6 shadow-[0_0_60px_rgba(0,240,255,0.15)] overflow-hidden flex flex-col items-center justify-center min-h-[520px]">
      {/* Background Starfield & Ethereal Core Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#0e2340_0%,#020409_70%)] opacity-75 pointer-events-none"></div>

      {/* Top Floating HUD Status Banner */}
      <div className="absolute top-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 z-10 font-mono text-[10px]">
        <div className="flex items-center space-x-2 bg-[#050b18]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 text-cyan-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span className="font-bold tracking-wider uppercase">LIVING 3D SYNAPSE SPHERE</span>
        </div>

        {/* Category Filters */}
        <div className="hidden lg:flex items-center bg-[#050b18]/90 backdrop-blur-md p-1 rounded-xl border border-white/[0.08] space-x-1 text-[9px]">
          {['ALL', 'PRICE', 'MACRO', 'TECHNICAL', 'CORRELATION', 'INSTITUTIONAL', 'RISK'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2 py-0.5 rounded-lg transition-all font-bold ${
                filterCategory === cat
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsAutoRotate(!isAutoRotate)}
            className="bg-[#050b18]/90 hover:bg-cyan-950/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/30 text-cyan-300 transition-all cursor-pointer font-bold"
          >
            {isAutoRotate ? '✦ ORBIT: ON' : '○ ORBIT: PAUSED'}
          </button>
        </div>
      </div>

      {/* 3D Canvas Element */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="w-full h-[420px] sm:h-[480px] cursor-grab active:cursor-grabbing z-0"
      />

      {/* Selected Synapse Node Inspector Card (Exact Data Point Readout) */}
      {selectedNode && (
        <div className="w-full max-w-2xl mt-3 z-10 bg-[#060c18]/95 backdrop-blur-md border border-cyan-500/50 rounded-2xl p-4 shadow-[0_0_35px_rgba(0,240,255,0.2)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left font-mono">
          <div className="space-y-1 flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded font-bold">
                {selectedNode.category}
              </span>
              <span className="text-xs sm:text-sm font-black text-white">{selectedNode.title}</span>
              <span className="text-[9px] text-gray-400">({selectedNode.source})</span>
            </div>
            <p className="text-[11px] text-gray-300 font-sans leading-relaxed">
              {selectedNode.detail}
            </p>
          </div>

          <div className="flex items-center space-x-4 text-[10px] sm:border-l sm:border-white/[0.08] sm:pl-4 w-full sm:w-auto justify-between sm:justify-start flex-shrink-0">
            <div>
              <div className="text-gray-400 text-[8.5px]">DATA VALUE:</div>
              <div className="text-emerald-400 font-black text-base">{selectedNode.value}</div>
            </div>
            <div>
              <div className="text-gray-400 text-[8.5px]">CONSUMED BY:</div>
              <div className="text-cyan-300 font-bold">{selectedNode.agent}</div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Drag Hint */}
      <div className="mt-2 text-[9px] font-mono text-gray-500 tracking-wider">
        DRAG TO ROTATE 3D SPHERE IN SPACE • HOVER ANY NODE TO INSPECT WHAT DATA IT REPRESENTS
      </div>
    </div>
  );
};
