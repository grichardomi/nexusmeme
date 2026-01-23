import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { analyzeMarket } from '@/services/ai/analyzer';
import { AIAnalysisRequest } from '@/types/ai';
import { z } from 'zod';

/**
 * AI Market Analysis API
 * POST /api/ai/analyze - Perform AI-powered market analysis
 */

const analysisRequestSchema = z.object({
  pair: z.string().regex(/^[A-Z]+\/[A-Z]+$/),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']),
  includeRegime: z.boolean().optional(),
  includePrediction: z.boolean().optional(),
  includeSentiment: z.boolean().optional(),
  includeSignal: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const request = analysisRequestSchema.parse(body) as AIAnalysisRequest;

    // Perform analysis
    const result = await analyzeMarket(request);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to perform analysis' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/analyze - Get available analysis options
 */
export async function GET() {
  return NextResponse.json({
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d'],
    analysisTypes: {
      regime: 'Market regime detection (bullish/bearish/sideways)',
      prediction: 'Price prediction for multiple timeframes',
      sentiment: 'Market sentiment analysis',
      signal: 'AI-generated trade signals with entry/exit levels',
    },
    example: {
      pair: 'BTC/USD',
      timeframe: '1h',
      includeRegime: true,
      includePrediction: true,
      includeSentiment: true,
      includeSignal: true,
    },
  });
}
