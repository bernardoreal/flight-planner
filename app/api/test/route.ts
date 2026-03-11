export const runtime = 'edge';

export async function GET() {
  return new Response('Hello World - Test Route', { status: 200 });
}
