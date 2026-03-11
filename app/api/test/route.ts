export const runtime = 'edge';

export async function GET() {
  const apiKey = process.env.AIRLABS_API_KEY;
  return new Response(`Test Route - API Key exists: ${!!apiKey}`, { status: 200 });
}
