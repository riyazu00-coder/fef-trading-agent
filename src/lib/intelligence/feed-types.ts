/**
 * FEF CORTEX — LIVE INTELLIGENCE FEEDS CONTRACT
 * 
 * Defines the hydrated intelligence feed payload passed from the server
 * to client-side agent decision pipelines.
 */

import {
  NormalizedNewsItem,
  MacroIndicatorRecord,
  NormalizedCalendarEvent,
  GeopoliticalEventRecord,
  SentimentRecord,
} from '@/lib/providers/types';

export interface LiveIntelligenceFeeds {
  timestamp: string;
  news: NormalizedNewsItem[];
  macro: MacroIndicatorRecord[];
  events: NormalizedCalendarEvent[];
  alerts: GeopoliticalEventRecord[];
  sentiment: Record<string, SentimentRecord | null>;
}
