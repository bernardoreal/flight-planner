export const runtime = 'edge';

export async function GET() {
  return new Response('Test Route OK', { status: 200 });
}
