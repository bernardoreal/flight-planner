import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const flightCode = searchParams.get('flightCode');
    const date = searchParams.get('date');
    const apiKey = process.env.AIRLABS_API_KEY;

    if (!flightCode) {
      return new Response(JSON.stringify({ error: 'Flight code is required' }), { status: 400 });
    }

    if (!apiKey) {
      console.error('AIRLABS_API_KEY is missing in environment');
      return new Response(JSON.stringify({ error: 'Server configuration error: API Key missing' }), { status: 500 });
    }

    const sanitizedFlightCode = flightCode.replace(/\s+/g, '').toUpperCase();
    const flightNumbers = sanitizedFlightCode.match(/\d+/)?.[0] || '';
    
    // Create a list of codes to try
    const codesToTry = [sanitizedFlightCode];
    if (/^\d+$/.test(sanitizedFlightCode)) {
      codesToTry.push('LA' + sanitizedFlightCode);
      codesToTry.push('JJ' + sanitizedFlightCode);
    } else if (sanitizedFlightCode.startsWith('LA') || sanitizedFlightCode.startsWith('JJ')) {
      // If it starts with LA, also try JJ and vice versa
      const otherPrefix = sanitizedFlightCode.startsWith('LA') ? 'JJ' : 'LA';
      codesToTry.push(otherPrefix + flightNumbers);
    }

    console.log(`Searching AirLabs for codes: ${codesToTry.join(', ')}`);
    
    interface AirLabsFlight {
      aircraft_icao?: string;
      dep_iata?: string;
      departure_iata?: string;
      arr_iata?: string;
      arrival_iata?: string;
      flight_date?: string;
    }

    for (const code of codesToTry) {
      const prefix = code.substring(0, 2);
      const number = code.substring(2);
      
      // Attempt multiple AirLabs endpoints for each code
      const endpoints = [
        `https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(code)}&api_key=${apiKey}`,
        `https://airlabs.co/api/v9/schedules?flight_iata=${encodeURIComponent(code)}&api_key=${apiKey}`,
        `https://airlabs.co/api/v9/flights?flight_iata=${encodeURIComponent(code)}&api_key=${apiKey}`
      ];

      // If we have a clear prefix and number, try the specific parameters too
      if (prefix.length === 2 && /^\d+$/.test(number)) {
        endpoints.push(`https://airlabs.co/api/v9/schedules?airline_iata=${prefix}&flight_number=${number}&api_key=${apiKey}`);
        endpoints.push(`https://airlabs.co/api/v9/flights?airline_iata=${prefix}&flight_number=${number}&api_key=${apiKey}`);
      }

      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          
          if (data.error) {
            console.warn(`AirLabs API error from ${url}:`, data.error.message);
            // If it's an API key error, return it immediately to inform the user
            if (data.error.code === 'api_key_invalid' || data.error.code === 'not_found') {
               // We don't return 404 immediately because other endpoints might work
               if (data.error.code === 'api_key_invalid') {
                 return new Response(JSON.stringify({ error: `AirLabs API Key Error: ${data.error.message}` }), { status: 401 });
               }
            }
            continue;
          }

          if (!data.response) continue;

          let result: AirLabsFlight | null = null;
          if (url.includes('/flight?') && !Array.isArray(data.response)) {
            result = data.response;
          } else if (Array.isArray(data.response) && data.response.length > 0) {
            // For /flights or /schedules, find the best match (one with aircraft info)
            result = data.response.find((f: AirLabsFlight) => f.aircraft_icao) || data.response[0];
          }

          if (result && (result.aircraft_icao || result.dep_iata)) {
            console.log(`Found data for ${code} via ${url}`);
            return new Response(JSON.stringify({
              aircraft: result.aircraft_icao || 'OTHER',
              origin: result.dep_iata || result.departure_iata,
              destination: result.arr_iata || result.arrival_iata,
              date: date || result.flight_date,
              source: 'AirLabs'
            }), { status: 200 });
          }
        } catch (e) {
          console.error(`Error fetching ${code} from ${url}:`, e);
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Flight not found in AirLabs' }), { status: 404 });
  } catch (error) {
    console.error('API Route Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
}
