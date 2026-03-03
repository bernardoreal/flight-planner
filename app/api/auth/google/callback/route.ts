import { NextResponse } from 'next/server';
import { getGoogleAuthClient } from '@/lib/google-auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: 'Código de autorização não encontrado' }, { status: 400 });
    }

    const oauth2Client = getGoogleAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Retorna HTML para fechar popup e enviar tokens para a janela principal
    return new NextResponse(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação bem-sucedida. Esta janela deve fechar automaticamente.</p>
        </body>
      </html>
    `, {
      headers: { 'Content-Type': 'text/html' }
    });
  } catch (error: any) {
    console.error('Erro ao trocar código por tokens:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
