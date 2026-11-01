/**
 * FEF CORTEX — DETERMINISTIC MULTI-TIMEFRAME CHART RASTERIZER
 * 
 * Generates standardized 1280x720 multi-timeframe (H4 + H1 + M15) chart packets
 * from verified CORTEX OHLC candles and market structure.
 * 
 * ZERO external npm dependencies: uses native Node.js zlib for high-speed,
 * reproducible PNG compression and pure SVG vector generation.
 */

import zlib from 'zlib';
import { OHLCCandle } from '@/lib/market/canonical-market-snapshot';
import { MarketStructure } from '@/lib/market/market-structure-engine';

export interface ChartRasterizerInput {
  symbol: string;
  h4Candles: OHLCCandle[];
  h1Candles: OHLCCandle[];
  m15Candles: OHLCCandle[];
  currentPrice?: number;
  h4Structure?: MarketStructure | null;
  h1Structure?: MarketStructure | null;
  m15Structure?: MarketStructure | null;
}

export interface ChartRasterizerOutput {
  width: number;
  height: number;
  pngBuffer: Buffer;
  base64Png: string;
  svgString: string;
  mimeType: 'image/png';
  renderedAt: number;
  candleCounts: {
    h4: number;
    h1: number;
    m15: number;
  };
  globalPriceRange: {
    min: number;
    max: number;
  };
}

// ---------------------------------------------------------------------------
// Pure Software 2D Framebuffer & PNG Encoder (Zero Dependencies)
// ---------------------------------------------------------------------------

class SoftwareFramebuffer {
  public readonly width: number;
  public readonly height: number;
  private readonly data: Uint8Array;

