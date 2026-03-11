import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getFlightData } from '@/services/flightService';

export const runtime = 'edge';

const FlightSchema = z.object({
  flightCode: z.string().min(1),
  date: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const validation = FlightSchema.safeParse({
      flightCode: searchParams.get('flightCode'),
      date: searchParams.get('date'),
    });

    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid parameters', details: validation.error }), { status: 400 });
    }

    const { flightCode } = validation.data;
    const { flightData } = await getFlightData(flightCode);

    return new Response(JSON.stringify(flightData), { status: 200 });
  } catch (error) {
    console.error('CRITICAL ERROR:', error);
    // Force return of the error string to see it in the browser
    return new Response(`CRITICAL ERROR: ${error instanceof Error ? error.stack : String(error)}`, { status: 500 });
  }
}
