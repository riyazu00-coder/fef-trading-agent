/**
 * Client-Side Chart Analysis Service
 * Combines HTTP API calls with Client Storage.
 */

import {
  ChartAnalysisRequest,
  ChartAnalysisResponse,
  ChartAnalysisHistoryItem
} from '../chart-analysis/types';
import { ChartAnalysisStorage } from '../chart-analysis/storage';

export * from '../chart-analysis/types';

class ChartAnalysisServiceImpl {
  public subscribe(listener: (analysis: ChartAnalysisResponse | null) => void): () => void {
    return ChartAnalysisStorage.subscribe(listener);
  }

  public getActiveAnalysis(): ChartAnalysisResponse | null {
    return ChartAnalysisStorage.getActive();
  }

  public setActiveAnalysis(analysis: ChartAnalysisResponse | null): void {
    ChartAnalysisStorage.setActive(analysis);
  }

  public getHistory(): ChartAnalysisHistoryItem[] {
    return ChartAnalysisStorage.getHistory();
  }

  public async analyze(req: ChartAnalysisRequest): Promise<ChartAnalysisResponse> {
    const res = await fetch('/api/analyze-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Chart analysis failed');
    }

    const result: ChartAnalysisResponse = {
      ...data.analysis,
      imageThumbnail: req.image.length < 500000 ? req.image : undefined
    };

    this.setActiveAnalysis(result);
    return result;
  }
}

export const ChartAnalysisService = new ChartAnalysisServiceImpl();
