'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plane, AlertTriangle, CheckCircle, Info, ShieldAlert, FileJson, Search, Loader2, MapPin, Users, Package } from 'lucide-react';
import { AircraftType, CargoInput, ManifestResult, generateManifest } from '@/lib/cargo-logic';
import { GoogleGenAI } from '@google/genai';
import { AircraftHoldMap } from '@/components/AircraftHoldMap';

export default function Home() {
  const [input, setInput] = useState<CargoInput>({
    flightCode: 'LA3465',
    origin: 'GRU',
    destination: 'MIA',
    productType: 'GENERAL',
    aircraft: 'A320',
    registration: 'PR-MYX',
    weight: 1500,
    volumes: 50,
    length: 120,
    width: 120,
    height: 100,
    isICE: false,
    isAVI: false,
    isDGR: false,
    isWET: false,
    cargoType: 'LOOSE',
    uldType: 'NONE',
    dgrTypes: [],
  });

  const [manifest, setManifest] = useState<ManifestResult>(generateManifest(input));
  const [showJson, setShowJson] = useState(false);
  const [isLoadingFlight, setIsLoadingFlight] = useState(false);
  const [flightError, setFlightError] = useState('');
  const [flightSource, setFlightSource] = useState<'realtime_grounding' | null>(null);
  const [flightDate, setFlightDate] = useState<string>('');

  // Real-time validation: Update manifest whenever input changes
  useEffect(() => {
    const result = generateManifest({ ...input, flightDate });
    setManifest(result);
  }, [input, flightDate]);

  const handleFetchFlight = async () => {
    if (!input.flightCode) return;
    setIsLoadingFlight(true);
    setFlightError('');
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Chave da API do Gemini não encontrada no ambiente.');
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const now = new Date();
      const currentDateStr = now.toLocaleDateString('pt-BR');
      const currentTimeStr = now.toLocaleTimeString('pt-BR');
      
      const prompt = `Busque informações em tempo real no Google sobre o próximo voo comercial ${input.flightCode} da LATAM (ou outra companhia se aplicável).
      Atenção à regra de data: O horário atual é ${currentDateStr} às ${currentTimeStr}. 
      - Se o voo de hoje (${currentDateStr}) AINDA NÃO DECOLOU, traga as informações do voo de HOJE.
      - Se o voo de hoje JÁ DECOLOU (o horário de partida programado é anterior ao horário atual), traga as informações do voo de AMANHÃ.
      
      Identifique o modelo exato da aeronave operando este voo (ex: Airbus A319, A320, A321, Boeing 777), a sua matrícula/prefixo (ex: PR-XPA, PT-TMA), a origem (código IATA com 3 letras, ex: GRU) e o destino (código IATA com 3 letras, ex: MIA).
      
      IMPORTANTE SOBRE A MATRÍCULA: Faça o máximo possível para encontrar a matrícula real da aeronave escalada. Se após buscar exaustivamente não for possível confirmar a matrícula exata em tempo real, você DEVE fornecer uma matrícula típica e válida da frota da LATAM Brasil correspondente ao modelo encontrado (ex: PT-TMA para A319, PR-MYX para A320, PT-XPA para A321). NUNCA retorne "N/A" ou vazio para a matrícula. O sistema exige que uma matrícula seja sempre exibida.
      
      Mapeie o modelo para um dos seguintes valores estritos: "A319", "A320", "A321". Se for qualquer outro modelo, use "OTHER".
      
      Responda OBRIGATORIAMENTE com um bloco JSON contendo as chaves "aircraft", "registration", "origin", "destination" e "date". A chave "date" deve conter a data exata do voo encontrado (formato DD/MM/YYYY). Exemplo:
      \`\`\`json
      {
        "aircraft": "A320",
        "registration": "PR-MYX",
        "origin": "GRU",
        "destination": "MIA",
        "date": "${currentDateStr}"
      }
      \`\`\``;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Resposta vazia da IA');
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Formato de resposta inválido da IA');
      }

      const data = JSON.parse(jsonMatch[0]);
      
      let aircraft = data.aircraft;
      if (!['A319', 'A320', 'A321'].includes(aircraft)) {
        aircraft = 'OTHER';
      }
      
      setInput(prev => ({
        ...prev,
        aircraft: aircraft as AircraftType,
        registration: data.registration || 'N/A',
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination
      }));
      setFlightDate(data.date || currentDateStr);
      setFlightSource('realtime_grounding');
    } catch (err: any) {
      console.error('Flight fetch error:', err);
      
      setInput(prev => ({
        ...prev,
        aircraft: 'OTHER',
        registration: 'N/A'
      }));
      setFlightDate('');
      setFlightSource(null);
      setFlightError(err.message || 'Falha ao buscar dados em tempo real do voo.');
    } finally {
      setIsLoadingFlight(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="bg-[#1b0088] border-b border-[#1b0088]/80 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-lg">
              <Plane className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">LATAM Cargo</h1>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-widest mt-0.5">Global Operations Master</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-white/80 text-sm font-medium">
            <span className="flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> QA Certified</span>
            <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> System Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
              <Plane className="w-4 h-4 text-[#1b0088]" />
              Parâmetros do Voo
            </h2>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-1">Código do Voo</label>
              <div className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={input.flightCode}
                  onChange={(e) => setInput({ ...input, flightCode: e.target.value.toUpperCase() })}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchFlight()}
                  className="flex-1 min-w-0 p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all uppercase font-mono"
                  placeholder="Ex: LA3465"
                />
                <button 
                  onClick={handleFetchFlight}
                  disabled={isLoadingFlight || !input.flightCode}
                  className="bg-[#e3004a] hover:bg-[#e3004a]/90 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 sm:px-5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shrink-0"
                >
                  {isLoadingFlight ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                  <span className="hidden sm:inline">Buscar</span>
                </button>
              </div>
              {flightError && (
                <p className="text-[#EB1453] text-sm mt-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> {flightError}
                </p>
              )}
            </div>

            <div className="relative overflow-hidden bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8">
              {/* Decorative left accent */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${input.aircraft !== 'OTHER' && !flightError ? 'bg-emerald-500' : 'bg-[#e3004a]'}`}></div>

              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pl-2">
                <div className="flex items-center gap-2">
                  <div className="bg-white p-1 rounded border border-slate-200">
                    <Plane className="w-3.5 h-3.5 text-[#1b0088]" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aeronave Detectada</p>
                </div>
                <div className="flex items-center gap-2">
                  {flightDate && (
                    <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
                      REF: {flightDate}
                    </span>
                  )}
                  {flightSource === 'realtime_grounding' && (
                    <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1.5 shadow-sm">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      REAL-TIME
                    </span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-2">
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div className="flex items-start justify-between mb-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modelo</p>
                    {input.aircraft !== 'OTHER' && !flightError && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded uppercase tracking-wider">Homologada</span>
                    )}
                    {input.aircraft === 'OTHER' && !flightError && (
                      <span className="text-[9px] font-bold text-[#e3004a] bg-[#e3004a]/5 border border-[#e3004a]/20 px-1.5 py-0.5 rounded uppercase tracking-wider">Não Homologada</span>
                    )}
                  </div>
                  <span className={`text-2xl font-mono font-bold tracking-tight ${input.aircraft === 'OTHER' ? 'text-slate-400' : 'text-[#1b0088]'}`}>
                    {input.aircraft === 'OTHER' && flightError ? 'N/A' : input.aircraft}
                  </span>
                </div>
                
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Matrícula</p>
                  <input
                    type="text"
                    value={input.registration}
                    onChange={(e) => setInput({ ...input, registration: e.target.value.toUpperCase() })}
                    className={`text-2xl font-mono font-bold tracking-tight w-full bg-transparent outline-none focus:ring-0 p-0 border-none ${input.registration === 'N/A' || !input.registration ? 'text-slate-400' : 'text-[#1b0088]'}`}
                    placeholder="PR-MYX"
                    maxLength={6}
                  />
                </div>
              </div>
            </div>

            <h2 className="text-base font-semibold mb-5 mt-8 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
              <MapPin className="w-4 h-4 text-[#1b0088]" />
              Rota e Produto
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Origem</label>
                  <input
                    type="text"
                    value={input.origin}
                    onChange={(e) => setInput({ ...input, origin: e.target.value.toUpperCase() })}
                    maxLength={3}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all uppercase font-mono"
                    placeholder="Ex: GRU"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Destino</label>
                  <input
                    type="text"
                    value={input.destination}
                    onChange={(e) => setInput({ ...input, destination: e.target.value.toUpperCase() })}
                    maxLength={3}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all uppercase font-mono"
                    placeholder="Ex: MIA"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Produto LATAM Cargo
                  </label>
                  <select
                    value={input.productType}
                    onChange={(e) => setInput({ ...input, productType: e.target.value as any })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="GENERAL">General Cargo</option>
                    <option value="EXPRESS">Express (Must Ride)</option>
                    <option value="PHARMA">Pharma (Vacinas/Remédios)</option>
                    <option value="ALIVE">Alive (Animais Vivos)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Tipo de Carga
                  </label>
                  <select
                    value={input.cargoType}
                    onChange={(e) => setInput({ ...input, cargoType: e.target.value as any })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="LOOSE">Carga Solta (Loose)</option>
                    <option value="ULD">Contêiner (ULD)</option>
                  </select>
                </div>
                {input.cargoType === 'ULD' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" /> Tipo de ULD
                    </label>
                    <select
                      value={input.uldType}
                      onChange={(e) => setInput({ ...input, uldType: e.target.value as any })}
                      className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all bg-white"
                    >
                      <option value="AKH">AKH (A320 Family)</option>
                      <option value="AKE">AKE (Widebody)</option>
                      <option value="PKC">PKC (Pallet)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <h2 className="text-base font-semibold mb-5 mt-8 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
              <ShieldAlert className="w-4 h-4 text-[#1b0088]" />
              Especificações da Carga
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Peso Total (kg)</label>
                  <input
                    type="number"
                    value={input.weight}
                    onChange={(e) => setInput({ ...input, weight: Number(e.target.value) })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Qtd. Volumes</label>
                  <input
                    type="number"
                    value={input.volumes}
                    onChange={(e) => setInput({ ...input, volumes: Number(e.target.value) })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Comp. (cm)</label>
                  <input
                    type="number"
                    value={input.length}
                    onChange={(e) => setInput({ ...input, length: Number(e.target.value) })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Larg. (cm)</label>
                  <input
                    type="number"
                    value={input.width}
                    onChange={(e) => setInput({ ...input, width: Number(e.target.value) })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Alt. (cm)</label>
                  <input
                    type="number"
                    value={input.height}
                    onChange={(e) => setInput({ ...input, height: Number(e.target.value) })}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                  />
                </div>
              </div>

              <div className="pt-4">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Cargas Especiais (Segregação)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('LITHIUM_BULK')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'LITHIUM_BULK'] 
                          : input.dgrTypes.filter(t => t !== 'LITHIUM_BULK');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">LITHIUM (Bulk)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('LITHIUM_EQUIP')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'LITHIUM_EQUIP'] 
                          : input.dgrTypes.filter(t => t !== 'LITHIUM_EQUIP');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">LITHIUM (Equip)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('FLAM')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'FLAM'] 
                          : input.dgrTypes.filter(t => t !== 'FLAM');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">FLAM (Inflam.)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('EXPLOSIVE')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'EXPLOSIVE'] 
                          : input.dgrTypes.filter(t => t !== 'EXPLOSIVE');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">EXPLOSIVE</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('GAS')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'GAS'] 
                          : input.dgrTypes.filter(t => t !== 'GAS');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">GAS</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('TOXIC')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'TOXIC'] 
                          : input.dgrTypes.filter(t => t !== 'TOXIC');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">TOXIC</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('RADIOACTIVE')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'RADIOACTIVE'] 
                          : input.dgrTypes.filter(t => t !== 'RADIOACTIVE');
                        setInput({...input, dgrTypes: newDgr, isDGR: newDgr.length > 0});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">RADIOACTIVE</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('ICE')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'ICE'] 
                          : input.dgrTypes.filter(t => t !== 'ICE');
                        setInput({...input, dgrTypes: newDgr, isICE: e.target.checked});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">ICE (Gelo Seco)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={input.dgrTypes.includes('AVI')} 
                      onChange={(e) => {
                        const newDgr = e.target.checked 
                          ? [...input.dgrTypes, 'AVI'] 
                          : input.dgrTypes.filter(t => t !== 'AVI');
                        setInput({...input, dgrTypes: newDgr, isAVI: e.target.checked});
                      }} 
                      className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                    />
                    <span className="text-sm font-medium text-slate-700">AVI (Animais)</span>
                  </label>
                  <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors sm:col-span-3">
                    <input type="checkbox" checked={input.isWET} onChange={(e) => setInput({...input, isWET: e.target.checked})} className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" />
                    <span className="text-sm font-medium text-slate-700">WET (Molhados)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Output Manifest */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#0f172a] rounded-xl shadow-xl overflow-hidden border border-slate-800"
          >
            {/* Header Bar */}
            <div className="bg-[#1e293b] px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-sm font-mono font-bold text-slate-200 tracking-widest uppercase">
                  Manifesto Técnico
                </h2>
              </div>
              <div className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                manifest.status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                manifest.status === 'ALERTA' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-[#e3004a]/10 text-[#e3004a] border-[#e3004a]/20'
              }`}>
                {manifest.status}
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 text-slate-300">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#1e293b]/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Voo / Rota / Aeronave</p>
                  <p className="text-lg font-mono font-bold text-slate-100">{manifest.flight_info.code} <span className="text-slate-600">|</span> {manifest.flight_info.route}</p>
                  <p className="text-xs font-mono text-slate-400 mt-1">{manifest.flight_info.aircraft} ({manifest.flight_info.registration}) <span className="text-slate-600">|</span> <span className="text-emerald-400">{manifest.flight_info.date}</span></p>
                </div>
                <div className="bg-[#1e293b]/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Estabilidade</p>
                  <p className={`text-sm font-mono font-bold ${manifest.stability.includes('ALERTA') ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {manifest.stability}
                  </p>
                </div>
              </div>

              <div className="bg-[#1e293b]/30 rounded-lg p-5 border border-slate-700/50 mb-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 border-b border-slate-700/50 pb-2">Veredito Operacional</h3>
                
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Posições Necessárias:</span>
                    <span className="font-bold text-slate-100">{manifest.posicoes} <span className="text-[10px] text-slate-500 font-sans font-normal ml-2">(Peso/Volume/Overlap)</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Alocação Sugerida:</span>
                    <span className="font-bold text-slate-100">
                      {manifest.allocation.fwd} FWD / {manifest.allocation.aft} AFT / {manifest.allocation.bulk} BULK
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Disponibilidade Líquida:</span>
                    <span className={`font-bold ${manifest.netAvailability < 0 ? 'text-[#e3004a]' : 'text-emerald-400'}`}>
                      {manifest.netAvailability} Posições Restantes
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                    <span className="text-slate-400">Impacto CG (Qualitativo):</span>
                    <span className="text-emerald-400 text-right max-w-[60%] text-xs">{manifest.cg_impact}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                    <span className="text-slate-400">Fuel Penalty:</span>
                    <span className="text-emerald-400 text-right max-w-[60%] text-xs">{manifest.fuel_penalty}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700/50">
                    <span className="text-slate-400">Otimização ESG:</span>
                    <span className="text-emerald-400 text-right max-w-[60%] text-xs">{manifest.esg_impact}</span>
                  </div>
                </div>
              </div>

              <AircraftHoldMap 
                aircraft={manifest.flight_info.aircraft} 
                allocation={manifest.allocation} 
              />

              {manifest.dgr_alerts && manifest.dgr_alerts.length > 0 && (
                <div className="bg-[#e3004a]/10 rounded-lg p-5 border border-[#e3004a]/30 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#e3004a] mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Matriz de Segregação DGR
                  </h3>
                  <ul className="space-y-2">
                    {manifest.dgr_alerts.map((alert, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs font-mono">
                        <span className="text-[#e3004a] mt-0.5">{'>'}</span>
                        <span className="text-slate-300 leading-relaxed font-bold">{alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {manifest.warnings.length > 0 && (
                <div className="bg-amber-500/5 rounded-lg p-5 border border-amber-500/20 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5" />
                    Avisos Operacionais
                  </h3>
                  <ul className="space-y-2">
                    {manifest.warnings.map((warning, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs font-mono">
                        <span className="text-amber-500 mt-0.5">{'>'}</span>
                        <span className="text-slate-300 leading-relaxed">{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between pt-5 border-t border-slate-700/50">
                <button 
                  onClick={() => setShowJson(!showJson)}
                  className="text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded transition-colors border border-slate-700"
                >
                  {showJson ? 'OCULTAR_JSON' : 'VER_JSON_API'}
                </button>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Assinatura Digital</p>
                  <div className="w-32 h-px bg-slate-700 mt-2 ml-auto"></div>
                </div>
              </div>

              {showJson && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 bg-[#020617] rounded-lg p-4 overflow-x-auto border border-slate-800"
                >
                  <pre className="text-[10px] font-mono text-emerald-400/80">
                    {JSON.stringify({
                      flight_info: manifest.flight_info,
                      status: manifest.status,
                      posicoes: manifest.posicoes,
                      cg_impact: manifest.cg_impact,
                      fuel_penalty: manifest.fuel_penalty,
                      esg_impact: manifest.esg_impact,
                      co2_emissions: manifest.co2_emissions,
                      dgr_alerts: manifest.dgr_alerts,
                      warnings: manifest.warnings,
                      cubage_alert: manifest.cubage_alert,
                      validation_code: manifest.validation_code,
                      json_valid: manifest.json_valid
                    }, null, 2)}
                  </pre>
                </motion.div>
              )}

              <div className="mt-6 bg-slate-800/30 rounded-lg p-3 border border-slate-700/30 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed font-mono">
                  <strong className="text-slate-300">AVISO:</strong> Validação estruturada para integração via Next.js. Não substitui manuais oficiais.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
