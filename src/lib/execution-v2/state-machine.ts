/**
 * FEF CORTEX — EXECUTION BRIDGE V2 STATE MACHINE
 * Master Consolidation V2: Immutable Order Lifecycle State Machine
 */

import {
  ExecutionLifecycleState,
  ExecutionCommand,
  ExecutionRecord,
  LifecycleTransitionRecord,
} from './types';

export const TERMINAL_STATES: ReadonlySet<ExecutionLifecycleState> = new Set<ExecutionLifecycleState>([
  'FILLED',
  'REJECTED',
  'EXPIRED',
]);

const ALLOWED_TRANSITIONS: Record<ExecutionLifecycleState, ReadonlySet<ExecutionLifecycleState>> = {
  CREATED: new Set<ExecutionLifecycleState>(['VALIDATED', 'REJECTED']),
  VALIDATED: new Set<ExecutionLifecycleState>(['QUEUED', 'REJECTED']),
  QUEUED: new Set<ExecutionLifecycleState>(['DELIVERED_TO_EA', 'EXPIRED', 'REJECTED']),
  DELIVERED_TO_EA: new Set<ExecutionLifecycleState>(['ACKNOWLEDGED', 'EXPIRED', 'REJECTED']),
  ACKNOWLEDGED: new Set<ExecutionLifecycleState>(['SUBMITTED_TO_BROKER', 'REJECTED', 'EXPIRED']),
  SUBMITTED_TO_BROKER: new Set<ExecutionLifecycleState>(['FILLED', 'REJECTED', 'EXPIRED']),
  FILLED: new Set<ExecutionLifecycleState>(),
  REJECTED: new Set<ExecutionLifecycleState>(),
  EXPIRED: new Set<ExecutionLifecycleState>(),
};

export class ExecutionStateMachine {
  private readonly record: ExecutionRecord;

  constructor(command: ExecutionCommand) {
    if (!command || !command.executionId) {
      throw new Error('Cannot initialize ExecutionStateMachine without valid command and executionId');
    }
    this.record = {
      command: { ...command },
      currentState: 'CREATED',
      transitions: [
        {
          fromState: 'CREATED',
          toState: 'CREATED',
          timestamp: command.createdAt || Date.now(),
          reason: 'Initial creation',
        },
      ],
    };
  }

  public get currentState(): ExecutionLifecycleState {
    return this.record.currentState;
  }

  public get executionId(): string {
    return this.record.command.executionId;
  }

  public get isTerminal(): boolean {
    return TERMINAL_STATES.has(this.record.currentState);
  }

  public get snapshot(): Readonly<ExecutionRecord> {
    return JSON.parse(JSON.stringify(this.record));
  }

  public transition(
    toState: ExecutionLifecycleState,
    reason?: string,
    metadata?: Record<string, any>
  ): void {
    const fromState = this.record.currentState;

    if (this.isTerminal) {
      throw new Error(
        `Invalid state transition: Cannot transition from terminal state ${fromState} to ${toState} for execution ${this.executionId}`
      );
    }

    const allowed = ALLOWED_TRANSITIONS[fromState];
    if (!allowed || !allowed.has(toState)) {
      throw new Error(
        `Illegal state transition: ${fromState} -> ${toState} is not allowed for execution ${this.executionId}`
      );
    }

    const now = Date.now();
    const transitionRecord: LifecycleTransitionRecord = {
      fromState,
      toState,
      timestamp: now,
      reason,
      metadata,
    };

    this.record.currentState = toState;
    this.record.transitions.push(transitionRecord);

    if (toState === 'REJECTED') {
      this.record.failureReasonCode = reason || 'REJECTED_UNKNOWN';
    } else if (toState === 'EXPIRED') {
      this.record.failureReasonCode = reason || 'EXPIRED_TIMEOUT';
    }
  }

  public setAck(ack: { executionId: string; terminalId?: string; receivedAt: number }): void {
    this.record.ack = { ...ack };
  }

  public setResult(result: {
    executionId: string;
    status: 'FILLED' | 'REJECTED' | 'EXPIRED';
    ticket?: number;
    fillPrice?: number;
    filledVolume?: number;
    retcode?: number;
    comment?: string;
    executedAt: number;
    failureReasonCode?: string;
  }): void {
    this.record.result = { ...result };
    if (result.status === 'FILLED' && this.record.currentState !== 'FILLED') {
      this.transition('FILLED', result.comment || 'Filled by MT5 EA', { ticket: result.ticket, fillPrice: result.fillPrice });
    } else if (result.status === 'REJECTED' && this.record.currentState !== 'REJECTED') {
      this.transition('REJECTED', result.failureReasonCode || result.comment || 'Rejected by MT5 EA', { retcode: result.retcode });
    } else if (result.status === 'EXPIRED' && this.record.currentState !== 'EXPIRED') {
      this.transition('EXPIRED', result.comment || 'Expired on MT5 terminal');
    }
  }
}
