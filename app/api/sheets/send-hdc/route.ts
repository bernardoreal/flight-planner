import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getGoogleAuthClient, GOOGLE_SHEET_ID, SHEET_NAME } from '@/lib/google-auth';

export async function POST(request: Request) {
  try {
    const { tokens, data } = await request.json();

    if (!tokens || !data) {
      return NextResponse.json({ error: 'Tokens ou dados ausentes' }, { status: 400 });
    }

    const oauth2Client = getGoogleAuthClient();
    oauth2Client.setCredentials(tokens);

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Tenta ler o cabeçalho para mapear colunas (opcional, mas bom para robustez)
    // Se não conseguir, assume uma ordem padrão: Voo, Data, Origem, Destino, Peso, Posições, etc.
    // Vou assumir uma ordem padrão por enquanto para simplificar.
    // Voo, Data, Origem, Destino, Peso Total, Posições, Status

    const values = [
      [
        data.flightCode,
        data.date,
        data.origin,
        data.destination,
        data.totalWeight,
        data.positions,
        data.status,
        new Date().toISOString() // Timestamp de envio
      ]
    ];

    const resource = {
      values,
    };

    // Adiciona nova linha na aba GERENCIADOR
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: `${SHEET_NAME}!A:H`, // Assume colunas A a H
      valueInputOption: 'USER_ENTERED',
      resource,
    });

    return NextResponse.json({ success: true, updatedRange: result.data.updates?.updatedRange });
  } catch (error: any) {
    console.error('Erro ao escrever na planilha:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
