/**
 * FEF TRADING SOLUTIONS — SECURE REMOTE RELAY CONTROL PLANE
 * 
 * Manages registered devices, telemetry ingestion, command queuing,
 * idempotency, replay protection, and disconnect/reconnect safety.
 */

import {
  RegisteredDevice,
  DeviceAuthCredentials,
  RemoteTelemetrySnapshot,
  RemoteExecutionCommand,
  RemoteCommandAck,
} from './remote-types';
import {
  validateDeviceAuth,
  validateRemoteExecutionCommand,
  hashAuthToken,
  MAX_CONNECTOR_HEARTBEAT_AGE_MS,
} from './remote-security-validator';
import { isMt5OrderTransportAllowed, READ_ONLY_EXECUTION_ERROR } from '../execution/execution-policy';

export class RemoteRelayManager {
  private devices = new Map<string, RegisteredDevice>();
  private telemetryByDevice = new Map<string, RemoteTelemetrySnapshot>();
  private activeCommands = new Map<string, RemoteExecutionCommand>(); // Keyed by requestId
  private commandQueueByDevice = new Map<string, string[]>();        // deviceId -> requestId[]
  private processedRequestIds = new Set<string>();                   // Idempotency history
  private commandAcks = new Map<string, RemoteCommandAck>();         // requestId -> Ack
  private deviceNonces = new Map<string, number>();                  // deviceId -> last valid nonce
  private allowOrderTransportForTesting: boolean;

  constructor(options?: { allowOrderTransportForTesting?: boolean }) {
    this.allowOrderTransportForTesting = options?.allowOrderTransportForTesting ?? false;
  }

  /**
   * Register a new connector device
   */
  public registerDevice(params: {
    deviceId: string;
    deviceName: string;
    connectorVersion: string;
    authToken: string;
    keyId: string;
    broker: string;
    server: string;
    maskedAccount: string;
    tradeMode: 'DEMO' | 'REAL';
    operatingMode: 'READ_ONLY' | 'DEMO_EXECUTION';
  }): RegisteredDevice {
    const publicDeviceId = `dev_${params.deviceId.substring(0, 8)}`;
    const now = Date.now();

    const device: RegisteredDevice = {
      deviceId: params.deviceId,
      publicDeviceId,
      deviceName: params.deviceName,
      connectorVersion: params.connectorVersion,
      keyId: params.keyId,
      authTokenHash: hashAuthToken(params.authToken),
      createdAt: now,
      lastSeen: now,
      connectionState: 'ONLINE',
      broker: params.broker,
      server: params.server,
      maskedAccount: params.maskedAccount,
      tradeMode: params.tradeMode,
      operatingMode: params.operatingMode,
    };

    this.devices.set(params.deviceId, device);
    this.commandQueueByDevice.set(params.deviceId, []);
    this.deviceNonces.set(params.deviceId, 0);

    return device;
  }

