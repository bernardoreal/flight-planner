import { google } from 'googleapis';

export const GOOGLE_SHEET_ID = '1aI24cg7wCpUDBz3nKx_s4tB-WHKxWY17S8PccmEt1So';
export const SHEET_NAME = 'GERENCIADOR';

export function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  // No ambiente de dev/preview, a URL de callback deve ser configurada corretamente
  // O usuário precisará adicionar a URL correta no console do Google Cloud
  // Vou usar uma variável de ambiente para a URL de redirecionamento ou construir dinamicamente se possível,
  // mas para OAuth server-side, a URL deve ser exata.
  // Vou assumir que o usuário configurará GOOGLE_REDIRECT_URI.
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Credenciais do Google (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI) não configuradas.');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
