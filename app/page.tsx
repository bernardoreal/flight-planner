'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plane, AlertTriangle, CheckCircle, Info, ShieldAlert, FileJson, Search, Loader2, MapPin, Users, Package, Camera, RectangleHorizontal, X, ImagePlus } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { AircraftType, CargoInput, ManifestResult, generateManifest } from '@/lib/cargo-logic';
import { AircraftHoldMap } from '@/components/AircraftHoldMap';

// MODELO ESCOLHIDO: Gemini 3 Flash (Recomendado para tarefas de texto/busca)
const AI_MODEL = 'gemini-3-flash-preview';

export default function Home() {
  const [input, setInput] = useState<CargoInput>({
    flightCode: '',
    origin: '',
    destination: '',
    productType: 'GENERAL',
    aircraft: 'A320',
    registration: 'PR-MYX',
    pranchas: [
      {
        id: '1',
        weight: 1500,
        volumes: 50,
        length: 120,
        width: 120,
        height: 100,
        hasOversize: false,
        oversizeVolumes: 0,
        oversizeWeight: 0,
        oversizeLength: 0,
        oversizeWidth: 0,
        oversizeHeight: 0,
      }
    ],
    isICE: false,
    isAVI: false,
    isDGR: false,
    isWET: false,
    isHUM: false,
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
  const [selectedSearchDate, setSelectedSearchDate] = useState<string>('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<number | null>(null);
  const [pranchaImages, setPranchaImages] = useState<Record<string, { file: File, preview: string }[]>>({});

  // Initialize date on client-side to avoid hydration mismatch
  useEffect(() => {
    const today = new Date();
    const formatted = today.toLocaleDateString('pt-BR');
    const iso = today.toISOString().split('T')[0];
    setFlightDate(formatted);
    setSelectedSearchDate(iso);
    
    // Load saved input state from localStorage
    try {
      const savedInput = localStorage.getItem('latamCargoInput');
      if (savedInput) {
        setInput(JSON.parse(savedInput));
      }
    } catch (e) {
      console.error('Failed to load saved input', e);
    }
  }, []);

  // Save input state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('latamCargoInput', JSON.stringify(input));
    } catch (e) {
      console.error('Failed to save input', e);
    }
  }, [input]);

  // Real-time validation: Update manifest whenever input changes
  useEffect(() => {
    const result = generateManifest({ ...input, flightDate });
    setManifest(result);
  }, [input, flightDate]);

  // Helper to extract JSON from AI response
  const extractJSON = (text: string) => {
    try {
      // 1. Try to find JSON inside markdown code blocks
      const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        return JSON.parse(codeBlockMatch[1]);
      }
      
      // 2. Try to find the first valid JSON object using regex
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 3. Try parsing the raw text
      return JSON.parse(text);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return null;
    }
  };

  const handleFetchFlight = async () => {
    if (!input.flightCode) return;
    setIsLoadingFlight(true);
    setFlightError('');
    setInput(prev => ({ ...prev, aiReasoning: undefined }));
    
    try {
      const now = new Date();
      const isoDateTime = now.toISOString();
      const searchDateObj = selectedSearchDate ? new Date(selectedSearchDate + 'T12:00:00') : now;
      const searchDateStr = searchDateObj.toLocaleDateString('pt-BR');
      
      const prompt = `ATUE COMO UM ESPECIALISTA SÊNIOR EM OPERAÇÕES AÉREAS E RASTREAMENTO DE VOOS (FLIGHT DISPATCHER).
      
      Sua missão é descobrir a MATRÍCULA (Registration/Tail Number) EXATA e CONFIRMADA da aeronave para o voo ${input.flightCode} da LATAM Brasil para a data de ${searchDateStr}.
      
      Contexto Temporal Atual:
      - ISO DateTime: ${isoDateTime}
      - Data de Referência da Busca: ${searchDateStr}
      
      PROTOCOLO DE VERIFICAÇÃO RIGOROSA E CROSS-CHECK OBRIGATÓRIO:
      1. Você DEVE realizar buscas EXTENSIVAS no Google para o voo "${input.flightCode}" na data "${searchDateStr}" focando em sites de rastreamento em tempo real.
      2. CROSS-CHECK OBRIGATÓRIO: Você NÃO PODE confiar em apenas uma fonte. Você DEVE cruzar os dados entre pelo menos duas destas fontes:
         - FlightRadar24
         - FlightAware
         - RadarBox
         - Site oficial da LATAM
      3. Se a data for FUTURA, procure pela aeronave ESCALADA (Scheduled). Se for PASSADA, procure a que REALMENTE OPEROU.
      4. Verifique se a matrícula segue o padrão da LATAM Brasil (ex: PT-***, PR-***, PS-***).
      
      REGRAS DE SAÍDA:
      - Modelo: Identifique se é A319, A320, A321, B767, B787, B777. Mapeie para "A319", "A320", "A321" ou "OTHER".
      - Matrícula: DEVE ser a real e confirmada (ex: PT-MXG, PR-MYX).
      - SE NÃO TIVER CERTEZA ABSOLUTA OU NÃO ENCONTRAR DADOS CONFIRMADOS EM PELO MENOS DUAS FONTES, RETORNE "N/A" NO CAMPO REGISTRATION. NÃO ADIVINHE.
      - Origem/Destino: Use os códigos IATA reais (ex: GRU, MIA, LIS).
      - Data: A data do voo retornado (DD/MM/YYYY).
      - CLS (Cargo Loading System): Verifique e informe se a aeronave identificada possui o sistema de carregamento mecanizado (CLS) instalado nos compartimentos 1, 2, 3 e 4.
      
      Responda APENAS com o JSON final no seguinte formato:
      \`\`\`json
      {
        "aircraft": "A321",
        "registration": "PT-MXG",
        "origin": "GRU",
        "destination": "MIA",
        "date": "${searchDateStr}",
        "clsInfo": "Aeronave equipada com CLS nos compartimentos 1, 2, 3 e 4.",
        "reasoning": "CROSS-CHECK REALIZADO: Encontrado no histórico do FlightRadar24 como aeronave escalada para ${searchDateStr}. Confirmado também no FlightAware. Matrícula PT-MXG confirmada."
      }
      \`\`\``;

      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY_PIXOR! });
      const model = ai.models.generateContent({
        model: AI_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const response = await model;
      const text = response.text;
      
      if (!text) {
        throw new Error('Resposta vazia da IA');
      }

      const data = extractJSON(text);
      
      if (!data) {
        console.error("Raw AI Response:", text);
        throw new Error('Formato de resposta inválido da IA. Tente novamente.');
      }
      
      let aircraft = data.aircraft;
      if (!['A319', 'A320', 'A321'].includes(aircraft)) {
        aircraft = 'OTHER';
      }
      
      setInput(prev => ({
        ...prev,
        aircraft: aircraft as AircraftType,
        registration: data.registration || 'N/A',
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        aiReasoning: data.reasoning,
        clsInfo: data.clsInfo
      }));
      setFlightDate(data.date || searchDateStr);
      setFlightSource('realtime_grounding');
    } catch (err: any) {
      console.error('Flight fetch error:', err);
      
      setInput(prev => ({
        ...prev,
        aircraft: 'OTHER',
        registration: 'N/A',
        origin: '',
        destination: ''
      }));
      setFlightDate('');
      setFlightSource(null);

      if (err.message && err.message.includes('OPENROUTER_API_KEY')) {
        setFlightError('Chave de API do OpenRouter não configurada.');
      } else {
        setFlightError(err.message || 'Falha ao buscar dados em tempo real do voo.');
      }
    } finally {
      setIsLoadingFlight(false);
    }
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>, pranchaId: string) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));

    setPranchaImages(prev => ({
      ...prev,
      [pranchaId]: [...(prev[pranchaId] || []), ...newImages]
    }));
    
    // Reset input value so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveImage = (pranchaId: string, imageIndex: number) => {
    setPranchaImages(prev => {
      const current = prev[pranchaId] || [];
      const updated = [...current];
      URL.revokeObjectURL(updated[imageIndex].preview);
      updated.splice(imageIndex, 1);
      return { ...prev, [pranchaId]: updated };
    });
  };

  const handleAnalyzeImages = async (pranchaIndex: number, pranchaId: string) => {
    const images = pranchaImages[pranchaId] || [];
    if (images.length === 0) return;

    setIsAnalyzingImage(pranchaIndex);

    try {
      const prompt = `Analise a(s) foto(s) enviada(s). Pode ser uma prancha de carga montada ou um conjunto de pallets que serão carregados em uma única prancha.
      Com base na(s) imagem(ns) (se houver etiquetas visíveis, leia-as; caso contrário, faça uma estimativa visual profissional), estime os seguintes valores TOTAIS para a prancha:
      1. Peso total aproximado (em kg) somando todos os itens/pallets.
      2. Quantidade total de volumes (caixas/peças/pallets).
      3. Dimensões totais estimadas que a carga ocupará na prancha: Comprimento, Largura e Altura (em cm).
      4. Verifique se há algum item claramente 'oversize' (muito longo, acima de 150cm) que exigiria overlap de posições.

      Responda APENAS com o JSON. Sem texto introdutório.
      Exemplo:
      \`\`\`json
      {
        "weight": 850,
        "volumes": 24,
        "length": 120,
        "width": 100,
        "height": 110,
        "hasOversize": false
      }
      \`\`\``;

      const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY_PIXOR! });
      
      const parts = await Promise.all(images.map(async (img) => {
        const file = img.file;
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
          };
          reader.onerror = error => reject(error);
        });
        reader.readAsDataURL(file);
        const base64Data = await base64Promise;
        return {
          inlineData: {
            mimeType: file.type || 'image/jpeg',
            data: base64Data
          }
        };
      }));

      const response = await ai.models.generateContent({
        model: AI_MODEL,
        contents: {
          parts: [
            { text: prompt },
            ...parts
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              weight: { type: Type.NUMBER },
              volumes: { type: Type.NUMBER },
              length: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
              hasOversize: { type: Type.BOOLEAN }
            },
            required: ["weight", "volumes", "length", "width", "height", "hasOversize"]
          }
        }
      });

      const text = response.text;

      if (!text) throw new Error('Resposta vazia da IA');

      const data = extractJSON(text);

      if (!data) {
        console.error("Raw AI Response:", text);
        throw new Error('Formato de resposta inválido da IA');
      }

      setInput(prev => {
        const newPranchas = [...prev.pranchas];
        newPranchas[pranchaIndex] = {
          ...newPranchas[pranchaIndex],
          weight: data.weight || newPranchas[pranchaIndex].weight,
          volumes: data.volumes || newPranchas[pranchaIndex].volumes,
          length: data.length || newPranchas[pranchaIndex].length,
          width: data.width || newPranchas[pranchaIndex].width,
          height: data.height || newPranchas[pranchaIndex].height,
          hasOversize: data.hasOversize || false,
          oversizeVolumes: data.hasOversize ? 1 : 0,
          oversizeWeight: data.hasOversize ? 100 : 0,
        };
        return { ...prev, pranchas: newPranchas };
      });
      
      // Clear images after successful analysis
      setPranchaImages(prev => {
        const updated = { ...prev };
        delete updated[pranchaId];
        return updated;
      });

    } catch (err: any) {
      console.error('Image analysis error:', err);
      alert('Falha ao analisar as imagens. Tente novamente ou insira os dados manualmente.');
    } finally {
      setIsAnalyzingImage(null);
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
          <div className="flex items-center gap-4 text-white/80 text-sm font-medium">
            <span className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-md border border-white/10 text-[10px] sm:text-xs max-w-[140px] sm:max-w-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              <span className="truncate">AI: {AI_MODEL}</span>
            </span>
            <span className="hidden sm:flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> QA Certified</span>
            <span className="hidden sm:flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> System Online</span>
          </div>
        </div>
      </header>

      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Input Form */}
        <div className="lg:col-span-7 grid grid-cols-1 lg:grid-cols-2 gap-4 content-start">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 col-span-1">
            <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
              <Plane className="w-4 h-4 text-[#1b0088]" />
              Parâmetros do Voo
            </h2>
            
            <div className="mb-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código do Voo</label>
                  <input
                    type="text"
                    value={input.flightCode}
                    onChange={(e) => setInput({ ...input, flightCode: e.target.value.toUpperCase() })}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchFlight()}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all uppercase font-mono"
                    placeholder="Ex: LA3465"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data do Voo</label>
                  <input
                    type="date"
                    value={selectedSearchDate}
                    onChange={(e) => setSelectedSearchDate(e.target.value)}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                  />
                </div>
              </div>
              
              <button 
                onClick={handleFetchFlight}
                disabled={isLoadingFlight || !input.flightCode}
                className="w-full bg-[#e3004a] hover:bg-[#e3004a]/90 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isLoadingFlight ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                <span>Buscar Dados em Tempo Real</span>
              </button>
              
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

              {input.aiReasoning && (
                <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-800 flex gap-2">
                  <Info className="w-3.5 h-3.5 text-[#1b0088] shrink-0 mt-0.5" />
                  <p><strong>Auditoria de Dados (Cross-Check):</strong> {input.aiReasoning}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 col-span-1">
            <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-3">
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

              <div className="grid grid-cols-2 gap-4">
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
                    <option value="VELOZ">Veloz (Must Ride)</option>
                    <option value="PHARMA">Pharma (Vacinas/Remédios)</option>
                    <option value="ALIVE">Alive (Animais Vivos)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" /> Tipo de Carga
                  </label>
                  <select
                    value={input.cargoType === 'LOOSE' ? 'LOOSE' : `ULD_${input.uldType}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'LOOSE') {
                        setInput({ ...input, cargoType: 'LOOSE', uldType: 'NONE' });
                      } else {
                        const uldType = val.split('_')[1] as any;
                        setInput({ ...input, cargoType: 'ULD', uldType: uldType });
                      }
                    }}
                    className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="LOOSE">Carga Solta (Loose)</option>
                    <option value="ULD_AKH">Contêiner (ULD) - AKH (A320 Family)</option>
                    <option value="ULD_AKE">Contêiner (ULD) - AKE (Widebody)</option>
                    <option value="ULD_PKC">Contêiner (ULD) - PKC (Pallet)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 col-span-1 lg:col-span-2">
            <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-800">
                <ShieldAlert className="w-4 h-4 text-[#1b0088]" />
                Especificações da Carga
              </h2>
              <button 
                onClick={() => {
                  if (confirm('Deseja realmente limpar todos os dados preenchidos?')) {
                    localStorage.removeItem('latamCargoInput');
                    window.location.reload();
                  }
                }}
                className="text-xs text-slate-500 hover:text-red-600 font-medium transition-colors"
              >
                Limpar Dados
              </button>
            </div>
            
            <div className="space-y-4">
              {input.pranchas.map((prancha, index) => (
                <div key={prancha.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50 relative">
                    <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <RectangleHorizontal className="w-4 h-4 text-[#1b0088]" />
                        <h3 className="text-sm font-bold text-slate-700">Prancha {index + 1}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md cursor-pointer hover:bg-indigo-200 transition-colors text-xs font-semibold">
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Adicionar Foto</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={(e) => handleAddImage(e, prancha.id)}
                            disabled={isAnalyzingImage !== null}
                          />
                        </label>
                      </div>
                    </div>
                    {input.pranchas.length > 1 && (
                      <button 
                        onClick={() => {
                          const newPranchas = [...input.pranchas];
                          newPranchas.splice(index, 1);
                          setInput({...input, pranchas: newPranchas});
                          
                          // Also remove associated images
                          setPranchaImages(prev => {
                            const updated = { ...prev };
                            delete updated[prancha.id];
                            return updated;
                          });
                        }}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                      >
                        Remover
                      </button>
                    )}
                  </div>

                  {pranchaImages[prancha.id] && pranchaImages[prancha.id].length > 0 && (
                    <div className="mb-4 bg-white p-3 rounded-lg border border-slate-200">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {pranchaImages[prancha.id].map((img, imgIdx) => (
                          <div key={imgIdx} className="relative w-16 h-16 rounded-md overflow-hidden border border-slate-200 group">
                            <img src={img.preview} alt={`Foto ${imgIdx + 1}`} className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleRemoveImage(prancha.id, imgIdx)}
                              className="absolute top-0.5 right-0.5 bg-black/50 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <label className="w-16 h-16 rounded-md border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-600 cursor-pointer transition-colors bg-slate-50">
                          <ImagePlus className="w-5 h-5 mb-1" />
                          <span className="text-[10px] font-medium text-center leading-tight">Mais<br/>Fotos</span>
                          <input 
                            type="file" 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={(e) => handleAddImage(e, prancha.id)}
                            disabled={isAnalyzingImage !== null}
                          />
                        </label>
                      </div>
                      <button
                        onClick={() => handleAnalyzeImages(index, prancha.id)}
                        disabled={isAnalyzingImage === index}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        {isAnalyzingImage === index ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analisando {pranchaImages[prancha.id].length} foto(s)...
                          </>
                        ) : (
                          <>
                            <ImagePlus className="w-4 h-4" />
                            Analisar {pranchaImages[prancha.id].length} foto(s)
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Peso (kg)</label>
                      <input
                        type="number"
                        value={prancha.weight}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].weight = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Qtd. Volumes</label>
                      <input
                        type="number"
                        value={prancha.volumes}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].volumes = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono bg-white"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Comp. (cm)</label>
                      <input
                        type="number"
                        value={prancha.length}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].length = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Larg. (cm)</label>
                      <input
                        type="number"
                        value={prancha.width}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].width = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Alt. (cm)</label>
                      <input
                        type="number"
                        value={prancha.height}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].height = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Carga Especial (Segregação)</label>
                    <select
                      value={prancha.specialCargoType || 'NONE'}
                      onChange={(e) => {
                        const newPranchas = [...input.pranchas];
                        newPranchas[index].specialCargoType = e.target.value as any;
                        if (e.target.value !== 'ICE') {
                          newPranchas[index].iceWeight = undefined;
                        }
                        setInput({...input, pranchas: newPranchas});
                      }}
                      className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all bg-white"
                    >
                      <option value="NONE">Nenhuma</option>
                      <option value="ICE">Gelo Seco (ICE)</option>
                      <option value="AVI">Animais Vivos (AVI)</option>
                      <option value="DGR">Carga Perigosa (DGR)</option>
                      <option value="WET">Carga Úmida (WET)</option>
                      <option value="PER">Perecível (PER)</option>
                      <option value="HUM">Restos Mortais (HUM)</option>
                      <option value="VAL">Carga Valiosa (VAL)</option>
                    </select>
                    
                    {['ICE', 'DGR', 'AVI', 'HUM'].includes(prancha.specialCargoType || '') && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <p><strong>Atenção:</strong> Esta carga requer emissão obrigatória de <strong>NOTOC</strong> (Notification to Captain) antes do voo.</p>
                      </div>
                    )}
                  </div>

                  {prancha.specialCargoType === 'ICE' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg"
                    >
                      <label className="block text-xs font-semibold text-blue-800 uppercase tracking-wider mb-1.5">Peso Total de Gelo Seco (kg)</label>
                      <input
                        type="number"
                        value={prancha.iceWeight || ''}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].iceWeight = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        placeholder="Ex: 50"
                        className="w-full p-2.5 text-sm rounded-lg border border-blue-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono bg-white"
                      />
                    </motion.div>
                  )}

                  <div className="pt-2">
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors bg-white">
                      <input 
                        type="checkbox" 
                        checked={prancha.hasOversize} 
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].hasOversize = e.target.checked;
                          newPranchas[index].oversizeVolumes = e.target.checked ? 1 : 0;
                          newPranchas[index].oversizeWeight = e.target.checked ? 100 : 0;
                          newPranchas[index].oversizeLength = e.target.checked ? 200 : 0;
                          newPranchas[index].oversizeWidth = e.target.checked ? 100 : 0;
                          newPranchas[index].oversizeHeight = e.target.checked ? 100 : 0;
                          setInput({...input, pranchas: newPranchas});
                        }} 
                        className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088]" 
                      />
                      <span className="text-sm font-medium text-slate-700">Contém itens Oversize (Requer Overlap Físico)</span>
                    </label>
                    
                    {prancha.hasOversize && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 p-4 bg-white rounded-lg border border-slate-200"
                      >
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Qtd. Vols Oversize</label>
                            <input
                              type="number"
                              value={prancha.oversizeVolumes}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeVolumes = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              min="1"
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Peso Oversize (kg)</label>
                            <input
                              type="number"
                              value={prancha.oversizeWeight}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeWeight = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              min="1"
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-slate-50"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Comp. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeLength || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeLength = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Larg. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeWidth || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeWidth = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-slate-50"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Alt. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeHeight || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeHeight = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono bg-slate-50"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              ))}
              
              <button
                onClick={() => {
                  setInput({
                    ...input,
                    pranchas: [
                      ...input.pranchas,
                      {
                        id: Math.random().toString(36).substr(2, 9),
                        weight: 0,
                        volumes: 1,
                        length: 120,
                        width: 120,
                        height: 100,
                        hasOversize: false,
                        oversizeVolumes: 0,
                        oversizeWeight: 0,
                        oversizeLength: 0,
                        oversizeWidth: 0,
                        oversizeHeight: 0
                      }
                    ]
                  });
                }}
                className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-medium hover:border-[#1b0088] hover:text-[#1b0088] transition-colors flex items-center justify-center gap-2"
              >
                + Adicionar Prancha
              </button>
            </div>
          </div>
        </div>

        {/* Output Manifest */}
        <div className="lg:col-span-5">
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
                  {manifest.clsInfo && (
                    <div className="mt-3 pt-3 border-t border-slate-700/50 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-mono text-blue-300 leading-relaxed">{manifest.clsInfo}</p>
                    </div>
                  )}
                </div>
                <div className="bg-[#1e293b]/50 rounded-lg p-4 border border-slate-700/50">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Estabilidade</p>
                  <p className={`text-sm font-mono font-bold ${manifest.stability.includes('ALERTA') ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {manifest.stability}
                  </p>
                </div>
              </div>

              <AircraftHoldMap 
                aircraft={manifest.flight_info.aircraft} 
                allocation={manifest.allocation} 
              />

              <div className="bg-[#1e293b]/30 rounded-lg p-5 border border-slate-700/50 mb-6">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4 border-b border-slate-700/50 pb-2">Veredito Operacional</h3>
                
                <div className="space-y-3 font-mono text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Posições Necessárias:</span>
                    <span className="font-bold text-slate-100">{manifest.posicoes} <span className="text-[10px] text-slate-500 font-sans font-normal ml-2">(Peso/Volume/Overlap)</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Peso Máx. Estimado (Carga):</span>
                    <span className="font-bold text-emerald-400">{manifest.max_cargo_weight.toLocaleString('pt-BR')} kg <span className="text-[10px] text-slate-500 font-sans font-normal ml-2">(Capacidade Teórica)</span></span>
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

              {manifest.dov_alert && (
                <div className={`rounded-lg p-5 border mb-6 ${manifest.dov_alert.includes('ALERTA') ? 'bg-[#e3004a]/10 border-[#e3004a]/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 ${manifest.dov_alert.includes('ALERTA') ? 'text-[#e3004a]' : 'text-amber-500'}`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Aviso de Despacho (DOV)
                  </h3>
                  <p className={`text-xs font-mono leading-relaxed ${manifest.dov_alert.includes('ALERTA') ? 'text-slate-200 font-bold' : 'text-slate-300'}`}>
                    {manifest.dov_alert}
                  </p>
                </div>
              )}

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
                      max_cargo_weight: manifest.max_cargo_weight,
                      dov_alert: manifest.dov_alert,
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
