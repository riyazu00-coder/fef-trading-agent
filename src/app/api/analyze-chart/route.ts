import { NextRequest, NextResponse } from 'next/server';
import { processChartAnalysis } from '@/lib/chart-analysis/engine';
import { ChartAnalysisRequest } from '@/lib/chart-analysis/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: ChartAnalysisRequest = await req.json();
    const analysis = await processChartAnalysis(body);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    const message = error?.message || 'Unexpected error occurred during chart vision processing';
    const isValidationError = message.includes('NO VALID TRADING CHART DETECTED');
    const isSimulationError = message.includes('ANALYSIS FAILED: Vision provider service temporarily unavailable');
    const statusCode = isSimulationError ? 503 : isValidationError ? 422 : 400;

    return NextResponse.json(
      {
        success: false,
        error: message
      },
      { status: statusCode }
    );
  }
}