  constructor(width: number, height: number, bgR = 9, bgG = 13, bgB = 22) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
    this.fill(bgR, bgG, bgB, 255);
  }

  public fill(r: number, g: number, b: number, a = 255): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = a;
    }
  }

  public setPixel(x: number, y: number, r: number, g: number, b: number, a = 255): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const idx = (y * this.width + x) * 4;
    if (a >= 255) {
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    } else {
      const alpha = a / 255;
      const invAlpha = 1 - alpha;
      this.data[idx] = Math.round(r * alpha + this.data[idx] * invAlpha);
      this.data[idx + 1] = Math.round(g * alpha + this.data[idx + 1] * invAlpha);
      this.data[idx + 2] = Math.round(b * alpha + this.data[idx + 2] * invAlpha);
      this.data[idx + 3] = 255;
    }
  }

  public fillRect(x: number, y: number, w: number, h: number, r: number, g: number, b: number, a = 255): void {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.width, Math.ceil(x + w));
    const y1 = Math.min(this.height, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
  }

  public drawLineH(x0: number, x1: number, y: number, r: number, g: number, b: number, a = 255): void {
    const startX = Math.max(0, Math.min(Math.floor(x0), Math.floor(x1)));
    const endX = Math.min(this.width - 1, Math.max(Math.ceil(x0), Math.ceil(x1)));
    const py = Math.floor(y);
    if (py < 0 || py >= this.height) return;
    for (let px = startX; px <= endX; px++) {
      this.setPixel(px, py, r, g, b, a);
    }
  }

  public drawLineV(x: number, y0: number, y1: number, r: number, g: number, b: number, a = 255): void {
    const startY = Math.max(0, Math.min(Math.floor(y0), Math.floor(y1)));
    const endY = Math.min(this.height - 1, Math.max(Math.ceil(y0), Math.ceil(y1)));
    const px = Math.floor(x);
    if (px < 0 || px >= this.width) return;
    for (let py = startY; py <= endY; py++) {
      this.setPixel(px, py, r, g, b, a);
    }
  }

  public drawDashedLineH(x0: number, x1: number, y: number, dashLen: number, r: number, g: number, b: number, a = 255): void {
    const startX = Math.max(0, Math.min(Math.floor(x0), Math.floor(x1)));
    const endX = Math.min(this.width - 1, Math.max(Math.ceil(x0), Math.ceil(x1)));
    const py = Math.floor(y);
    if (py < 0 || py >= this.height) return;
    for (let px = startX; px <= endX; px++) {
      if (Math.floor(px / dashLen) % 2 === 0) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
  }

  public encodePng(): Buffer {
    const rowSize = this.width * 4 + 1;
    const raw = Buffer.alloc(rowSize * this.height);
    for (let y = 0; y < this.height; y++) {
      const rowOffset = y * rowSize;
      raw[rowOffset] = 0; // Filter: None
      const srcOffset = y * this.width * 4;
      for (let x = 0; x < this.width * 4; x++) {
        raw[rowOffset + 1 + x] = this.data[srcOffset + x];
      }
    }

    const deflated = zlib.deflateSync(raw, { level: 6 });

    // Precomputed CRC32 table
    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[i] = c;
    }

    const calcCrc = (buf: Buffer, start: number, len: number): number => {
      let crc = 0xffffffff;
      for (let i = start; i < start + len; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const makeChunk = (type: string, data: Buffer): Buffer => {
      const len = data.length;
      const buf = Buffer.alloc(8 + len + 4);
      buf.writeUInt32BE(len, 0);
      buf.write(type, 4, 4, 'ascii');
      data.copy(buf, 8);
      const c = calcCrc(buf, 4, 4 + len);
      buf.writeUInt32BE(c, 8 + len);
      return buf;
    };

    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace: none

    return Buffer.concat([
      sig,
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', deflated),
      makeChunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

// ---------------------------------------------------------------------------
// Multi-Timeframe Layout & Rendering Engine
// ---------------------------------------------------------------------------

interface PanelGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  chartX: number;
  chartW: number;
  chartY: number;
  chartH: number;
}

export function renderMultiTimeframeChart(input: ChartRasterizerInput): ChartRasterizerOutput {
  const WIDTH = 1280;
  const HEIGHT = 720;
  const HEADER_H = 40;
  const PANEL_SPACING = 8;
  const PANEL_H = Math.floor((HEIGHT - HEADER_H - PANEL_SPACING * 4) / 3); // ~216px

  const panels: Array<{
    name: 'H4' | 'H1' | 'M15';
    title: string;
    candles: OHLCCandle[];
    structure?: MarketStructure | null;
    geo: PanelGeometry;
  }> = [
    {
      name: 'H4',
      title: 'H4 MACRO STRUCTURE & KEY LIQUIDITY SHELVES',
      candles: (input.h4Candles || []).slice(-45),
      structure: input.h4Structure,
      geo: {
        x: 12,
        y: HEADER_H + PANEL_SPACING,
        w: WIDTH - 24,
        h: PANEL_H,
        chartX: 20,
        chartW: WIDTH - 140, // 120px right margin for price scale
        chartY: HEADER_H + PANEL_SPACING + 24,
        chartH: PANEL_H - 32,
      },
    },
    {
      name: 'H1',
      title: 'H1 INTERMEDIATE SMC & ORDER FLOW DYNAMICS',
      candles: (input.h1Candles || []).slice(-45),
      structure: input.h1Structure,
      geo: {
        x: 12,
        y: HEADER_H + PANEL_SPACING * 2 + PANEL_H,
        w: WIDTH - 24,
        h: PANEL_H,
        chartX: 20,
        chartW: WIDTH - 140,
        chartY: HEADER_H + PANEL_SPACING * 2 + PANEL_H + 24,
        chartH: PANEL_H - 32,
      },
    },
    {
      name: 'M15',
      title: 'M15 MICRO EXECUTION & DISPLACEMENT POSTURE',
      candles: (input.m15Candles || []).slice(-45),
      structure: input.m15Structure,
      geo: {
        x: 12,
        y: HEADER_H + PANEL_SPACING * 3 + PANEL_H * 2,
        w: WIDTH - 24,
        h: PANEL_H,
        chartX: 20,
        chartW: WIDTH - 140,
        chartY: HEADER_H + PANEL_SPACING * 3 + PANEL_H * 2 + 24,
        chartH: PANEL_H - 32,
      },
    },
  ];

  // Collect global min / max across all candles
  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const p of panels) {
    for (const c of p.candles) {
      if (c.low < globalMin) globalMin = c.low;
      if (c.high > globalMax) globalMax = c.high;
    }
  }
  if (!isFinite(globalMin)) globalMin = 0;
  if (!isFinite(globalMax)) globalMax = 100;

  const fb = new SoftwareFramebuffer(WIDTH, HEIGHT, 11, 15, 25); // Deep navy background #0b0f19

  // 1. Draw Global Header
  fb.fillRect(0, 0, WIDTH, HEADER_H, 15, 23, 42, 255); // #0f172a
  fb.drawLineH(0, WIDTH, HEADER_H, 30, 41, 59, 255);   // Border #1e293b

  // 2. Render Each Timeframe Panel
  for (const panel of panels) {
    const { geo, candles, structure, name } = panel;

    // Panel background card
    fb.fillRect(geo.x, geo.y, geo.w, geo.h, 15, 23, 42, 255); // #0f172a
    // Outer border
    fb.drawLineH(geo.x, geo.x + geo.w, geo.y, 30, 41, 59, 255);
    fb.drawLineH(geo.x, geo.x + geo.w, geo.y + geo.h, 30, 41, 59, 255);
    fb.drawLineV(geo.x, geo.y, geo.y + geo.h, 30, 41, 59, 255);
    fb.drawLineV(geo.x + geo.w, geo.y, geo.y + geo.h, 30, 41, 59, 255);

    // Title separator bar
    fb.fillRect(geo.x + 1, geo.y + 1, geo.w - 2, 20, 20, 30, 50, 255);
    fb.drawLineH(geo.x, geo.x + geo.w, geo.y + 21, 30, 41, 59, 255);

    // Right margin separator for price scale
    const scaleX = geo.chartX + geo.chartW;
    fb.drawLineV(scaleX, geo.chartY - 2, geo.chartY + geo.chartH, 30, 41, 59, 255);

    if (candles.length < 5) {
      // Data limited panel placeholder
      fb.fillRect(geo.chartX, geo.chartY, geo.chartW, geo.chartH, 30, 20, 20, 100);
      continue;
    }

    // Determine panel price range
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const c of candles) {
      if (c.low < pMin) pMin = c.low;
      if (c.high > pMax) pMax = c.high;
    }
    const padding = (pMax - pMin) * 0.08 || (pMax * 0.01) || 1;
    const yMin = pMin - padding;
    const yMax = pMax + padding;
    const yRange = yMax - yMin;

    const priceToY = (price: number): number => {
      const norm = (price - yMin) / yRange;
      return geo.chartY + geo.chartH - Math.round(norm * geo.chartH);
    };

    // Grid lines (3 horizontal lines)
    for (let g = 1; g <= 3; g++) {
      const gridPrice = yMin + (yRange / 4) * g;
      const gy = priceToY(gridPrice);
      fb.drawDashedLineH(geo.chartX, scaleX, gy, 4, 30, 41, 59, 140);
    }

    // Draw Verified FVG Zones if present in structure
    if (structure && Array.isArray(structure.fvg)) {
      for (const fvg of structure.fvg) {
        const topY = priceToY(Math.max(fvg.high, fvg.low));
        const botY = priceToY(Math.min(fvg.high, fvg.low));
        const h = Math.max(2, botY - topY);
        // Cyan tint for FVG
        fb.fillRect(geo.chartX, topY, geo.chartW, h, 6, 182, 212, 45); // rgba(6, 182, 212, 0.18)
        fb.drawDashedLineH(geo.chartX, scaleX, topY, 6, 6, 182, 212, 100);
        fb.drawDashedLineH(geo.chartX, scaleX, botY, 6, 6, 182, 212, 100);
      }
    }

    // Draw Verified Order Blocks if present in structure
    if (structure && Array.isArray(structure.orderBlocks)) {
      for (const ob of structure.orderBlocks) {
        const topY = priceToY(Math.max(ob.high, ob.low));
        const botY = priceToY(Math.min(ob.high, ob.low));
        const h = Math.max(2, botY - topY);
        const isBull = ob.type === 'BULLISH_OB';
        // Green tint for Demand OB, Purple/Rose for Supply OB
        const [or, og, obC] = isBull ? [16, 185, 129] : [168, 85, 247];
        fb.fillRect(geo.chartX, topY, geo.chartW, h, or, og, obC, 40);
        fb.drawLineH(geo.chartX, scaleX, topY, or, og, obC, 90);
        fb.drawLineH(geo.chartX, scaleX, botY, or, og, obC, 90);
      }
    }

    // Draw Candlesticks
    const candleCount = candles.length;
    const slotW = geo.chartW / candleCount;
    const bodyW = Math.max(2, Math.floor(slotW * 0.72));

    for (let i = 0; i < candleCount; i++) {
      const c = candles[i];
      const cx = Math.floor(geo.chartX + i * slotW + slotW / 2);
      const isBull = c.close >= c.open;
      const [cr, cg, cb] = isBull ? [16, 185, 129] : [239, 68, 68]; // Emerald #10b981 vs Rose #ef4444

      const highY = priceToY(c.high);
      const lowY = priceToY(c.low);
      const openY = priceToY(c.open);
      const closeY = priceToY(c.close);

      // Vertical Wick
      fb.drawLineV(cx, highY, lowY, cr, cg, cb, 255);

      // Candle Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      const bodyX = cx - Math.floor(bodyW / 2);
      fb.fillRect(bodyX, bodyTop, bodyW, bodyHeight, cr, cg, cb, 255);

      // Volume histogram ONLY if genuine broker volume is present (> 0)
      const cVol = c.realVolume ?? c.tickVolume ?? 0;
      if (cVol > 0) {
        const maxVol = Math.max(...candles.map((k) => (k.realVolume ?? k.tickVolume ?? 0)), 1);
        const volH = Math.max(1, Math.round((cVol / maxVol) * 22));
        const volY = geo.chartY + geo.chartH - volH;
        fb.fillRect(bodyX, volY, bodyW, volH, cr, cg, cb, 70);
      }
    }

    // Draw Current Price Line across the panel
    if (typeof input.currentPrice === 'number' && input.currentPrice >= yMin && input.currentPrice <= yMax) {
      const py = priceToY(input.currentPrice);
      fb.drawDashedLineH(geo.chartX, scaleX, py, 3, 245, 158, 11, 230); // Amber #f59e0b
      // Price tag badge on right axis
      fb.fillRect(scaleX + 2, py - 6, geo.w - (scaleX - geo.x) - 4, 12, 245, 158, 11, 255);
    }
  }

  const pngBuffer = fb.encodePng();
  const base64Png = pngBuffer.toString('base64');

  // Also construct an equivalent pure SVG string representation for multimodal versatility
  const svgString = generateSvgRepresentation(input, panels, globalMin, globalMax, WIDTH, HEIGHT);

  return {
    width: WIDTH,
    height: HEIGHT,
    pngBuffer,
    base64Png,
    svgString,
    mimeType: 'image/png',
    renderedAt: Date.now(),
    candleCounts: {
      h4: input.h4Candles?.length || 0,
      h1: input.h1Candles?.length || 0,
      m15: input.m15Candles?.length || 0,
    },
    globalPriceRange: {
      min: globalMin,
      max: globalMax,
    },
  };
}

function generateSvgRepresentation(
  input: ChartRasterizerInput,
  panels: any[],
  globalMin: number,
  globalMax: number,
  w: number,
  h: number
): string {
  const symbol = input.symbol.toUpperCase();
  const price = input.currentPrice ? input.currentPrice.toFixed(2) : 'N/A';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="background-color: #0b0f19;">\n`;
  svg += `  <rect width="${w}" height="40" fill="#0f172a" stroke="#1e293b" />\n`;
  svg += `  <text x="20" y="26" fill="#00f0ff" font-family="monospace" font-size="16" font-weight="bold">FEF CORTEX • MULTI-TIMEFRAME VISION PACKET • ${symbol} (Price: ${price})</text>\n`;

  for (const p of panels) {
    const { geo, candles, title } = p;
    svg += `  <g transform="translate(${geo.x}, ${geo.y})">\n`;
    svg += `    <rect width="${geo.w}" height="${geo.h}" fill="#0f172a" stroke="#1e293b" rx="6" />\n`;
    svg += `    <text x="14" y="17" fill="#94a3b8" font-family="monospace" font-size="12" font-weight="bold">${title}</text>\n`;

    if (candles.length >= 5) {
      let pMin = Infinity;
      let pMax = -Infinity;
      for (const c of candles) {
        if (c.low < pMin) pMin = c.low;
        if (c.high > pMax) pMax = c.high;
      }
      const padding = (pMax - pMin) * 0.08 || 1;
      const yMin = pMin - padding;
      const yMax = pMax + padding;
      const yRange = yMax - yMin;

      const pToY = (val: number) => Math.round(geo.chartH - 8 - ((val - yMin) / yRange) * (geo.chartH - 24));
      const slotW = (geo.chartW - 40) / candles.length;

      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const isBull = c.close >= c.open;
        const color = isBull ? '#10b981' : '#ef4444';
        const cx = Math.round(15 + i * slotW + slotW / 2);
        const yHigh = pToY(c.high);
        const yLow = pToY(c.low);
        const yOpen = pToY(c.open);
        const yClose = pToY(c.close);
        const bodyY = Math.min(yOpen, yClose);
        const bodyH = Math.max(2, Math.abs(yClose - yOpen));

        svg += `    <line x1="${cx}" y1="${yHigh}" x2="${cx}" y2="${yLow}" stroke="${color}" stroke-width="1.2" />\n`;
        svg += `    <rect x="${cx - Math.max(1, Math.floor(slotW * 0.35))}" y="${bodyY}" width="${Math.max(2, Math.floor(slotW * 0.7))}" height="${bodyH}" fill="${color}" />\n`;
      }
    }
    svg += `  </g>\n`;
  }
  svg += `</svg>`;
  return svg;
}