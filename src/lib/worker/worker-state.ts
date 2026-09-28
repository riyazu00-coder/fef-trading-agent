/**
 * FEF CORTEX — AUTONOMOUS WORKER STATE & PERSISTENCE
 * 
 * Manages server-side persistence of intelligence snapshots, decision transitions,
 * provider health, and alert events.
 * Strict retention limits enforced (50 entries max).
 * Zero credentials, auth tokens, or secrets stored.
 */

import fs from 'fs';
import path from 'path';

export interface AssetSnapshotSummary {
  symbol: string;
  timestamp: string;
  marketDataAuthority: string;
  decisionPosture: string;
  directionalBias: string;
  confidence: number;
  setupQuality: number;
  entryZone?: [number, number];
  stopLoss?: number;
  tp1?: number;
  rr?: string;
  invalidation?: string;
  verifiedAgentCount: number;
  dataLimitedCount: number;
  actionabilityState?: string;
}

export interface WorkerPersistenceState {
  lastCycle: number;
  lastHeartbeat: string;
  status: 'ACTIVE' | 'IDLE' | 'ERROR';
  healthyProvidersCount: number;
  totalProvidersCount: number;
  monitoredAssetsCount: number;
  snapshots: Record<string, AssetSnapshotSummary>;
  transitions: {
    symbol: string;
    fromState: string;
    toState: string;
    timestamp: string;
    priority: string;
  }[];
  recentAlerts: {
    id: string;
    symbol: string;
    title: string;
    timestamp: string;
    priority: string;
  }[];
}

const PERSISTENCE_PATH = path.join(process.cwd(), '.system_generated', 'intelligence-snapshots.json');
const MAX_HISTORY = 50;

class WorkerStateManager {
  private state: WorkerPersistenceState = {
    lastCycle: 0,
    lastHeartbeat: new Date().toISOString(),
    status: 'IDLE',
    healthyProvidersCount: 0,
    totalProvidersCount: 0,
    monitoredAssetsCount: 0,
    snapshots: {},
    transitions: [],
    recentAlerts: [],
  };

  constructor() {
    this.loadFromDisk();
  }

  public getState(): WorkerPersistenceState {
    return this.state;
  }

  public getStatus(): WorkerPersistenceState {
    return this.getState();
  }

  public recordCycle(
    cycle: number,
    healthyProviders: number,
    totalProviders: number,
    snapshots: Record<string, AssetSnapshotSummary>,
    transitions: { symbol: string; fromState: string; toState: string; timestamp: string; priority: string }[] = [],
    alerts: { id: string; symbol: string; title: string; timestamp: string; priority: string }[] = []
  ): void {
    const now = new Date().toISOString();
    this.state.lastCycle = cycle;
    this.state.lastHeartbeat = now;
    this.state.status = 'ACTIVE';
    this.state.healthyProvidersCount = healthyProviders;
    this.state.totalProvidersCount = totalProviders;
    this.state.monitoredAssetsCount = Object.keys(snapshots).length;
    this.state.snapshots = snapshots;

    if (transitions.length > 0) {
      this.state.transitions = [...transitions, ...this.state.transitions].slice(0, MAX_HISTORY);
    }
    if (alerts.length > 0) {
      this.state.recentAlerts = [...alerts, ...this.state.recentAlerts].slice(0, MAX_HISTORY);
    }

    this.saveToDisk();
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(PERSISTENCE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      // Non-fatal disk write warning
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(PERSISTENCE_PATH)) {
        const raw = fs.readFileSync(PERSISTENCE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.lastCycle === 'number') {
          this.state = parsed;
        }
      }
    } catch (err) {
      // Clean fallback
    }
  }
}

export const workerStateManager = new WorkerStateManager();
