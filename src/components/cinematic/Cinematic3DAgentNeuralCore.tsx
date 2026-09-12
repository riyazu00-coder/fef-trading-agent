'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { INITIAL_AGENTS } from '@/lib/agents/agent-swarm';

interface Cinematic3DAgentNeuralCoreProps {
  agents?: AgentState[];
  interactive?: boolean;
  className?: string;
  onSelectAgent?: (agent: AgentState) => void;
}

interface Node3D {
  id: string;
  type: string;
  name: string;
  role: string;
  bias: string;
  confidence: number;
  lastOpinion: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  nodeIndex: number;
  pulsePhase: number;
}

interface EnergyPacket {
  fromNodeId: string;
  toNodeId: string;
  progress: number;
  speed: number;
  color: string;
  size: number;
}

interface BokehParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  speedY: number;
  color: string;
}

// Inter-agent collaborative swarm connections
const AGENT_COLLABORATION_LINKS: [number, number][] = [
  [0, 11], // Technical <-> Order Flow
  [0, 13], // Technical <-> MTF Fractal
  [0, 8],  // Technical <-> Vision
  [1, 2],  // Macro <-> Correlation
  [1, 3],  // Macro <-> News
  [1, 7],  // Macro <-> Risk Guardian
  [2, 4],  // Correlation <-> Geopolitical
  [5, 6],  // Sentiment <-> Institutional
  [6, 14], // Institutional <-> Liquidity Map
  [9, 11], // Sniper <-> Order Flow
  [9, 12], // Sniper <-> Killzone
  [9, 14], // Sniper <-> Liquidity Map
  [10, 0], // Devil's Advocate <-> Technical
  [10, 7], // Devil's Advocate <-> Risk Guardian
  [12, 13],// Killzone <-> MTF Fractal
  [14, 11],// Liquidity Map <-> Order Flow
  [7, 9],  // Risk Guardian <-> Sniper
  [3, 4],  // News <-> Geopolitical
  [5, 10]  // Sentiment <-> Devil's Advocate
];

