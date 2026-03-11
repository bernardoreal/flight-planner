import { config } from '@/lib/config';

export async function getFlightData(flightCode: string) {
  const apiKey = config.validate();
  const sanitizedFlightCode = flightCode.replace(/\s+/g, '').toUpperCase();
  
  console.log('Starting flight data fetch for:', sanitizedFlightCode);

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

  let flightData = null;
  let dataSource = '';

  // 1. Try the specific 'flight' endpoint
  const infoData = await safeFetch(`https://airlabs.co/api/v9/flight?flight_iata=${encodeURIComponent(sanitizedFlightCode)}&api_key=${apiKey}`);
  if (infoData && infoData.response && !infoData.error) {
    flightData = infoData.response;
    dataSource = 'Flight Info';
  }

  // 2. Try Live Flights if not found
  if (!flightData || !flightData.aircraft_icao) {
    const liveData = await safeFetch(`https://airlabs.co/api/v9/flights?flight_iata=${encodeURIComponent(sanitizedFlightCode)}&api_key=${apiKey}`);
    if (liveData && liveData.response && liveData.response.length > 0) {
      flightData = liveData.response[0];
      dataSource = dataSource ? `${dataSource} + Live` : 'Live Flights';
    }
  }

  // 3. Fallback to Schedules if still missing
  if (!flightData || !flightData.aircraft_icao) {
    const schedData = await safeFetch(`https://airlabs.co/api/v9/schedules?flight_iata=${encodeURIComponent(sanitizedFlightCode)}&api_key=${apiKey}`);
    if (schedData && schedData.response && schedData.response.length > 0) {
      const withAircraft = schedData.response.find((s: { aircraft_icao?: string }) => s.aircraft_icao);
      flightData = withAircraft || schedData.response[0];
      dataSource = dataSource ? `${dataSource} + Schedules` : 'Schedules';
    }
  }

  if (!flightData) {
    throw new Error('Voo não encontrado nos registros atuais ou programados.');
  }

  return { flightData, dataSource };
}