  /**
   * Rotate Device Token Key
   */
  public rotateDeviceKey(deviceId: string, newKeyId: string, newAuthToken: string): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    device.keyId = newKeyId;
    device.authTokenHash = hashAuthToken(newAuthToken);
    return true;
  }

  /**
   * Authenticate Connector Device
   */
  public authenticate(credentials: DeviceAuthCredentials): { success: boolean; error?: string } {
    const device = this.devices.get(credentials.deviceId) || null;
    const res = validateDeviceAuth(credentials, device);
    if (!res.valid) {
      return { success: false, error: res.error?.message };
    }
    if (device) {
      device.lastSeen = Date.now();
      device.connectionState = 'ONLINE';
    }
    return { success: true };
  }

  /**
   * Ingest Telemetry Push from Outbound Connector
   */
  public ingestTelemetry(deviceId: string, snapshot: RemoteTelemetrySnapshot): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    device.lastSeen = Date.now();
    device.connectionState = 'ONLINE';
    device.broker = snapshot.broker;
    device.server = snapshot.server;
    device.maskedAccount = snapshot.maskedAccount;
    device.tradeMode = snapshot.tradeMode;
    device.operatingMode = snapshot.operatingMode;

    this.telemetryByDevice.set(deviceId, snapshot);
    return true;
  }

  /**
   * Queue Remote Execution Command with Idempotency and Pre-Flight Validation
   */
  public queueCommand(command: RemoteExecutionCommand): {
    success: boolean;
    error?: { code: string; message: string };
  } {
    if (!this.allowOrderTransportForTesting && !isMt5OrderTransportAllowed()) {
      return { success: false, error: { ...READ_ONLY_EXECUTION_ERROR } };
    }

    const now = Date.now();

    // 1. Idempotency Check: Reject duplicate request IDs
    if (this.processedRequestIds.has(command.requestId) || this.activeCommands.has(command.requestId)) {
      return {
        success: false,
        error: {
          code: 'DUPLICATE_COMMAND_ID',
          message: `Execution request ID '${command.requestId}' has already been processed or is active. Replays are prohibited.`,
        },
      };
    }

    // 2. Monotonic Nonce Check
    const lastNonce = this.deviceNonces.get(command.deviceId) || 0;
    if (command.nonce <= lastNonce) {
      return {
        success: false,
        error: {
          code: 'STALE_NONCE',
          message: `Command nonce ${command.nonce} is not greater than last observed nonce ${lastNonce}. Replay attack prevented.`,
        },
      };
    }

    // 3. Security Validation
    const device = this.devices.get(command.deviceId) || null;
    const telemetry = this.telemetryByDevice.get(command.deviceId) || null;
    const validation = validateRemoteExecutionCommand(command, telemetry, device, now);

    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // 4. Update Nonce & Queue
    this.deviceNonces.set(command.deviceId, command.nonce);
    this.activeCommands.set(command.requestId, command);

    const queue = this.commandQueueByDevice.get(command.deviceId) || [];
    queue.push(command.requestId);
    this.commandQueueByDevice.set(command.deviceId, queue);

    return { success: true };
  }

  /**
   * Fetch Next Unexpired Command for Outbound Connector Poll
   * Automatically drops and marks any expired queued commands as EXPIRED.
   */
  public popNextCommand(deviceId: string, now: number = Date.now()): RemoteExecutionCommand | null {
    const queue = this.commandQueueByDevice.get(deviceId);
    if (!queue || queue.length === 0) return null;

    while (queue.length > 0) {
      const reqId = queue.shift()!;
      const cmd = this.activeCommands.get(reqId);
      if (!cmd) continue;

      if (cmd.expiresAt <= now) {
        // Expired while queued: Mark as EXPIRED and do NOT dispatch
        this.activeCommands.delete(reqId);
        this.processedRequestIds.add(reqId);
        this.commandAcks.set(reqId, {
          requestId: reqId,
          deviceId,
          status: 'EXPIRED',
          error: {
            code: 'COMMAND_EXPIRED_IN_QUEUE',
            message: 'Command reached expiration cutoff while awaiting connector dispatch.',
          },
          timestamp: now,
        });
        continue;
      }

      return cmd;
    }

    return null;
  }

  /**
   * Ingest Command Acknowledgment from Connector
   */
  public recordAck(ack: RemoteCommandAck): void {
    this.commandAcks.set(ack.requestId, ack);
    this.processedRequestIds.add(ack.requestId);
    this.activeCommands.delete(ack.requestId);
  }

  /**
   * Get Command Ack Status
   */
  public getAck(requestId: string): RemoteCommandAck | null {
    return this.commandAcks.get(requestId) || null;
  }

  /**
   * Handle Connector Disconnect Event
   * Immediately marks device OFFLINE and PURGES all pending un-dispatched commands.
   */
  public handleDisconnect(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connectionState = 'OFFLINE';
    }

    // Purge queued commands to prevent stale execution upon reconnect
    const queue = this.commandQueueByDevice.get(deviceId) || [];
    for (const reqId of queue) {
      this.activeCommands.delete(reqId);
      this.processedRequestIds.add(reqId);
      this.commandAcks.set(reqId, {
        requestId: reqId,
        deviceId,
        status: 'EXPIRED',
        error: {
          code: 'CONNECTOR_DISCONNECTED_PURGE',
          message: 'Command purged due to connector disconnection.',
        },
        timestamp: Date.now(),
      });
    }
    this.commandQueueByDevice.set(deviceId, []);
  }

  /**
   * Handle Connector Reconnection Event
   * Ensures zero backlog stale commands are replayed.
   */
  public handleReconnect(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connectionState = 'ONLINE';
      device.lastSeen = Date.now();
    }
    // Clean queue invariant: Queue is guaranteed empty
    this.commandQueueByDevice.set(deviceId, []);
  }

  /**
   * Production Environment Status View
   * Disconnected/stale connectors strictly fall closed to REFERENCE pricing.
   */
  public getProductionStatus(deviceId: string, now: number = Date.now()): {
    connected: boolean;
    statusLabel: string;
    broker: string;
    server: string;
    maskedAccount: string;
    tradeMode: string;
    operatingMode: string;
    heartbeatAgeMs: number | null;
    priceAuthority: 'MT5_BROKER' | 'REFERENCE';
    isExecutable: boolean;
    activePositionsCount: number;
    quoteCount: number;
  } {
    const device = this.devices.get(deviceId);
    const telemetry = this.telemetryByDevice.get(deviceId);

    if (!device || device.connectionState !== 'ONLINE' || !telemetry) {
      return {
        connected: false,
        statusLabel: 'REMOTE MT5 OFFLINE • REFERENCE FEED ONLY',
        broker: device?.broker || 'UNKNOWN',
        server: device?.server || 'UNKNOWN',
        maskedAccount: device?.maskedAccount || 'UNKNOWN',
        tradeMode: device?.tradeMode || 'DEMO',
        operatingMode: 'READ_ONLY',
        heartbeatAgeMs: null,
        priceAuthority: 'REFERENCE',
        isExecutable: false,
        activePositionsCount: 0,
        quoteCount: 0,
      };
    }

    const connectorHeartbeatAge = now - device.lastSeen;
    const terminalHeartbeatAge = Number.isFinite(telemetry.heartbeatAgeMs)
      ? telemetry.heartbeatAgeMs
      : Number.POSITIVE_INFINITY;

    const isConnectorFresh =
      connectorHeartbeatAge >= 0 &&
      connectorHeartbeatAge < MAX_CONNECTOR_HEARTBEAT_AGE_MS;

    const isTerminalFresh =
      telemetry.bridgeConnected &&
      telemetry.terminalConnected &&
      terminalHeartbeatAge >= 0 &&
      terminalHeartbeatAge < MAX_CONNECTOR_HEARTBEAT_AGE_MS &&
      !telemetry.isStale;

    const isFresh = isConnectorFresh && isTerminalFresh;

    if (!isFresh) {
      return {
        connected: false,
        statusLabel: 'REMOTE MT5 STALE • EXECUTION LOCKED',
        broker: device.broker,
        server: device.server,
        maskedAccount: device.maskedAccount,
        tradeMode: device.tradeMode,
        operatingMode: 'READ_ONLY',
        heartbeatAgeMs: Number.isFinite(terminalHeartbeatAge) ? terminalHeartbeatAge : null,
        priceAuthority: 'REFERENCE',
        isExecutable: false,
        activePositionsCount: telemetry.positions.length,
        quoteCount: Object.keys(telemetry.quotes).length,
      };
    }

    const isExecutable =
      device.tradeMode === 'DEMO' &&
      device.operatingMode === 'DEMO_EXECUTION' &&
      telemetry.terminalConnected;

    return {
      connected: true,
      statusLabel: 'REMOTE MT5 CONNECTED',
      broker: device.broker,
      server: device.server,
      maskedAccount: device.maskedAccount,
      tradeMode: device.tradeMode,
      operatingMode: device.operatingMode,
      heartbeatAgeMs: terminalHeartbeatAge,
      priceAuthority: 'MT5_BROKER',
      isExecutable,
      activePositionsCount: telemetry.positions.length,
      quoteCount: Object.keys(telemetry.quotes).length,
    };
  }
}
