/**
 * FEF TRADING SOLUTIONS — LOCAL OUTBOUND CONNECTOR AGENT
 * 
 * Runs on the local user machine alongside MT5.
 * 1. Establishes OUTBOUND-ONLY connection to FEF Secure Relay (no inbound ports).
 * 2. Polls local MT5 HTTP bridge (127.0.0.1:5556).
 * 3. Encrypts and transmits telemetry to cloud control plane.
 * 4. Pulls unexpired, validated remote execution commands.
 * 5. Dispatches commands to local bridge and streams acknowledgments.
 */

import {
  RemoteTelemetrySnapshot,
  RemoteExecutionCommand,
  RemoteCommandAck,
  DeviceAuthCredentials,
} from './remote-types';
import { RemoteRelayManager } from './remote-relay-manager';
import { isMt5OrderTransportAllowed, READ_ONLY_EXECUTION_ERROR } from '../execution/execution-policy';

export interface LocalConnectorConfig {
  deviceId: string;
  keyId: string;
  authToken: string;
  localBridgeUrl: string;       // Typically http://127.0.0.1:5556
  localBridgeToken: string;
}

export class LocalConnectorAgent {
  private config: LocalConnectorConfig;
  private relay: RemoteRelayManager;
  private isRunning: boolean = false;
  private lastTelemetrySync: number = 0;

  constructor(config: LocalConnectorConfig, relay: RemoteRelayManager) {
    this.config = config;
    this.relay = relay;
  }

  public getCredentials(): DeviceAuthCredentials {
    return {
      deviceId: this.config.deviceId,
      keyId: this.config.keyId,
      authToken: this.config.authToken,
    };
  }

  /**
   * Start Outbound Connector Handshake
   */
  public async connect(): Promise<{ success: boolean; error?: string }> {
    const authResult = this.relay.authenticate(this.getCredentials());
    if (!authResult.success) {
      return { success: false, error: authResult.error };
    }
    this.isRunning = true;
    return { success: true };
  }

  /**
   * Disconnect Agent
   */
  public disconnect(): void {
    this.isRunning = false;
    this.relay.handleDisconnect(this.config.deviceId);
  }

  /**
   * Reconnect Agent
   */
  public reconnect(): { success: boolean; error?: string } {
    const authResult = this.relay.authenticate(this.getCredentials());
    if (!authResult.success) {
      return { success: false, error: authResult.error };
    }
    this.isRunning = true;
    this.relay.handleReconnect(this.config.deviceId);
    return { success: true };
  }

  /**
   * Push Telemetry to Relay
   */
  public pushTelemetry(snapshot: RemoteTelemetrySnapshot): boolean {
    if (!this.isRunning) return false;
    this.lastTelemetrySync = Date.now();
    return this.relay.ingestTelemetry(this.config.deviceId, snapshot);
  }

  /**
   * Poll and Execute Remote Commands
   */
  public async processNextCommand(
    executor?: (cmd: RemoteExecutionCommand) => Promise<{
      success: boolean;
      ticket?: number;
      deal?: number;
      fillPrice?: number;
      slippagePrice?: number;
      retcode?: number;
      retcodeDescription?: string;
      error?: { code: string; message: string };
    }>
  ): Promise<RemoteCommandAck | null> {
    if (!this.isRunning) return null;

    const cmd = this.relay.popNextCommand(this.config.deviceId);
    if (!cmd) return null;

    if (!isMt5OrderTransportAllowed()) {
      const deniedAck: RemoteCommandAck = {
        requestId: cmd.requestId,
        deviceId: this.config.deviceId,
        status: 'REJECTED',
        error: { ...READ_ONLY_EXECUTION_ERROR },
        timestamp: Date.now(),
      };
      this.relay.recordAck(deniedAck);
      return deniedAck;
    }

    const now = Date.now();

    // Check expiration immediately prior to execution
    if (cmd.expiresAt <= now) {
      const expiredAck: RemoteCommandAck = {
        requestId: cmd.requestId,
        deviceId: this.config.deviceId,
        status: 'EXPIRED',
        error: {
          code: 'COMMAND_EXPIRED_AT_CONNECTOR',
          message: 'Command passed expiration cutoff at connector arrival. Execution blocked.',
        },
        timestamp: now,
      };
      this.relay.recordAck(expiredAck);
      return expiredAck;
    }

    // Acknowledge receipt
    const receivedAck: RemoteCommandAck = {
      requestId: cmd.requestId,
      deviceId: this.config.deviceId,
      status: 'RECEIVED',
      timestamp: now,
    };

    // Execute via local bridge dispatcher if provided
    if (executor) {
      try {
        const result = await executor(cmd);
        if (result.success) {
          const brokerAck: RemoteCommandAck = {
            requestId: cmd.requestId,
            deviceId: this.config.deviceId,
            status: 'BROKER_ACK',
            ticket: result.ticket,
            deal: result.deal,
            fillPrice: result.fillPrice,
            slippagePrice: result.slippagePrice,
            retcode: result.retcode || 10009,
            retcodeDescription: result.retcodeDescription || 'TRADE_RETCODE_DONE',
            timestamp: Date.now(),
          };
          this.relay.recordAck(brokerAck);
          return brokerAck;
        } else {
          const rejectedAck: RemoteCommandAck = {
            requestId: cmd.requestId,
            deviceId: this.config.deviceId,
            status: 'REJECTED',
            error: result.error || {
              code: 'LOCAL_DISPATCH_FAILED',
              message: 'Local MT5 bridge rejected execution.',
            },
            timestamp: Date.now(),
          };
          this.relay.recordAck(rejectedAck);
          return rejectedAck;
        }
      } catch (err: any) {
        const errAck: RemoteCommandAck = {
          requestId: cmd.requestId,
          deviceId: this.config.deviceId,
          status: 'REJECTED',
          error: {
            code: 'CONNECTOR_EXCEPTION',
            message: err.message || 'Unknown error executing command at connector.',
          },
          timestamp: Date.now(),
        };
        this.relay.recordAck(errAck);
        return errAck;
      }
    }

    return receivedAck;
  }
}
