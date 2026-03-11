import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  console.log('GET request started');
  
  try {
    const apiKey = process.env.AIRLABS_API_KEY;
    
    // Return a plain text response to avoid NextResponse.json issues
    return new Response(
      `API Key check: ${apiKey ? 'Present' : 'Missing'} - Length: ${apiKey?.length || 0}`, 
      { status: 200 }
    );
  } catch (error) {
    return new Response(`Error: ${String(error)}`, { status: 500 });
  }
}
