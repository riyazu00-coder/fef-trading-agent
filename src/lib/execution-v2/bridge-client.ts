/**
 * FEF CORTEX — EXECUTION BRIDGE V2 CLIENT
 * Master Consolidation V2: Typed Client for Execution Bridge V2 Service
 */

import {
  ExecutionCommand,
  ExecutionRecord,
  BrokerAccountTelemetry,
  BrokerContractSpec,
  BrokerQuoteTelemetry,
  BridgeV2HealthStatus,
} from './types';

export class ExecutionBridgeV2Client {
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.BRIDGE_V2_URL || 'http://localhost:5560') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async getHealth(): Promise<BridgeV2HealthStatus> {
    const res = await fetch(`${this.baseUrl}/v2/health`);
    if (!res.ok) {
      throw new Error(`Bridge V2 health check failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  public async getAccount(): Promise<BrokerAccountTelemetry | null> {
    const res = await fetch(`${this.baseUrl}/v2/account`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch account: HTTP ${res.status}`);
    const data = await res.json();
    return data.account || null;
  }

  public async getContractSpec(symbol: string): Promise<BrokerContractSpec | null> {
    const res = await fetch(`${this.baseUrl}/v2/specs/${encodeURIComponent(symbol.toUpperCase())}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch spec for ${symbol}: HTTP ${res.status}`);
    const data = await res.json();
    return data.spec || null;
  }

  public async getAllSpecs(): Promise<BrokerContractSpec[]> {
    const res = await fetch(`${this.baseUrl}/v2/specs`);
    if (!res.ok) throw new Error(`Failed to fetch specs: HTTP ${res.status}`);
    const data = await res.json();
    return data.specs || [];
  }

  public async getQuote(symbol: string): Promise<BrokerQuoteTelemetry | null> {
    const res = await fetch(`${this.baseUrl}/v2/quotes/${encodeURIComponent(symbol.toUpperCase())}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch quote for ${symbol}: HTTP ${res.status}`);
    const data = await res.json();
    return data.quote || null;
  }

  public async dispatchCommand(command: ExecutionCommand): Promise<{
    success: boolean;
    executionId: string;
    record: ExecutionRecord;
    error?: string;
  }> {
    const res = await fetch(`${this.baseUrl}/v2/execution/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        executionId: command.executionId,
        record: data.record,
        error: data.error || `HTTP ${res.status}`,
      };
    }

    return data;
  }

  public async getStatus(executionId: string): Promise<ExecutionRecord | null> {
    const res = await fetch(`${this.baseUrl}/v2/execution/status/${encodeURIComponent(executionId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch status for ${executionId}: HTTP ${res.status}`);
    const data = await res.json();
    return data.record || null;
  }

  /**
   * Dispatches and awaits final terminal state (FILLED / REJECTED / EXPIRED)
   */
  public async executeAndWait(
    command: ExecutionCommand,
    timeoutMs: number = 10000,
    pollIntervalMs: number = 200
  ): Promise<ExecutionRecord> {
    const dispatchResult = await this.dispatchCommand(command);
    if (!dispatchResult.success) {
      throw new Error(dispatchResult.error || 'Execution dispatch rejected');
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const record = await this.getStatus(command.executionId);
      if (record) {
        if (record.currentState === 'FILLED') {
          return record;
        }
        if (record.currentState === 'REJECTED' || record.currentState === 'EXPIRED') {
          throw new Error(
            record.failureReasonCode || record.error || `Execution ended with state ${record.currentState}`
          );
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Execution timed out after ${timeoutMs}ms awaiting MT5 EA response.`);
  }
}

export const bridgeV2Client = new ExecutionBridgeV2Client();

