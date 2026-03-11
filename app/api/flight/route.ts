import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  console.log('GET request received');
  
  // Debugging: Log available env keys (excluding sensitive ones)
  const envKeys = Object.keys(process.env);
  console.log('Available env keys:', envKeys.filter(k => !k.includes('KEY') && !k.includes('SECRET')));
  console.log('Is AIRLABS_API_KEY present?', !!process.env.AIRLABS_API_KEY);

  const apiKey = process.env.AIRLABS_API_KEY;
  if (!apiKey) {
    return new NextResponse('API Key not found in process.env', { status: 500 });
  }

  return new NextResponse('API Key found', { status: 200 });
}
