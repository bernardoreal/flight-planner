import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const aircraft = searchParams.get('aircraft');

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft type is required' }, { status: 400 });
  }

  let clsInfo = "Dimensões padrão de narrowbody LATAM aplicáveis.";
  
  switch (aircraft) {
    case 'A319':
      clsInfo = "A319: Hold: 156x153x114 cm. Sem Bulk. Porta: 181x124 cm.";
      break;
    case 'A320':
      clsInfo = "A320: Aeronave equipada com CLS. Hold: 156x153x114 cm. Bulk: 250x120x110 cm. Porta: 181x124 cm.";
      break;
    case 'A321':
      clsInfo = "A321: Aeronave equipada com CLS. Hold: 156x153x114 cm. Bulk: 300x120x110 cm. Porta: 181x124 cm.";
      break;
  }

  return NextResponse.json({ clsInfo });
}
