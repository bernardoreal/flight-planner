'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Plane, AlertTriangle, CheckCircle, Info, ShieldAlert, FileJson, Search, Loader2, MapPin, Users, Package, Camera, RectangleHorizontal, X, ImagePlus, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { AircraftType, CargoInput, ManifestResult, generateManifest, ULD_SPECS } from '@/lib/cargo-logic';
import { AircraftHoldMap } from '@/components/AircraftHoldMap';
import { ThemeToggle } from '@/components/ThemeToggle';
import { generateLIR, LIRPosition } from '@/lib/generateLIR';
import { NetworkStatus } from '@/components/NetworkStatus';
import { LegalDisclaimerModal } from '@/components/LegalDisclaimerModal';
import { useDataRetention } from '@/hooks/useDataRetention';

// MODELO ESCOLHIDO: Gemini 3 Flash (Recomendado para tarefas de texto/busca)
const AI_MODEL = 'gemini-3-flash-preview';

export default function Home() {
  useDataRetention(); // Enforce LGPD Data Retention Policy

  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false);
  const [palletCount, setPalletCount] = useState<number>(1);

  const [input, setInput] = useState<CargoInput>({
    flightCode: '',
    origin: '',
    destination: '',
    aircraft: 'A320',
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

  const [showJson, setShowJson] = useState(false);
  const [isLoadingFlight, setIsLoadingFlight] = useState(false);
  const [flightError, setFlightError] = useState('');
  const [flightSource, setFlightSource] = useState<'realtime_grounding' | null>(null);
  const [flightDate, setFlightDate] = useState<string>('');
  const [selectedSearchDate, setSelectedSearchDate] = useState<string>('');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState<number | null>(null);
  const [pranchaImages, setPranchaImages] = useState<Record<string, { file: File, preview: string }[]>>({});
  const [expandedPranchaIndex, setExpandedPranchaIndex] = useState<number>(0);
  const [expandedPositionGroup, setExpandedPositionGroup] = useState<number>(1);

  const [isDateInputFocused, setIsDateInputFocused] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);

  // Helper to format date for display
  const formatDateToBR = (isoDate: string) => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    if (!year || !month || !day) return isoDate;
    return `${day}/${month}/${year}`;
  };

  // Derived state for manifest - prevents infinite loops
  const manifest = useMemo(() => {
    return generateManifest({ ...input, flightDate });
  }, [input, flightDate]);

  const togglePrancha = (index: number) => {
    setExpandedPranchaIndex(expandedPranchaIndex === index ? -1 : index);
  };

  const togglePositionGroup = (posNum: number) => {
    setExpandedPositionGroup(expandedPositionGroup === posNum ? 0 : posNum);
  };

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
        const parsed = JSON.parse(savedInput);
        setInput(parsed);
        if (parsed.pranchas) {
          setPalletCount(parsed.pranchas.length);
        }
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
    setSearchProgress(0);
    setFlightError('');
    setInput(prev => ({ ...prev, aiReasoning: undefined }));
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setSearchProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.floor(Math.random() * 10) + 1;
      });
    }, 500);

    try {
      const now = new Date();
      const isoDateTime = now.toISOString();
      const searchDateObj = selectedSearchDate ? new Date(selectedSearchDate + 'T12:00:00') : now;
      const searchDateStr = searchDateObj.toLocaleDateString('pt-BR');
      
      const prompt = `ATUE COMO UM ESPECIALISTA SÊNIOR EM OPERAÇÕES AÉREAS E RASTREAMENTO DE VOOS (FLIGHT DISPATCHER).
      
      Sua missão é descobrir o MODELO EXATO E CONFIRMADO da aeronave para o voo ${input.flightCode} da LATAM Brasil para a data de ${searchDateStr}.
      
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
      
      REGRAS DE SAÍDA:
      - Modelo: Identifique se é A319, A320, A321, B767, B787, B777. Mapeie para "A319", "A320", "A321" ou "OTHER".
      - Origem/Destino: Use os códigos IATA reais (ex: GRU, MIA, LIS).
      - Data: A data do voo retornado (DD/MM/YYYY).
      - CLS (Cargo Loading System): Verifique e informe se a aeronave identificada possui o sistema de carregamento mecanizado (CLS) instalado nos compartimentos 1, 2, 3 e 4.
      
      Responda APENAS com o JSON final no seguinte formato:
      \`\`\`json
      {
        "aircraft": "A321",
        "origin": "GRU",
        "destination": "MIA",
        "date": "${searchDateStr}",
        "clsInfo": "Aeronave equipada com CLS nos compartimentos 1, 2, 3 e 4.",
        "reasoning": "CROSS-CHECK REALIZADO: Encontrado no histórico do FlightRadar24 como aeronave escalada para ${searchDateStr}. Confirmado também no FlightAware."
      }
      \`\`\``;

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY_PIXOR;
      if (!apiKey) {
        throw new Error('A chave de API (NEXT_PUBLIC_GEMINI_API_KEY_PIXOR) não foi encontrada. Verifique as variáveis de ambiente no Cloudflare Pages e faça um novo Deploy.');
      }

      const ai = new GoogleGenAI({ apiKey });
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
        origin: data.origin || prev.origin,
        destination: data.destination || prev.destination,
        aiReasoning: data.reasoning,
        clsInfo: data.clsInfo
      }));
      setFlightDate(data.date || searchDateStr);
      setFlightSource('realtime_grounding');
      setSearchProgress(100);
    } catch (err: any) {
      console.error('Flight fetch error:', err);
      
      setInput(prev => ({
        ...prev,
        aircraft: 'OTHER',
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
      clearInterval(progressInterval);
      setIsLoadingFlight(false);
      setTimeout(() => setSearchProgress(0), 1000);
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

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY_PIXOR;
      if (!apiKey) {
        throw new Error('A chave de API (NEXT_PUBLIC_GEMINI_API_KEY_PIXOR) não foi encontrada. Verifique as variáveis de ambiente no Cloudflare Pages e faça um novo Deploy.');
      }

      const ai = new GoogleGenAI({ apiKey });
      
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

  const handleDownloadLIR = () => {
    // 1. Group pranchas into positions exactly as they should appear on the LIR
    const positions: LIRPosition[] = [];
    let currentWeight = 0;
    let currentCubed = 0;
    let currentGroupPranchas: any[] = [];
    let groupHasOversize = false;

    const finalizeGroup = () => {
      if (currentGroupPranchas.length === 0) return;
      
      positions.push({
        posId: '', // Will be assigned later
        type: input.cargoType === 'LOOSE' ? 'PALLET' : 'ULD',
        tag: currentGroupPranchas.map(p => p.id.substring(0, 6)).join(', ').toUpperCase(),
        weight: Math.round(currentWeight),
        volumes: currentGroupPranchas.reduce((sum, p) => sum + p.volumes, 0),
        remarks: currentGroupPranchas.map(p => p.specialCargoType).filter(t => t && t !== 'NONE').join(', '),
        hasOversize: groupHasOversize
      });
      
      currentWeight = 0;
      currentCubed = 0;
      currentGroupPranchas = [];
      groupHasOversize = false;
    };

    input.pranchas.forEach((prancha) => {
      const cubedWeight = (prancha.length * prancha.width * prancha.height) / 6000;
      
      // Logic for starting a new position
      const wouldOverflow = (currentWeight + prancha.weight > 900) || (currentCubed + cubedWeight > 600);
      const forcedNew = prancha.hasOversize || groupHasOversize;

      if (currentGroupPranchas.length > 0 && (wouldOverflow || forcedNew)) {
        finalizeGroup();
      }

      currentWeight += prancha.weight;
      currentCubed += cubedWeight;
      if (prancha.hasOversize) groupHasOversize = true;
      currentGroupPranchas.push(prancha);

      // Handle individual items that exceed position limits
      while (currentWeight > 900 || currentCubed > 600) {
        const tempWeight = currentWeight;
        const tempCubed = currentCubed;
        const tempPranchas = [...currentGroupPranchas];
        const tempOversize = groupHasOversize;

        // Push a "full" position
        positions.push({
          posId: '',
          type: input.cargoType === 'LOOSE' ? 'PALLET' : 'ULD',
          tag: tempPranchas.map(p => p.id.substring(0, 6)).join(', ').toUpperCase(),
          weight: 900,
          volumes: Math.ceil(tempPranchas.reduce((sum, p) => sum + p.volumes, 0) * (900 / tempWeight)),
          remarks: tempPranchas.map(p => p.specialCargoType).filter(t => t && t !== 'NONE').join(', '),
          hasOversize: tempOversize
        });

        currentWeight = Math.max(0, tempWeight - 900);
        currentCubed = Math.max(0, tempCubed - 600);
        // Keep currentGroupPranchas and groupHasOversize for the remainder
      }
    });

    finalizeGroup();

    // 2. Assign technical 2-digit IDs and split into compartments
    const aircraft = manifest.flight_info.aircraft;
    const fwdPositions: LIRPosition[] = [];
    const aftPositions: LIRPosition[] = [];
    const bulkPositions: LIRPosition[] = [];

    // Helper for labels
    const getLabel = (compartment: number, index: number) => {
        return `${compartment}${index}`;
    };

    let globalPosIdx = 1;
    let currentCompartment = 1;
    let posInCompartment = 1;

    // Determine limits based on fleet config
    const fwdLimit = manifest.allocation.fwd;
    const aftLimit = manifest.allocation.aft;

    positions.forEach((pos, idx) => {
        let label = '';
        const isBulk = idx === positions.length - 1 && manifest.allocation.bulk > 0;

        if (isBulk) {
            label = '51';
            bulkPositions.push({ ...pos, posId: label });
        } else if (globalPosIdx <= fwdLimit) {
            // FWD logic
            if (aircraft.includes('A321')) {
                // A321 FWD: 11, 12, 21, 22, 23
                if (posInCompartment > 2 && currentCompartment === 1) {
                    currentCompartment = 2;
                    posInCompartment = 1;
                }
            } else {
                // A320/A319 FWD: 11, 12, 13, 21...
                if (posInCompartment > 3 && currentCompartment === 1) {
                    currentCompartment = 2;
                    posInCompartment = 1;
                }
            }
            
            label = getLabel(currentCompartment, posInCompartment);
            if (pos.hasOversize) {
                const nextLabel = getLabel(currentCompartment, posInCompartment + 1);
                label = `${label}-${nextLabel}`;
                posInCompartment += 2;
                globalPosIdx += 2;
            } else {
                posInCompartment += 1;
                globalPosIdx += 1;
            }
            fwdPositions.push({ ...pos, posId: label });
        } else {
            // AFT logic
            if (aftPositions.length === 0) {
                currentCompartment = 3;
                posInCompartment = 1;
            }

            if (posInCompartment > 2 && currentCompartment === 3) {
                currentCompartment = 4;
                posInCompartment = 1;
            }

            label = getLabel(currentCompartment, posInCompartment);
            if (pos.hasOversize) {
                const nextLabel = getLabel(currentCompartment, posInCompartment + 1);
                label = `${label}-${nextLabel}`;
                posInCompartment += 2;
                globalPosIdx += 2;
            } else {
                posInCompartment += 1;
                globalPosIdx += 1;
            }
            aftPositions.push({ ...pos, posId: label });
        }
    });

    generateLIR({
      flightCode: manifest.flight_info.code,
      date: manifest.flight_info.date,
      route: manifest.flight_info.route,
      aircraft: manifest.flight_info.aircraft,
      totalWeight: manifest.total_weight,
      fwdPositions,
      aftPositions,
      bulkPositions
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050025] font-sans text-slate-900 dark:text-slate-100 relative overflow-hidden transition-colors duration-300">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 hidden dark:block">
        {/* Deep Branded Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1b0088]/30 via-[#050025] to-[#e3004a]/20"></div>
        
        {/* Large Vibrant Brand Blobs */}
        <div className="absolute -top-[10%] -left-[5%] w-[70%] h-[70%] rounded-full bg-gradient-to-br from-[#1b0088]/40 to-transparent blur-[160px] animate-pulse"></div>
        <div className="absolute top-[10%] -right-[10%] w-[65%] h-[65%] rounded-full bg-gradient-to-bl from-[#e3004a]/35 to-transparent blur-[140px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-[-10%] left-[5%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-[#1b0088]/30 to-transparent blur-[140px] animate-pulse" style={{ animationDelay: '4s' }}></div>
        
        {/* Technical Grid - High contrast on dark */}
        <div className="absolute inset-0 opacity-[0.2]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 0.5px, transparent 0.5px), linear-gradient(90deg, rgba(255,255,255,0.05) 0.5px, transparent 0.5px)', backgroundSize: '50px 50px' }}></div>
        
        {/* Subtle Noise Texture */}
        <div className="absolute inset-0 opacity-[0.08] mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
        
        {/* Soft Radial Vignette */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.6) 100%)' }}></div>
      </div>

      <header className="bg-[#1b0088]/95 backdrop-blur-md border-b border-[#1b0088]/80 shadow-md relative z-20 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-lg">
              <Plane className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-none">LATAM Cargo</h1>
              <p className="text-[10px] font-medium text-white/70 uppercase tracking-widest mt-0.5 hidden sm:block">Global Operations Master</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-white/80 text-sm font-medium">
            <span className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-md border border-white/10 text-[10px] sm:text-xs max-w-[140px] sm:max-w-none">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              <span className="truncate">AI: {AI_MODEL}</span>
            </span>
            <span className="hidden md:flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> QA Certified</span>
            <span className="hidden md:flex items-center gap-1.5"><CheckCircle className="w-4 h-4" /> System Online</span>
            <div className="ml-2 pl-2 border-l border-white/20">
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Input Form */}
        <div className="lg:col-span-6 flex flex-col gap-4 content-start">
          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-md rounded-xl p-6 shadow-2xl border border-slate-200 dark:border-white/5 border-t-4 border-t-[#1b0088]">
            <div className="grid grid-cols-1 gap-8">
              {/* Left Column: Flight Parameters */}
              <div className="flex flex-col h-full">
                <h2 className="text-base font-semibold mb-5 flex items-center gap-2 text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-white/5 pb-3">
                  <Plane className="w-4 h-4 text-[#1b0088]" />
                  Parâmetros do Voo
                </h2>
                
                <div className="mb-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Código do Voo</label>
                      <input
                        type="text"
                        value={input.flightCode}
                        onChange={(e) => setInput({ ...input, flightCode: e.target.value.toUpperCase() })}
                        onKeyDown={(e) => e.key === 'Enter' && handleFetchFlight()}
                        className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all uppercase font-mono"
                        placeholder="Ex: LA3465"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Data do Voo</label>
                      <input
                        type={isDateInputFocused ? 'date' : 'text'}
                        value={isDateInputFocused ? selectedSearchDate : formatDateToBR(selectedSearchDate)}
                        onFocus={() => setIsDateInputFocused(true)}
                        onBlur={() => setIsDateInputFocused(false)}
                        onChange={(e) => setSelectedSearchDate(e.target.value)}
                        placeholder="DD/MM/YYYY"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                      />
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleFetchFlight}
                    disabled={isLoadingFlight || !input.flightCode}
                    className="w-full relative overflow-hidden bg-[#e3004a] hover:bg-[#e3004a]/90 active:scale-[0.98] shadow-lg shadow-[#e3004a]/20 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 group"
                  >
                    {isLoadingFlight && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300 ease-out"
                        style={{ width: `${searchProgress}%` }}
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-2">
                      {isLoadingFlight ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                      <span>{isLoadingFlight ? `Buscando... ${searchProgress}%` : 'Buscar Dados em Tempo Real'}</span>
                    </div>
                  </button>
                  
                  {flightError && (
                    <p className="text-[#EB1453] text-sm mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> {flightError}
                    </p>
                  )}
                </div>

                <div className="relative overflow-hidden bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 mt-auto">
                  {/* Decorative left accent */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${input.aircraft !== 'OTHER' && !flightError ? 'bg-emerald-500' : 'bg-[#e3004a]'}`}></div>

                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pl-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-slate-200 dark:bg-slate-700/50 p-1 rounded border border-slate-300 dark:border-white/10">
                        <Plane className="w-3.5 h-3.5 text-slate-800 dark:text-white" />
                      </div>
                      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Aeronave Detectada</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {flightSource === 'realtime_grounding' && (
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1.5 shadow-sm">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          REAL-TIME
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3 pl-2">
                    <div className="bg-white dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-white/5 flex flex-col justify-between">
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Modelo</p>
                        {input.aircraft !== 'OTHER' && !flightError && (
                          <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded uppercase tracking-wider">Homologada</span>
                        )}
                        {input.aircraft === 'OTHER' && !flightError && (
                          <span className="text-[9px] font-bold text-[#e3004a] bg-[#e3004a]/10 border border-[#e3004a]/20 px-1.5 py-0.5 rounded uppercase tracking-wider">Não Homologada</span>
                        )}
                      </div>
                      <span className={`text-2xl font-mono font-bold tracking-tight ${input.aircraft === 'OTHER' ? 'text-slate-700 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        {input.aircraft === 'OTHER' && flightError ? 'N/A' : input.aircraft}
                      </span>
                    </div>
                  </div>

                  {input.aiReasoning && (
                    <div className="mt-4 p-3 bg-[#1b0088]/10 dark:bg-[#1b0088]/20 border border-[#1b0088]/20 dark:border-[#1b0088]/30 rounded-lg text-[11px] text-slate-600 dark:text-slate-300 flex gap-2">
                      <Info className="w-3.5 h-3.5 text-[#1b0088] shrink-0 mt-0.5" />
                      <p><strong className="text-slate-900 dark:text-white">Auditoria de Dados (Cross-Check):</strong> {input.aiReasoning}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900/60 backdrop-blur-md rounded-xl p-6 shadow-2xl border border-slate-200 dark:border-white/5 border-t-4 border-t-[#e3004a] col-span-1 lg:col-span-2">
            <div className="flex justify-between items-center mb-5 border-b border-slate-200 dark:border-white/5 pb-3">
              <div className="flex items-center gap-4">
                <h2 className="text-base font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                  <ShieldAlert className="w-4 h-4 text-[#1b0088]" />
                  Especificações da Carga
                </h2>

              </div>
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
            
              <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 rounded-xl">
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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
                    className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all"
                  >
                    <option value="LOOSE" className="bg-white dark:bg-slate-900">Carga Solta (Loose)</option>
                    <optgroup label="ULDs (Contêineres/Pallets)" className="bg-white dark:bg-slate-900">
                      {Object.entries(ULD_SPECS)
                        .filter(([key]) => key !== 'NONE')
                        .map(([key, spec]) => (
                          <option key={key} value={`ULD_${key}`} className="bg-white dark:bg-slate-900">
                            {key} - {spec.description}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <div className="mb-4">
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                      {input.cargoType === 'LOOSE' ? 'Quantidade de Pallets' : 'Quantidade de ULDs'}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={palletCount}
                      onChange={(e) => {
                        const count = Math.max(1, Math.min(20, Number(e.target.value)));
                        setPalletCount(count);
                        
                        // Adjust pranchas array to match pallet count
                        const currentPranchas = [...input.pranchas];
                        if (count > currentPranchas.length) {
                          // Add new pallets
                          for (let i = currentPranchas.length; i < count; i++) {
                            currentPranchas.push({
                              id: Math.random().toString(36).substr(2, 9),
                              weight: 100,
                              volumes: 1, // Pallet is treated as 1 volume unit for dimensions
                              length: 120,
                              width: 100,
                              height: 100,
                              hasOversize: false,
                              oversizeVolumes: 0,
                              oversizeWeight: 0
                            });
                          }
                          setExpandedPranchaIndex(count - 1);
                        } else if (count < currentPranchas.length) {
                          // Remove excess
                          currentPranchas.splice(count);
                        }
                        setInput({...input, pranchas: currentPranchas});
                      }}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                    />
                </div>

                <div className="bg-white dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-white/5 shadow-sm mb-4">
                    <p className="text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold mb-1">
                      Resumo da Carga ({input.cargoType === 'LOOSE' ? 'Pallets' : 'ULDs'})
                    </p>
                    <div className="flex justify-between items-end gap-4">
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          {input.cargoType === 'LOOSE' ? 'Peso Real Total' : 'Peso Bruto Total (c/ Tara)'}
                        </span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                          {input.pranchas.reduce((acc, p) => acc + p.weight, 0).toLocaleString('pt-BR')} kg
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">Volumes Totais</span>
                        <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                          {input.pranchas.reduce((acc, p) => acc + p.volumes, 0)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          {input.cargoType === 'LOOSE' ? 'Peso Cubado Total' : 'Peso Volumétrico (Fixo IATA)'}
                        </span>
                        {(() => {
                          let totalCubedWeight = 0;
                          let maxCubedWeight = 0;

                          if (input.cargoType === 'LOOSE') {
                            totalCubedWeight = Math.round(input.pranchas.reduce((acc, p) => {
                              return acc + ((p.length * p.width * p.height) / 6000);
                            }, 0));
                            maxCubedWeight = input.pranchas.length * 600;
                          } else {
                            // ULD Fixed Volumetric Weights (Volume m3 * 166.67 kg/m3)
                            const spec = ULD_SPECS[input.uldType] || ULD_SPECS['AKH'];
                            const fixedWeight = spec.maxCubed;
                            totalCubedWeight = input.pranchas.length * fixedWeight;
                            
                            // For ULDs, max cubed weight is the max gross weight of the ULDs
                            maxCubedWeight = input.pranchas.length * spec.maxWeight;
                          }

                          const cubedWeightPercentage = totalCubedWeight / maxCubedWeight;
                          let cubedWeightColor = "text-indigo-600";
                          let cubedWeightAlert = null;

                          if (input.cargoType === 'LOOSE') {
                            if (cubedWeightPercentage >= 0.9) {
                              cubedWeightColor = "text-red-600";
                              cubedWeightAlert = <span className="text-[10px] text-red-600 font-bold block mt-0.5">⚠️ Limite Crítico (90%+)</span>;
                            } else if (cubedWeightPercentage >= 0.8) {
                              cubedWeightColor = "text-amber-500";
                              cubedWeightAlert = <span className="text-[10px] text-amber-500 font-bold block mt-0.5">⚠️ Atenção (80%+)</span>;
                            }
                          } else {
                            // For ULDs, show if the actual gross weight exceeds the volumetric weight (Dense Cargo)
                            const totalGrossWeight = input.pranchas.reduce((acc, p) => acc + p.weight, 0);
                            if (totalGrossWeight > totalCubedWeight) {
                              cubedWeightColor = "text-emerald-600";
                              cubedWeightAlert = <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">Carga Densa (High Density)</span>;
                            } else {
                              cubedWeightColor = "text-indigo-600";
                              cubedWeightAlert = <span className="text-[10px] text-indigo-500 font-bold block mt-0.5">Carga Volumosa (Low Density)</span>;
                            }
                          }

                          return (
                            <>
                              <span className={`text-lg font-bold ${cubedWeightColor} font-mono`}>
                                {totalCubedWeight.toLocaleString('pt-BR')} kg
                              </span>
                              {cubedWeightAlert}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
              </div>

            <div className="space-y-6">
              {(() => {
                // Bin packing logic for UI grouping
                const groups: { posNum: number, pranchas: any[], totalWeight: number, totalCubed: number, hasOversize: boolean }[] = [];
                let currentPos = 1;
                let currentWeight = 0;
                let currentCubed = 0;
                let currentGroupPranchas: any[] = [];
                let groupHasOversize = false;

                input.pranchas.forEach((prancha, index) => {
                  const cubedWeight = (prancha.length * prancha.width * prancha.height) / 6000;
                  
                  // If adding this prancha exceeds limits, or if this prancha is oversize and we already have items,
                  // or if we already have an oversize item in the group.
                  if (((currentWeight + prancha.weight > 900 || currentCubed + cubedWeight > 600) && (currentWeight > 0 || currentCubed > 0)) ||
                      (prancha.hasOversize && currentGroupPranchas.length > 0) ||
                      (groupHasOversize && currentGroupPranchas.length > 0)) {
                    
                    groups.push({ 
                      posNum: currentPos, 
                      pranchas: currentGroupPranchas, 
                      totalWeight: currentWeight, 
                      totalCubed: currentCubed,
                      hasOversize: groupHasOversize
                    });
                    
                    currentPos += groupHasOversize ? 2 : 1;
                    currentWeight = 0;
                    currentCubed = 0;
                    currentGroupPranchas = [];
                    groupHasOversize = false;
                  }
                  
                  currentWeight += prancha.weight;
                  currentCubed += cubedWeight;
                  if (prancha.hasOversize) groupHasOversize = true;
                  currentGroupPranchas.push({ ...prancha, originalIndex: index });
                  
                  while (currentWeight > 900 || currentCubed > 600) {
                    groups.push({ 
                      posNum: currentPos, 
                      pranchas: currentGroupPranchas, 
                      totalWeight: currentWeight, 
                      totalCubed: currentCubed,
                      hasOversize: groupHasOversize
                    });
                    currentPos += groupHasOversize ? 2 : 1;
                    currentWeight = Math.max(0, currentWeight - 900);
                    currentCubed = Math.max(0, currentCubed - 600);
                    currentGroupPranchas = [];
                    // Reset groupHasOversize if the prancha was split, though usually oversize is a single unit
                    if (currentWeight === 0 && currentCubed === 0) groupHasOversize = false;
                  }
                });

                if (currentGroupPranchas.length > 0) {
                  groups.push({ 
                    posNum: currentPos, 
                    pranchas: currentGroupPranchas, 
                    totalWeight: currentWeight, 
                    totalCubed: currentCubed,
                    hasOversize: groupHasOversize
                  });
                }

                return groups.map((group) => {
                  const isGroupExpanded = expandedPositionGroup === group.posNum;
                  const totalVolumes = group.pranchas.reduce((sum, p) => sum + p.volumes, 0);
                  const specialTypes = Array.from(new Set(group.pranchas.map(p => p.specialCargoType).filter(t => t && t !== 'NONE')));
                  
                  return (
                  <div key={`pos-${group.posNum}`} className={`border-2 border-slate-200 dark:border-white/10 rounded-2xl bg-white dark:bg-slate-900/50 shadow-sm overflow-hidden transition-all ${isGroupExpanded ? 'ring-2 ring-[#1b0088]/20 dark:ring-indigo-500/20' : ''}`}>
                    <div 
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors gap-3"
                      onClick={() => togglePositionGroup(group.posNum)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                        <h2 className={`text-base sm:text-lg font-bold flex items-center gap-2 ${isGroupExpanded ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          <Package className={`w-4 h-4 sm:w-5 h-5 ${isGroupExpanded ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                          {group.hasOversize ? `Posições ${group.posNum} e ${group.posNum + 1}` : `Posição ${group.posNum}`}
                        </h2>
                        {!isGroupExpanded && (
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 sm:ml-4 sm:border-l border-slate-300 dark:border-white/10 sm:pl-4">
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
                              <span>Peso: <strong>{Math.round(group.totalWeight)}kg</strong></span>
                              <span>Cubado: <strong>{Math.round(group.totalCubed)}kg</strong></span>
                              <span>Vols: <strong>{totalVolumes}</strong></span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {specialTypes.map((type) => (
                                <span key={type as string} className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-wider ${
                                  type === 'ICE' ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' :
                                  type === 'DGR' ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' :
                                  type === 'AVI' ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' :
                                  type === 'ELI' ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' :
                                  type === 'WET' ? 'bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800' :
                                  type === 'PER' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' :
                                  type === 'HUM' ? 'bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' :
                                  type === 'VAL' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800' :
                                  'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}>
                                  {type as string}
                                </span>
                              ))}
                              {group.hasOversize && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">
                                  OVS
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                        {isGroupExpanded && (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs font-mono text-slate-500 dark:text-slate-400">
                            <span>Peso: <strong className={group.totalWeight > 900 ? 'text-red-500' : 'text-slate-900 dark:text-white'}>{Math.round(group.totalWeight)}kg</strong> / 900kg</span>
                            <span>Cubado: <strong className={group.totalCubed > 600 ? 'text-red-500' : 'text-slate-900 dark:text-white'}>{Math.round(group.totalCubed)}kg</strong> / 600kg</span>
                          </div>
                        )}
                        {isGroupExpanded ? <ChevronUp className="w-4 h-4 sm:w-5 h-5 text-slate-400" /> : <ChevronDown className="w-4 h-4 sm:w-5 h-5 text-slate-400" />}
                      </div>
                    </div>
                    
                    <motion.div
                      initial={false}
                      animate={{ height: isGroupExpanded ? 'auto' : 0, opacity: isGroupExpanded ? 1 : 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 border-t border-slate-100 dark:border-white/5 space-y-4 mt-2">
                        {group.pranchas.map((prancha) => {
                          const index = prancha.originalIndex;
                          const isExpanded = index === expandedPranchaIndex;
                          return (
                            <div key={prancha.id} className={`border border-slate-200 dark:border-white/5 rounded-xl bg-slate-50 dark:bg-slate-800/40 relative overflow-hidden transition-all ${isExpanded ? 'shadow-2xl ring-1 ring-slate-300 dark:ring-white/10' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}>
                              <div 
                                className="flex justify-between items-center p-4 cursor-pointer select-none"
                                onClick={() => togglePrancha(index)}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    <RectangleHorizontal className={`w-4 h-4 ${isExpanded ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                                    <h3 className={`text-sm font-bold ${isExpanded ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                      {input.cargoType === 'LOOSE' ? 'Pallet' : 'ULD'} {index + 1}
                                    </h3>
                                    {!isExpanded && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400 font-mono ml-2 border-l border-slate-300 dark:border-white/5 pl-2">
                                        {prancha.weight}kg | {prancha.volumes} vol
                                      </span>
                                    )}
                                    
                                    {/* Special Cargo Badges */}
                                    {prancha.specialCargoType && prancha.specialCargoType !== 'NONE' && (
                                      <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        prancha.specialCargoType === 'ICE' ? 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800' :
                                        prancha.specialCargoType === 'DGR' ? 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800' :
                                        prancha.specialCargoType === 'AVI' ? 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800' :
                                        prancha.specialCargoType === 'ELI' ? 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800' :
                                        prancha.specialCargoType === 'WET' ? 'bg-cyan-100 text-cyan-700 border border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800' :
                                        prancha.specialCargoType === 'PER' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' :
                                        prancha.specialCargoType === 'HUM' ? 'bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600' :
                                        prancha.specialCargoType === 'VAL' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800' :
                                        'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                      }`}>
                                        {prancha.specialCargoType}
                                      </span>
                                    )}
                                    
                                    {/* Oversize Badge */}
                                    {prancha.hasOversize && (
                                       <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800">
                                         OVERSIZE
                                       </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {(isExpanded || (pranchaImages[prancha.id] && pranchaImages[prancha.id].length > 0)) && (
                                    <label 
                                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md cursor-pointer hover:bg-indigo-200 transition-colors text-xs font-semibold"
                                      onClick={(e) => e.stopPropagation()}
                                    >
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
                                  )}
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                              </div>

                              <motion.div
                                initial={false}
                                animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 pt-0 border-t border-white/5">
                                  {pranchaImages[prancha.id] && pranchaImages[prancha.id].length > 0 && (
                                    <div className="mb-4 bg-slate-100 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-white/5">
                                      <div className="flex flex-wrap gap-2 mb-3">
                                        {pranchaImages[prancha.id].map((img, imgIdx) => (
                                          <div key={imgIdx} className="relative w-16 h-16 rounded-md overflow-hidden border border-slate-200 dark:border-white/10 group">
                                            <Image 
                                              src={img.preview} 
                                              alt={`Foto ${imgIdx + 1}`} 
                                              width={64}
                                              height={64}
                                              className="w-full h-full object-cover" 
                                              referrerPolicy="no-referrer"
                                            />
                                            <button
                                              onClick={() => handleRemoveImage(prancha.id, imgIdx)}
                                              className="absolute top-0.5 right-0.5 bg-black/50 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ))}
                                        <label className="w-16 h-16 rounded-md border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:text-[#1b0088] dark:hover:text-indigo-400 hover:border-[#1b0088] dark:hover:border-indigo-400 cursor-pointer transition-colors bg-slate-50 dark:bg-slate-900/50">
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
                                        className="w-full bg-[#1b0088] hover:bg-[#1b0088]/90 disabled:bg-slate-700 text-white py-2 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                {input.cargoType === 'LOOSE' ? 'Peso (kg)' : 'Peso Bruto do ULD (kg)'}
                              </label>
                              <input
                                type="number"
                                value={prancha.weight}
                                onChange={(e) => {
                                  const newPranchas = [...input.pranchas];
                                  newPranchas[index].weight = Number(e.target.value);
                                  setInput({...input, pranchas: newPranchas});
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                {input.cargoType === 'LOOSE' ? 'Volumes (Unidades no Pallet)' : 'Volumes (Dentro do ULD)'}
                              </label>
                              <input
                                type="number"
                                value={prancha.volumes}
                                onChange={(e) => {
                                  const newPranchas = [...input.pranchas];
                                  newPranchas[index].volumes = Number(e.target.value);
                                  setInput({...input, pranchas: newPranchas});
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] focus:border-transparent outline-none transition-all font-mono"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                {input.cargoType === 'LOOSE' ? 'Comp. (cm)' : 'Comp. ULD (cm)'}
                              </label>
                              <input
                                type="number"
                                value={prancha.length}
                                onChange={(e) => {
                                  const newPranchas = [...input.pranchas];
                                  newPranchas[index].length = Number(e.target.value);
                                  setInput({...input, pranchas: newPranchas});
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                {input.cargoType === 'LOOSE' ? 'Larg. (cm)' : 'Larg. ULD (cm)'}
                              </label>
                              <input
                                type="number"
                                value={prancha.width}
                                onChange={(e) => {
                                  const newPranchas = [...input.pranchas];
                                  newPranchas[index].width = Number(e.target.value);
                                  setInput({...input, pranchas: newPranchas});
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                                {input.cargoType === 'LOOSE' ? 'Alt. (cm)' : 'Alt. ULD (cm)'}
                              </label>
                              <input
                                type="number"
                                value={prancha.height}
                                onChange={(e) => {
                                  const newPranchas = [...input.pranchas];
                                  newPranchas[index].height = Number(e.target.value);
                                  setInput({...input, pranchas: newPranchas});
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                              />
                            </div>
                          </div>

                          <div className="mb-4">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Carga Especial (Segregação)</label>
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
                              className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all"
                            >
                              <option value="NONE" className="bg-slate-50 dark:bg-slate-900">Nenhuma</option>
                              <option value="ICE" className="bg-slate-50 dark:bg-slate-900">Gelo Seco (ICE)</option>
                              <option value="AVI" className="bg-slate-50 dark:bg-slate-900">Animais Vivos (AVI)</option>
                              <option value="DGR" className="bg-slate-50 dark:bg-slate-900">Carga Perigosa (DGR)</option>
                              <option value="WET" className="bg-slate-50 dark:bg-slate-900">Carga Úmida (WET)</option>
                              <option value="PER" className="bg-slate-50 dark:bg-slate-900">Perecível (PER)</option>
                              <option value="HUM" className="bg-slate-50 dark:bg-slate-900">Restos Mortais (HUM)</option>
                              <option value="VAL" className="bg-slate-50 dark:bg-slate-900">Carga Valiosa (VAL)</option>
                              <option value="ELI" className="bg-slate-50 dark:bg-slate-900">Bateria de ion lítio (ELI)</option>
                            </select>
                            
                            {['ICE', 'DGR', 'AVI', 'HUM', 'ELI'].includes(prancha.specialCargoType || '') && (
                              <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-200 flex items-start gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                                <p><strong className="text-amber-500">Atenção:</strong> Esta carga requer emissão obrigatória de <strong>NOTOC</strong> (Notification to Captain) antes do voo.</p>
                              </div>
                            )}

                    {prancha.specialCargoType === 'ELI' && (
                      <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-200 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                        <p><strong className="text-amber-500">Atenção:</strong> Verificar etiqueta de Bateria de Lítio (Lithium Battery Mark) e limites por volume.</p>
                      </div>
                    )}
                  </div>

                  {prancha.specialCargoType === 'ICE' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
                    >
                      <label className="block text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1.5">Peso Total de Gelo Seco (kg)</label>
                      <input
                        type="number"
                        value={prancha.iceWeight || ''}
                        onChange={(e) => {
                          const newPranchas = [...input.pranchas];
                          newPranchas[index].iceWeight = Number(e.target.value);
                          setInput({...input, pranchas: newPranchas});
                        }}
                        placeholder="Ex: 50"
                        className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                      />
                    </motion.div>
                  )}

                  {prancha.specialCargoType === 'DGR' && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5">Classe DGR</label>
                          <select
                            value={prancha.dgrClass || ''}
                            onChange={(e) => {
                              const newPranchas = [...input.pranchas];
                              newPranchas[index].dgrClass = e.target.value;
                              setInput({...input, pranchas: newPranchas});
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                          >
                            <option value="" className="bg-slate-50 dark:bg-slate-900">Selecione...</option>
                            <option value="1" className="bg-slate-50 dark:bg-slate-900">Classe 1 - Explosivos</option>
                            <option value="2.1" className="bg-slate-50 dark:bg-slate-900">Classe 2.1 - Gás Inflamável</option>
                            <option value="2.2" className="bg-slate-50 dark:bg-slate-900">Classe 2.2 - Gás Não Inflamável</option>
                            <option value="2.3" className="bg-slate-50 dark:bg-slate-900">Classe 2.3 - Gás Tóxico</option>
                            <option value="3" className="bg-slate-50 dark:bg-slate-900">Classe 3 - Líquidos Inflamáveis</option>
                            <option value="4.1" className="bg-slate-50 dark:bg-slate-900">Classe 4.1 - Sólidos Inflamáveis</option>
                            <option value="4.2" className="bg-slate-50 dark:bg-slate-900">Classe 4.2 - Combustão Espontânea</option>
                            <option value="4.3" className="bg-slate-50 dark:bg-slate-900">Classe 4.3 - Perigoso Quando Molhado</option>
                            <option value="5.1" className="bg-slate-50 dark:bg-slate-900">Classe 5.1 - Oxidante</option>
                            <option value="5.2" className="bg-slate-50 dark:bg-slate-900">Classe 5.2 - Peróxido Orgânico</option>
                            <option value="6.1" className="bg-slate-50 dark:bg-slate-900">Classe 6.1 - Tóxico</option>
                            <option value="6.2" className="bg-slate-50 dark:bg-slate-900">Classe 6.2 - Substância Infecciosa</option>
                            <option value="7" className="bg-slate-50 dark:bg-slate-900">Classe 7 - Radioativo</option>
                            <option value="8" className="bg-slate-50 dark:bg-slate-900">Classe 8 - Corrosivo</option>
                            <option value="9" className="bg-slate-50 dark:bg-slate-900">Classe 9 - Miscelânea</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5">Grupo de Embalagem</label>
                          <select
                            value={prancha.dgrPackingGroup || 'N/A'}
                            onChange={(e) => {
                              const newPranchas = [...input.pranchas];
                              newPranchas[index].dgrPackingGroup = e.target.value as any;
                              setInput({...input, pranchas: newPranchas});
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-800/50 p-2.5 text-sm rounded-lg border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all"
                          >
                            <option value="N/A" className="bg-slate-50 dark:bg-slate-900">N/A</option>
                            <option value="I" className="bg-slate-50 dark:bg-slate-900">I (Alto Perigo)</option>
                            <option value="II" className="bg-slate-50 dark:bg-slate-900">II (Médio Perigo)</option>
                            <option value="III" className="bg-slate-50 dark:bg-slate-900">III (Baixo Perigo)</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div className="pt-2">
                    <label className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-white/5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors bg-slate-50 dark:bg-slate-800/40">
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
                        className="w-4 h-4 text-[#1b0088] rounded focus:ring-[#1b0088] bg-white dark:bg-slate-700 border-slate-300 dark:border-white/10" 
                      />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Contém itens Oversize (Requer Overlap Físico)</span>
                    </label>
                    
                    {prancha.hasOversize && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 p-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-white/5"
                      >
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Qtd. Vols Oversize</label>
                            <input
                              type="number"
                              value={prancha.oversizeVolumes}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeVolumes = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              min="1"
                              className="w-full bg-white dark:bg-slate-900/50 p-2.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Peso Oversize (kg)</label>
                            <input
                              type="number"
                              value={prancha.oversizeWeight}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeWeight = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              min="1"
                              className="w-full bg-white dark:bg-slate-900/50 p-2.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Comp. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeLength || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeLength = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full bg-white dark:bg-slate-900/50 p-2.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Larg. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeWidth || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeWidth = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full bg-white dark:bg-slate-900/50 p-2.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1.5">Alt. (cm)</label>
                            <input
                              type="number"
                              value={prancha.oversizeHeight || ''}
                              onChange={(e) => {
                                const newPranchas = [...input.pranchas];
                                newPranchas[index].oversizeHeight = Number(e.target.value);
                                setInput({...input, pranchas: newPranchas});
                              }}
                              className="w-full bg-white dark:bg-slate-900/50 p-2.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#1b0088] outline-none transition-all font-mono"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                    </div>
                  </motion.div>
                </div>
                        );
                      })}
                      </div>
                    </motion.div>
                  </div>
                );
              })})()}
            </div>
          </div>
        </div>

        {/* Output Manifest */}
        <div className="lg:col-span-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-900/60 backdrop-blur-md rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-white/5 border-t-4 border-t-[#e3004a]"
          >
            {/* Header Bar */}
            <div className="bg-slate-100 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 tracking-widest uppercase">
                  Manifesto Técnico
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {(manifest.status === 'OK' || manifest.status === 'ALERTA') && (
                  <button 
                    onClick={handleDownloadLIR}
                    className="flex items-center gap-2 px-3 py-1.5 bg-[#1b0088] hover:bg-[#1b0088]/90 text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg shadow-[#1b0088]/20 group"
                  >
                    <FileText className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    Gerar LIR Dnata/LATAM
                  </button>
                )}
                <div className={`px-3 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  manifest.status === 'OK' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                  manifest.status === 'ALERTA' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  'bg-[#e3004a]/10 text-[#e3004a] border-[#e3004a]/20'
                }`}>
                  {manifest.status}
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 text-slate-700 dark:text-slate-200">

              {/* Status Banner */}
              <div className={`mb-6 p-4 rounded-xl border flex items-center gap-4 ${
                manifest.status === 'OK' ? 'bg-emerald-500/10 border-emerald-500/20' :
                manifest.status === 'ALERTA' ? 'bg-amber-500/10 border-amber-500/20' :
                'bg-[#e3004a]/10 border-[#e3004a]/20'
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  manifest.status === 'OK' ? 'bg-emerald-500 text-white' :
                  manifest.status === 'ALERTA' ? 'bg-amber-500 text-white' :
                  'bg-[#e3004a] text-white'
                }`}>
                  {manifest.status === 'OK' ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${
                    manifest.status === 'OK' ? 'text-emerald-600 dark:text-emerald-400' :
                    manifest.status === 'ALERTA' ? 'text-amber-600 dark:text-amber-400' :
                    'text-[#e3004a]'
                  }`}>
                    {manifest.status === 'OK' ? 'MANIFESTO APROVADO' :
                     manifest.status === 'ALERTA' ? 'APROVADO COM RESTRIÇÕES' :
                     'MANIFESTO REJEITADO'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {manifest.status === 'OK' ? 'Voo liberado para despacho operacional.' :
                     manifest.status === 'ALERTA' ? 'Requer atenção do Supervisor/DOV. Verifique os avisos abaixo.' :
                     'Violação de parâmetros críticos de segurança. Embarque proibido.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-4 border border-slate-200 dark:border-white/5">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Voo / Rota / Aeronave</p>
                  <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">{manifest.flight_info.code} <span className="text-slate-400 dark:text-slate-700">|</span> {manifest.flight_info.route}</p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">{manifest.flight_info.aircraft} <span className="text-slate-400 dark:text-slate-700">|</span> <span className="text-emerald-500 dark:text-emerald-400">{manifest.flight_info.date}</span></p>
                  {manifest.clsInfo && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/5 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-mono text-blue-600 dark:text-blue-300 leading-relaxed">{manifest.clsInfo}</p>
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-4 border border-slate-200 dark:border-white/5">
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">Estabilidade</p>
                  <p className={`text-sm font-mono font-bold ${manifest.stability.includes('ALERTA') ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                    {manifest.stability}
                  </p>
                </div>
              </div>

              {/* Door Check Section */}
              {manifest.door_checks && manifest.door_checks.length > 0 && (
                <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 rounded-lg p-4 border border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                      <RectangleHorizontal className="w-3.5 h-3.5" /> Verificação de Porta (Door Check)
                    </p>
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      Porta: {manifest.door_checks[0].doorDims.w}x{manifest.door_checks[0].doorDims.h}cm
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {manifest.door_checks.map((check, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-2 rounded border ${check.passed ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${check.passed ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <div>
                            <p className="text-xs font-mono text-slate-300 dark:text-slate-400">
                              <span className="text-slate-500 dark:text-slate-500 mr-2">#{check.pranchaIndex}</span>
                              {check.pieceDims.join('x')}cm
                            </p>
                            {!check.passed && (
                              <p className="text-[10px] text-red-400 mt-0.5">
                                Menores dimensões ({check.sortedDims[0]}x{check.sortedDims[1]}) excedem porta.
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${check.passed ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                            {check.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AircraftHoldMap 
                aircraft={manifest.flight_info.aircraft} 
                allocation={manifest.allocation} 
                details={manifest.allocationDetails}
              />

              {manifest.cubage_alert && (
                <div className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/30 mb-6 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1">Alerta de Cubagem</h4>
                    <p className="text-xs font-mono text-amber-700 dark:text-amber-200/80 leading-relaxed">
                      O volume total da carga excede a capacidade padrão do porão. Há um alto risco de corte de carga por falta de espaço físico, mesmo que o peso esteja dentro dos limites.
                    </p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-800/30 rounded-lg p-5 border border-slate-200 dark:border-white/5 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-4 border-b border-slate-200 dark:border-white/5 pb-2">Veredito Operacional</h3>
                
                <div className="space-y-3 font-mono text-xs sm:text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Posições Necessárias:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{manifest.posicoes} <span className="text-[10px] text-slate-500 dark:text-slate-500 font-sans font-normal ml-1 sm:ml-2">(Peso/Volume/Overlap)</span></span>
                  </div>
                  <div className="flex flex-col gap-1 pt-2 pb-2 border-y border-slate-200 dark:border-white/5">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                      <span className="text-slate-600 dark:text-slate-400">Capacidade de Peso (Carga):</span>
                      <span className={`font-bold ${manifest.weight_usage_percent >= 0.9 ? 'text-[#e3004a]' : manifest.weight_usage_percent >= 0.8 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {manifest.total_weight.toLocaleString('pt-BR')} / {manifest.max_cargo_weight.toLocaleString('pt-BR')} kg
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                      <div 
                        className={`h-full transition-all duration-500 ${manifest.weight_usage_percent >= 0.9 ? 'bg-[#e3004a]' : manifest.weight_usage_percent >= 0.8 ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, manifest.weight_usage_percent * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Utilizado: {Math.round(manifest.weight_usage_percent * 100)}%</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Livre: {manifest.available_weight.toLocaleString('pt-BR')} kg</span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Alocação Sugerida:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {manifest.allocation.fwd} FWD / {manifest.allocation.aft} AFT / {manifest.allocation.bulk} BULK
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Disponibilidade Líquida:</span>
                    <span className={`font-bold ${manifest.netAvailability < 0 ? 'text-[#e3004a]' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {manifest.netAvailability} Posições Restantes
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start pt-2 border-t border-slate-200 dark:border-white/5 gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Impacto CG (Qualitativo):</span>
                    <span className="text-emerald-600 dark:text-emerald-400 sm:text-right sm:max-w-[60%] text-[10px] sm:text-xs">{manifest.cg_impact}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start pt-2 border-t border-slate-200 dark:border-white/5 gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Fuel Penalty:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 sm:text-right sm:max-w-[60%] text-[10px] sm:text-xs">{manifest.fuel_penalty}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start pt-2 border-t border-slate-200 dark:border-white/5 gap-1">
                    <span className="text-slate-600 dark:text-slate-400">Otimização ESG:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 sm:text-right sm:max-w-[60%] text-[10px] sm:text-xs">{manifest.esg_impact}</span>
                  </div>
                </div>
              </div>

              {manifest.dov_alert && (
                <div className={`rounded-lg p-5 border mb-6 ${manifest.dov_alert.includes('ALERTA') ? 'bg-[#e3004a]/10 border-[#e3004a]/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                  <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 ${manifest.dov_alert.includes('ALERTA') ? 'text-[#e3004a]' : 'text-amber-600 dark:text-amber-500'}`}>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Aviso de Despacho (DOV)
                  </h3>
                  <p className={`text-xs font-mono leading-relaxed ${manifest.dov_alert.includes('ALERTA') ? 'text-slate-700 dark:text-slate-200 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
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
                        <span className="text-slate-700 dark:text-slate-300 leading-relaxed font-bold">{alert}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {manifest.calculationBreakdown && (
                <div className="bg-slate-100 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-white/5 mb-6">
                   <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-3 flex items-center gap-2">
                      <RectangleHorizontal className="w-3.5 h-3.5" />
                      Detalhamento do Cálculo de Posições
                   </h4>
                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className={`p-3 rounded border flex flex-col justify-between ${manifest.calculationBreakdown.limitingFactor === 'WEIGHT' ? 'bg-[#1b0088]/10 dark:bg-[#1b0088]/20 border-[#1b0088]/30 dark:border-[#1b0088]/40' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5'}`}>
                         <div>
                           <span className={`block text-[9px] uppercase font-bold tracking-wider mb-1 ${manifest.calculationBreakdown.limitingFactor === 'WEIGHT' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>Peso Real</span>
                           <span className={`block font-mono font-bold text-sm ${manifest.calculationBreakdown.limitingFactor === 'WEIGHT' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                             {manifest.calculationBreakdown.totalRealWeight.toLocaleString('pt-BR')} kg
                           </span>
                         </div>
                         <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/5">
                           <span className={`block text-[10px] font-mono ${manifest.calculationBreakdown.limitingFactor === 'WEIGHT' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>
                             Requer <strong className={manifest.calculationBreakdown.limitingFactor === 'WEIGHT' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>{manifest.calculationBreakdown.totalRealPos}</strong> pos
                           </span>
                         </div>
                      </div>
                      
                      <div className={`p-3 rounded border flex flex-col justify-between ${manifest.calculationBreakdown.limitingFactor === 'CUBAGE' ? 'bg-[#1b0088]/10 dark:bg-[#1b0088]/20 border-[#1b0088]/30 dark:border-[#1b0088]/40' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5'}`}>
                         <div>
                           <span className={`block text-[9px] uppercase font-bold tracking-wider mb-1 ${manifest.calculationBreakdown.limitingFactor === 'CUBAGE' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>Peso Cubado</span>
                           <span className={`block font-mono font-bold text-sm ${manifest.calculationBreakdown.limitingFactor === 'CUBAGE' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                             {Math.round(manifest.calculationBreakdown.totalCubedWeight).toLocaleString('pt-BR')} kg
                           </span>
                         </div>
                         <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/5">
                           <span className={`block text-[10px] font-mono ${manifest.calculationBreakdown.limitingFactor === 'CUBAGE' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>
                             Requer <strong className={manifest.calculationBreakdown.limitingFactor === 'CUBAGE' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>{manifest.calculationBreakdown.totalCubedPos}</strong> pos
                           </span>
                         </div>
                      </div>
                      
                      <div className={`p-3 rounded border flex flex-col justify-between ${manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' ? 'bg-[#1b0088]/10 dark:bg-[#1b0088]/20 border-[#1b0088]/30 dark:border-[#1b0088]/40' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5'}`}>
                         <div>
                           <span className={`block text-[9px] uppercase font-bold tracking-wider mb-1 ${manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>Oversize / Overlap</span>
                           <span className={`block font-mono font-bold text-sm ${manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                             {manifest.calculationBreakdown.oversizePos > 0 ? 'Mín. 2 pos por item' : 'Nenhuma restrição'}
                           </span>
                         </div>
                         <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/5">
                           <span className={`block text-[10px] font-mono ${manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' ? 'text-[#1b0088] dark:text-indigo-400' : 'text-slate-500'}`}>
                             Requer <strong className={manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}>{manifest.calculationBreakdown.oversizePos}</strong> pos
                           </span>
                         </div>
                      </div>
                   </div>
                   
                   <div className="mt-3 pt-3 border-t border-slate-200 dark:border-white/5 flex justify-between items-center">
                      <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Fator Limitante:</span>
                      <span className="text-xs font-bold text-[#1b0088] dark:text-indigo-400 font-mono uppercase">
                        {manifest.calculationBreakdown.limitingFactor === 'WEIGHT' && 'PESO REAL'}
                        {manifest.calculationBreakdown.limitingFactor === 'CUBAGE' && 'PESO CUBADO (VOLUME)'}
                        {manifest.calculationBreakdown.limitingFactor === 'OVERSIZE' && 'RESTRIÇÃO OVERSIZE'}
                        {manifest.calculationBreakdown.limitingFactor === 'MINIMUM' && 'MÍNIMO OPERACIONAL (1 POS)'}
                      </span>
                   </div>
                </div>
              )}

              {manifest.warnings.length > 0 && (
                <div className="bg-amber-500/5 rounded-lg p-5 border border-amber-500/20 mb-6">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500 mb-3 flex items-center gap-2">
                    <Info className="w-3.5 h-3.5" />
                    Avisos Operacionais
                  </h3>
                  <ul className="space-y-2">
                    {manifest.warnings.map((warning, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs font-mono">
                        <span className="text-amber-500 mt-0.5">{'>'}</span>
                        <span className="text-slate-700 dark:text-slate-300 leading-relaxed">{warning}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between pt-5 border-t border-slate-200 dark:border-white/5">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowJson(!showJson)}
                    className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded transition-colors border border-slate-200 dark:border-white/5"
                  >
                    {showJson ? 'OCULTAR_JSON' : 'VER_JSON_API'}
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Assinatura Digital</p>
                  <div className="w-32 h-px bg-slate-200 dark:bg-white/10 mt-2 ml-auto"></div>
                </div>
              </div>

              {showJson && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 bg-slate-50 dark:bg-[#020617] rounded-lg p-4 overflow-x-auto border border-slate-200 dark:border-white/5"
                >
                  <pre className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400/80">
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

              <div className="mt-6 bg-slate-100 dark:bg-slate-800/30 rounded-lg p-3 border border-slate-200 dark:border-white/5 flex items-start gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                  <strong className="text-slate-700 dark:text-slate-300">AVISO:</strong> Validação estruturada para integração via Next.js. Não substitui manuais oficiais.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="bg-slate-200 dark:bg-slate-900 border-t-4 border-[#e3004a] py-8 mt-auto relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-[#e3004a]/10 p-2 rounded-lg">
                 <ShieldAlert className="w-6 h-6 text-[#e3004a]" />
              </div>
              <div>
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">LATAM Cargo Operations</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Build-up Optimization Tool</span>
              </div>
            </div>
            <div className="text-sm text-slate-700 dark:text-slate-300 text-left md:text-right max-w-3xl leading-relaxed">
              <p className="mb-2">
                <strong className="text-[#e3004a] uppercase font-bold">Aviso Legal Importante:</strong> Esta aplicação é uma ferramenta de apoio à decisão.
                Os resultados são estimativas baseadas em IA.
              </p>
              <p className="font-semibold text-slate-900 dark:text-white mb-2">
                O uso desta ferramenta NÃO substitui os sistemas oficiais de peso e balanceamento (Lido/Flight, NetLine/Load) nem os manuais operacionais aprovados pela LATAM e homologados pela ANAC.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A validação final e a segurança do voo são de responsabilidade exclusiva do Despachante Operacional de Voo (DOV) e do Supervisor de Carga.
              </p>
            </div>
          </div>
        </div>
      </footer>
      <NetworkStatus />
      {!isDisclaimerAccepted && (
        <LegalDisclaimerModal onAccept={() => setIsDisclaimerAccepted(true)} />
      )}
    </div>
  );
}
