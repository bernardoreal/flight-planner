import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let flightCode = searchParams.get('flightCode');
  const date = searchParams.get('date');

  if (!flightCode) {
    return NextResponse.json({ error: 'Flight code is required' }, { status: 400 });
  }

  flightCode = flightCode.replace(/\s+/g, '').toUpperCase();
  const iataRegex = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
  
  if (!iataRegex.test(flightCode)) {
    return NextResponse.json({ 
      error: 'Formato IATA inválido. Use o padrão de 2 letras/números da cia + número do voo (ex: LA3465, JJ8070).' 
    }, { status: 400 });
  }

  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AirLabs API key not configured' }, { status: 500 });
  }

  try {
    let flightData = null;
    let dataSource = '';

    // Helper to fetch with error handling
    const safeFetch = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return await response.json();
      } catch (e) {
        console.error(`Fetch error for ${url}:`, e);
        return null;
      }
    };

    // 1. Try the specific 'flight' endpoint
    const infoData = await safeFetch(`https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(flightCode)}&api_key=${apiKey}`);
    if (infoData && infoData.response && !infoData.error) {
      flightData = infoData.response;
      dataSource = 'Flight Info';
    }

    // 2. Try Live Flights if not found
    if (!flightData || !flightData.aircraft_icao) {
      const liveData = await safeFetch(`https://airlabs.co/api/v9/flights?flight_iata=${encodeURIComponent(flightCode)}&api_key=${apiKey}`);
      if (liveData && liveData.response && liveData.response.length > 0) {
        flightData = liveData.response[0];
        dataSource = dataSource ? `${dataSource} + Live` : 'Live Flights';
      }
    }

    // 3. Fallback to Schedules if still missing
    if (!flightData || !flightData.aircraft_icao) {
      const schedData = await safeFetch(`https://airlabs.co/api/v9/schedules?flight_iata=${encodeURIComponent(flightCode)}&api_key=${apiKey}`);
      if (schedData && schedData.response && schedData.response.length > 0) {
        const withAircraft = schedData.response.find((s: { aircraft_icao?: string }) => s.aircraft_icao);
        flightData = withAircraft || schedData.response[0];
        dataSource = dataSource ? `${dataSource} + Schedules` : 'Schedules';
      }
    }

    if (!flightData) {
      return NextResponse.json({ error: 'Voo não encontrado nos registros atuais ou programados.' }, { status: 404 });
    }

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
    console.error('AirLabs API error:', error);
    return NextResponse.json({ error: `Failed to fetch flight data: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
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
