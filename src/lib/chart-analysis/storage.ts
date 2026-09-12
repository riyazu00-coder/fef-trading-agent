/**
 * Client-Side Chart Analysis Storage
 * Handles localStorage, sessionStorage, history queue, and event subscription.
 */

import { ChartAnalysisResponse, ChartAnalysisHistoryItem } from './types';

const STORAGE_KEY_ACTIVE = 'fef_active_chart_analysis';
const STORAGE_KEY_HISTORY = 'fef_chart_analysis_history';

export class ChartAnalysisStorage {
  private static listeners: Set<(analysis: ChartAnalysisResponse | null) => void> = new Set();

  public static subscribe(listener: (analysis: ChartAnalysisResponse | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notify(data: ChartAnalysisResponse | null) {
    this.listeners.forEach((l) => l(data));
  }

  public static getActive(): ChartAnalysisResponse | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_ACTIVE) || localStorage.getItem(STORAGE_KEY_ACTIVE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public static setActive(analysis: ChartAnalysisResponse | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (analysis) {
        const serialized = JSON.stringify(analysis);
        sessionStorage.setItem(STORAGE_KEY_ACTIVE, serialized);
        localStorage.setItem(STORAGE_KEY_ACTIVE, serialized);
        this.addHistory(analysis);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_ACTIVE);
        localStorage.removeItem(STORAGE_KEY_ACTIVE);
      }
    } catch (err) {
      console.warn('Storage persistence warning:', err);
    }
    this.notify(analysis);
  }

  public static getHistory(): ChartAnalysisHistoryItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public static addHistory(analysis: ChartAnalysisResponse): void {
    if (typeof window === 'undefined') return;
    try {
      const history = this.getHistory();
      const item: ChartAnalysisHistoryItem = {
        id: analysis.id,
        timestamp: analysis.timestamp,
        symbol: analysis.symbol,
        timeframe: analysis.timeframe,
        setupState: analysis.setup.state,
        confidence: analysis.setup.confidence,
        thumbnail: analysis.imageThumbnail
      };
      const deduped = [item, ...history.filter((h) => h.id !== analysis.id)].slice(0, 10);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(deduped));
    } catch (err) {
      console.warn('Failed to append analysis history:', err);
    }
  }
}
