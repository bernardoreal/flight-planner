import { NextResponse } from 'next/server';
import { getGoogleAuthClient } from '@/lib/google-auth';

export async function GET() {
  try {
    const oauth2Client = getGoogleAuthClient();
    
    // Escopos necessários para ler e escrever no Google Sheets
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Para obter refresh token
      scope: scopes,
      include_granted_scopes: true
    });

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error('Erro ao gerar URL de autenticação:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
