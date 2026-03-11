import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getFlightData } from '@/services/flightService';

export const runtime = 'edge';

const FlightSchema = z.object({
  flightCode: z.string().min(1),
  date: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  const validation = FlightSchema.safeParse({
    flightCode: searchParams.get('flightCode'),
    date: searchParams.get('date'),
  });

  if (!validation.success) {
    return NextResponse.json({ error: 'Invalid parameters', details: validation.error }, { status: 400 });
  }

  const { flightCode, date } = validation.data;

  try {
    const { flightData, dataSource } = await getFlightData(flightCode);

    let aircraft = 'OTHER';
    const icaoCode = (flightData.aircraft_icao || '').toUpperCase();
    const iataCode = (flightData.aircraft_iata || '').toUpperCase();
    
    const isA319 = icaoCode.includes('A319') || icaoCode === 'A19' || iataCode === '319';
    const isA320 = icaoCode.includes('A320') || icaoCode === 'A20N' || icaoCode === 'A20' || iataCode === '320' || iataCode === '32A' || iataCode === '32N';
    const isA321 = icaoCode.includes('A321') || icaoCode === 'A21N' || icaoCode === 'A21' || iataCode === '321' || iataCode === '32B' || iataCode === '32Q';

    if (isA319) aircraft = 'A319';
    else if (isA320) aircraft = 'A320';
    else if (isA321) aircraft = 'A321';

    const result = {
      aircraft: aircraft,
      origin: flightData.dep_iata || '',
      destination: flightData.arr_iata || '',
      date: flightData.dep_time ? flightData.dep_time.split(' ')[0] : (flightData.dep_actual ? flightData.dep_actual.split(' ')[0] : date),
      clsInfo: getClsInfo(aircraft),
      reasoning: `Dados obtidos via AirLabs (${dataSource}). ICAO: ${icaoCode || 'N/A'}, IATA: ${iataCode || 'N/A'}. Voo ${flightData.flight_iata || flightCode} de ${flightData.dep_iata} para ${flightData.arr_iata}.`
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Flight API error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}

function getClsInfo(aircraft: string) {
  switch (aircraft) {
    case 'A319':
      return "A319: Hold: 156x153x114 cm. Sem Bulk. Porta: 181x124 cm.";
    case 'A320':
      return "A320: Aeronave equipada com CLS. Hold: 156x153x114 cm. Bulk: 250x120x110 cm. Porta: 181x124 cm.";
    case 'A321':
      return "A321: Aeronave equipada com CLS. Hold: 156x153x114 cm. Bulk: 300x120x110 cm. Porta: 181x124 cm.";
    default:
      return "Dimensões padrão de narrowbody LATAM aplicáveis.";
  }
}
