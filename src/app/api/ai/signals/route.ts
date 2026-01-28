import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { analyzeMarket } from '@/services/ai/analyzer';
import { z } from 'zod';

/**
 * AI Trade Signals API
 * GET /api/ai/signals - Get trade signals for pairs
 */

const querySchema = z.object({
  pairs: z.string().optional(), // Comma-separated pairs
  timeframe: z.enum(['1m', '5m', '15m', '1h', '4h', '1d']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = querySchema.parse({
      pairs: searchParams.get('pairs'),
      timeframe: searchParams.get('timeframe'),
    });

    const pairs = (query.pairs || 'BTC/USD,ETH/USD').split(',');
    const timeframe = (query.timeframe || '1h') as '1h' | '4h' | '1d';

    const signals = await Promise.all(
      pairs.map(async (pair) => {
        try {
          const analysis = await analyzeMarket({
            pair: pair.trim(),
            timeframe,
            includeSignal: true,
            includeRegime: true,
          });

          return {
            pair: pair.trim(),
            signal: analysis.signal,
            regime: analysis.regime,
            confidence: analysis.confidence,
          };
        } catch (error) {
          console.error(`Error analyzing ${pair}:`, error);
          return {
            pair: pair.trim(),
            error: 'Failed to analyze',
          };
        }
      })
    );

    return NextResponse.json({
      timeframe,
      signals,
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    console.error('Signal API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/signals - Get signal for specific setup
 */
interface SignalRequest {
  pair: string;
  timeframe: string;
  includeRegime?: boolean;
  includePrediction?: boolean;
  includeSentiment?: boolean;
  includeSignal?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as SignalRequest;

    // COST OPTIMIZATION: Default expensive calls to FALSE (opt-in only)
    // Prediction and Sentiment each make separate OpenAI calls
    const analysis = await analyzeMarket({
      pair: body.pair,
      timeframe: body.timeframe as '1m' | '5m' | '15m' | '1h' | '4h' | '1d',
      includeRegime: body.includeRegime !== false,
      includePrediction: body.includePrediction === true, // Opt-in (was defaulting to true)
      includeSentiment: body.includeSentiment === true,   // Opt-in (was defaulting to true)
      includeSignal: body.includeSignal !== false,
    });

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Signal generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate signal' },
      { status: 500 }
    );
  }
}