export const Cinematic3DAgentNeuralCore: React.FC<Cinematic3DAgentNeuralCoreProps> = ({
  agents = INITIAL_AGENTS,
  interactive = true,
  className = '',
  onSelectAgent
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredAgent, setHoveredAgent] = useState<Node3D | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Node3D | null>(null);

  // 3D rotation and interaction refs
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rotXRef = useRef<number>(0.25);
  const rotYRef = useRef<number>(0.4);
  const velXRef = useRef<number>(0.002);
  const velYRef = useRef<number>(0.0035);
  const mouseParallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const nodesRef = useRef<Node3D[]>([]);
  const energyPacketsRef = useRef<EnergyPacket[]>([]);
  const bokehRef = useRef<BokehParticle[]>([]);
  const projectedNodesRef = useRef<any[]>([]);

  // Initialize 3D Council Nodes & Ambient Embers
  useEffect(() => {
    const list = agents && agents.length > 0 ? agents : INITIAL_AGENTS;
    const count = list.length;
    const baseRadius = 240;

    // Fibonacci sphere distribution for harmonious 3D orbit
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden ratio angle

    const nodes: Node3D[] = list.map((agent, i) => {
      const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const x = Math.cos(theta) * radiusAtY;
      const z = Math.sin(theta) * radiusAtY;

      // Color mapping
      let color = '#38bdf8'; // cyan neutral
      if (agent.bias === 'BULLISH') color = '#34d399'; // emerald
      else if (agent.bias === 'BEARISH') color = '#fb7185'; // rose
      else if (agent.bias === 'CAUTION' || agent.bias === 'WAIT') color = '#fbbf24'; // amber
      if (agent.type === 'SNIPER') color = '#f59e0b';

      return {
        id: agent.type,
        type: agent.type,
        name: agent.name,
        role: agent.role,
        bias: agent.bias,
        confidence: agent.confidence,
        lastOpinion: agent.lastOpinion,
        x: x * baseRadius * (1 + (i % 3) * 0.15),
        y: y * (baseRadius * 0.85),
        z: z * baseRadius * (1 + (i % 2) * 0.12),
        radius: 7,
        color,
        nodeIndex: i,
        pulsePhase: Math.random() * Math.PI * 2
      };
    });

    nodesRef.current = nodes;

    // Initialize flowing photon packets between agents
    const packets: EnergyPacket[] = [];
    AGENT_COLLABORATION_LINKS.forEach(([i1, i2]) => {
      if (nodes[i1] && nodes[i2]) {
        packets.push({
          fromNodeId: nodes[i1].id,
          toNodeId: nodes[i2].id,
          progress: Math.random(),
          speed: 0.008 + Math.random() * 0.012,
          color: '#fbbf24',
          size: 2.5 + Math.random() * 1.5
        });
        packets.push({
          fromNodeId: nodes[i2].id,
          toNodeId: nodes[i1].id,
          progress: Math.random(),
          speed: 0.006 + Math.random() * 0.01,
          color: '#38bdf8',
          size: 2.2
        });
      }
    });
    energyPacketsRef.current = packets;

    // Ambient floating embers (warm bokeh dust matching image)
    const bokeh: BokehParticle[] = [];
    for (let i = 0; i < 160; i++) {
      bokeh.push({
        x: (Math.random() - 0.5) * 700,
        y: (Math.random() - 0.5) * 550,
        z: (Math.random() - 0.5) * 600,
        size: Math.random() * 2.2 + 0.6,
        alpha: Math.random() * 0.65 + 0.15,
        speedY: (Math.random() - 0.5) * 0.3,
        color: Math.random() > 0.4 ? '#fbbf24' : '#f59e0b'
      });
    }
    bokehRef.current = bokeh;
  }, [agents]);

  // Main 3D Animation & Rendering Loop
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

    let frameCount = 0;

    const render = () => {
      frameCount += 1;
      ctx.clearRect(0, 0, width, height);

      const fov = 420;
      const cx = width / 2 + mouseParallaxRef.current.x * 30;
      const cy = height / 2 + mouseParallaxRef.current.y * 20;

      // Auto continuous 3D rotation when not actively dragging
      if (!isDraggingRef.current) {
        rotYRef.current += velYRef.current;
        rotXRef.current += velXRef.current;
      }

      const cosX = Math.cos(rotXRef.current);
      const sinX = Math.sin(rotXRef.current);
      const cosY = Math.cos(rotYRef.current);
      const sinY = Math.sin(rotYRef.current);

      // Helper function for 3D rotation & perspective projection
      const project3D = (x0: number, y0: number, z0: number) => {
        // Rotate around Y axis
        const x1 = x0 * cosY - z0 * sinY;
        const z1 = z0 * cosY + x0 * sinY;
        // Rotate around X axis
        const y1 = y0 * cosX - z1 * sinX;
        const z2 = z1 * cosX + y0 * sinX;

        const scale = fov / (fov + z2 + 350);
        const x2D = cx + x1 * scale;
        const y2D = cy + y1 * scale;

        return { x2D, y2D, z2, scale };
      };

      // 1. Draw Ambient Floating Golden Embers (Bokeh Particles in Depth)
      bokehRef.current.forEach((b) => {
        b.y += b.speedY;
        if (b.y > 300) b.y = -300;
        if (b.y < -300) b.y = 300;

        const proj = project3D(b.x, b.y, b.z);
        if (proj.scale > 0) {
          ctx.beginPath();
          ctx.arc(proj.x2D, proj.y2D, b.size * proj.scale, 0, Math.PI * 2);
          const depthAlpha = Math.max(0.08, Math.min(0.85, (proj.z2 + 350) / 700)) * b.alpha;
          ctx.fillStyle = `rgba(251, 191, 36, ${depthAlpha})`;
          ctx.fill();
        }
      });

      // 2. Project 15 Council Agent Nodes in 3D
      const projectedNodes = nodesRef.current.map((n) => {
        const proj = project3D(n.x, n.y, n.z);
        return {
          ...n,
          x2D: proj.x2D,
          y2D: proj.y2D,
          z2: proj.z2,
          scale: proj.scale
        };
      });
      projectedNodesRef.current = projectedNodes;

      // Project Central Core Nucleus (0, 0, 0)
      const coreProj = project3D(0, 0, 0);

      // 3. Draw Golden Neural Tendrils (From Central Core to Each Council Agent)
      projectedNodes.forEach((node) => {
        const isHovered = hoveredAgent?.id === node.id;
        const alpha = Math.max(0.2, (node.z2 + 300) / 600) * (isHovered ? 0.9 : 0.45);

        ctx.beginPath();
        ctx.moveTo(coreProj.x2D, coreProj.y2D);

        // Curved organic filament bezier arc
        const midX = (coreProj.x2D + node.x2D) / 2 + Math.sin(frameCount * 0.02 + node.nodeIndex) * 12;
        const midY = (coreProj.y2D + node.y2D) / 2 + Math.cos(frameCount * 0.02 + node.nodeIndex) * 8;

        ctx.quadraticCurveTo(midX, midY, node.x2D, node.y2D);
        ctx.strokeStyle = isHovered
          ? `rgba(251, 191, 36, 0.9)`
          : `rgba(245, 158, 11, ${alpha})`;
        ctx.lineWidth = isHovered ? 2.5 : Math.max(0.8, 1.4 * node.scale);
        ctx.stroke();
      });

      // 4. Draw Inter-Agent Collaborative Synaptic Mesh (Agent to Agent)
      AGENT_COLLABORATION_LINKS.forEach(([i1, i2]) => {
        const p1 = projectedNodes[i1];
        const p2 = projectedNodes[i2];
        if (!p1 || !p2) return;

        const isRelated = hoveredAgent?.id === p1.id || hoveredAgent?.id === p2.id;
        const avgDepth = (p1.z2 + p2.z2) / 2;
        const lineAlpha = Math.max(0.12, (avgDepth + 300) / 600) * (isRelated ? 0.85 : 0.35);

        ctx.beginPath();
        ctx.moveTo(p1.x2D, p1.y2D);
        ctx.lineTo(p2.x2D, p2.y2D);
        ctx.strokeStyle = isRelated
          ? `rgba(0, 240, 255, 0.85)`
          : `rgba(251, 191, 36, ${lineAlpha})`;
        ctx.lineWidth = isRelated ? 2.0 : 0.9 * Math.min(p1.scale, p2.scale);
        ctx.stroke();
      });

      // 5. Draw Animated Photon Energy Packets Traveling Between Agents
      energyPacketsRef.current.forEach((pkt) => {
        pkt.progress += pkt.speed;
        if (pkt.progress > 1) pkt.progress = 0;

        const fromNode = projectedNodes.find((n) => n.id === pkt.fromNodeId);
        const toNode = projectedNodes.find((n) => n.id === pkt.toNodeId);
        if (!fromNode || !toNode) return;

        const curX = fromNode.x2D + (toNode.x2D - fromNode.x2D) * pkt.progress;
        const curY = fromNode.y2D + (toNode.y2D - fromNode.y2D) * pkt.progress;
        const curScale = fromNode.scale + (toNode.scale - fromNode.scale) * pkt.progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(curX, curY, pkt.size * curScale, 0, Math.PI * 2);
        ctx.fillStyle = pkt.color;
        ctx.shadowColor = pkt.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
      });

      // 6. Draw CENTRAL BLAZING NEURAL NUCLEUS (The Fiery Core from Image)
      const corePulse = Math.sin(frameCount * 0.04) * 4;
      const baseCoreR = 48 * coreProj.scale + corePulse;

      ctx.save();
      // Outer radiant coronal aura (molten amber bloom)
      const coronaGrad = ctx.createRadialGradient(
        coreProj.x2D, coreProj.y2D, baseCoreR * 0.2,
        coreProj.x2D, coreProj.y2D, baseCoreR * 2.8
      );
      coronaGrad.addColorStop(0, 'rgba(255, 248, 220, 0.95)');
      coronaGrad.addColorStop(0.2, 'rgba(251, 191, 36, 0.85)');
      coronaGrad.addColorStop(0.5, 'rgba(245, 158, 11, 0.45)');
      coronaGrad.addColorStop(0.8, 'rgba(180, 83, 9, 0.15)');
      coronaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(coreProj.x2D, coreProj.y2D, baseCoreR * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Dynamic radiating light spikes (like the rays in the user's photo)
      const rayCount = 18;
      for (let r = 0; r < rayCount; r++) {
        const rayAngle = (Math.PI * 2 / rayCount) * r + frameCount * 0.005;
        const rayLen = (baseCoreR * 2.2) + Math.sin(frameCount * 0.08 + r) * 16;
        const endX = coreProj.x2D + Math.cos(rayAngle) * rayLen;
        const endY = coreProj.y2D + Math.sin(rayAngle) * rayLen;

        const rayGrad = ctx.createLinearGradient(coreProj.x2D, coreProj.y2D, endX, endY);
        rayGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        rayGrad.addColorStop(0.4, 'rgba(251, 191, 36, 0.5)');
        rayGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');

        ctx.beginPath();
        ctx.moveTo(coreProj.x2D, coreProj.y2D);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = rayGrad;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      // Inner blazing white-hot core
      const innerCoreGrad = ctx.createRadialGradient(
        coreProj.x2D - baseCoreR * 0.2, coreProj.y2D - baseCoreR * 0.2, 0,
        coreProj.x2D, coreProj.y2D, baseCoreR
      );
      innerCoreGrad.addColorStop(0, '#ffffff');
      innerCoreGrad.addColorStop(0.35, '#fef08a');
      innerCoreGrad.addColorStop(0.7, '#f59e0b');
      innerCoreGrad.addColorStop(1, '#b45309');

      ctx.beginPath();
      ctx.arc(coreProj.x2D, coreProj.y2D, baseCoreR, 0, Math.PI * 2);
      ctx.fillStyle = innerCoreGrad;
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 25;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Central core label
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FEF CORE', coreProj.x2D, coreProj.y2D);
      ctx.restore();

      // 7. Draw 15 Council Agent Crystal Nodes (Sorted by depth)
      const sortedNodes = [...projectedNodes].sort((a, b) => a.z2 - b.z2);

      sortedNodes.forEach((node) => {
        const isHovered = hoveredAgent?.id === node.id;
        const isSelected = selectedAgent?.id === node.id;
        const nodeR = Math.max(3, (node.radius * node.scale) * (isHovered ? 1.5 : isSelected ? 1.4 : 1));

        ctx.save();

        // Outer sparkling node halo
        const haloGrad = ctx.createRadialGradient(
          node.x2D, node.y2D, 0,
          node.x2D, node.y2D, nodeR * 3.5
        );
        haloGrad.addColorStop(0, node.color);
        haloGrad.addColorStop(0.5, `${node.color}55`);
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, nodeR * 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Outer geometric crystal diamond or hexagon bracket
        ctx.save();
        ctx.translate(node.x2D, node.y2D);
        ctx.rotate(frameCount * 0.02 + node.nodeIndex);
        ctx.strokeStyle = isHovered ? '#ffffff' : node.color;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-nodeR * 1.5, -nodeR * 1.5, nodeR * 3, nodeR * 3);
        ctx.restore();

        // Inner solid glowing node sphere
        ctx.beginPath();
        ctx.arc(node.x2D, node.y2D, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#ffffff' : node.color;
        ctx.shadowColor = node.color;
        ctx.shadowBlur = isHovered ? 20 : 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label pill in 3D space
        const showLabel = isHovered || isSelected || node.scale > 0.85;
        if (showLabel) {
          const labelText = `#${String(node.nodeIndex + 1).padStart(2, '0')} ${node.name.replace(' Agent', '')}`;
          ctx.font = `bold ${isHovered ? 11 : 9.5}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';

          // Background chip
          const textW = ctx.measureText(labelText).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(node.x2D - textW / 2 - 4, node.y2D + nodeR + 4, textW + 8, 14);

          ctx.strokeStyle = isHovered ? '#fbbf24' : 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.strokeRect(node.x2D - textW / 2 - 4, node.y2D + nodeR + 4, textW + 8, 14);

          ctx.fillStyle = isHovered ? '#ffffff' : node.color;
          ctx.fillText(labelText, node.x2D, node.y2D + nodeR + 6);
        }

        ctx.restore();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [hoveredAgent, selectedAgent]);

  // Mouse drag to rotate 3D space & mouse hover detection
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Mouse parallax
    mouseParallaxRef.current = {
      x: (mouseX / rect.width - 0.5) * 2,
      y: (mouseY / rect.height - 0.5) * 2
    };

    if (isDraggingRef.current) {
      const deltaX = e.clientX - prevMouseRef.current.x;
      const deltaY = e.clientY - prevMouseRef.current.y;
      rotYRef.current += deltaX * 0.006;
      rotXRef.current += deltaY * 0.006;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Check hit test against projected nodes
    let found: Node3D | null = null;
    for (const node of projectedNodesRef.current) {
      const dx = mouseX - node.x2D;
      const dy = mouseY - node.y2D;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 22) {
        found = node;
        break;
      }
    }
    setHoveredAgent(found);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleClick = () => {
    if (hoveredAgent) {
      setSelectedAgent(hoveredAgent);
      if (onSelectAgent) {
        const fullAgent = agents.find((a) => a.type === hoveredAgent.type);
        if (fullAgent) onSelectAgent(fullAgent);
      }
    } else {
      setSelectedAgent(null);
    }
  };

  return (
    <div className={`relative w-full h-full select-none overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        onMouseDown={interactive ? handleMouseDown : undefined}
        onMouseMove={handleMouseMove}
        onMouseUp={interactive ? handleMouseUp : undefined}
        onMouseLeave={() => {
          isDraggingRef.current = false;
          setHoveredAgent(null);
        }}
        onClick={handleClick}
        className={`w-full h-full block ${interactive ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
      />

      {/* Floating Active Node Inspection HUD */}
      {hoveredAgent && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md border border-amber-400/60 px-3.5 py-2 rounded-xl text-center font-mono shadow-[0_0_20px_rgba(251,191,36,0.4)] pointer-events-none z-20 max-w-sm">
          <div className="flex items-center justify-center space-x-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredAgent.color }} />
            <span className="text-xs font-black text-white uppercase">{hoveredAgent.name}</span>
            <span className="text-[9px] text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-500/30">
              {hoveredAgent.confidence}% CONFIDENCE
            </span>
          </div>
          <p className="text-[9.5px] text-gray-200 mt-1 line-clamp-2">
            "{hoveredAgent.lastOpinion}"
          </p>
        </div>
      )}

      {/* Subtle bottom control hint */}
      <div className="absolute top-3 right-3 text-[8.5px] font-mono text-amber-300/80 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-amber-400/30 pointer-events-none flex items-center space-x-1">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping mr-1" />
        <span>3D SWARM MESH • DRAG TO ROTATE</span>
      </div>
    </div>
  );
};
