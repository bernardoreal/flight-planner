export type AircraftType = 'A319' | 'A320' | 'A321' | 'OTHER';

export interface Prancha {
  id: string;
  weight: number;
  volumes: number;
  length: number;
  width: number;
  height: number;
  hasOversize: boolean;
  oversizeVolumes: number;
  oversizeWeight: number;
  oversizeLength?: number;
  oversizeWidth?: number;
  oversizeHeight?: number;
  specialCargoType?: 'NONE' | 'ICE' | 'AVI' | 'DGR' | 'WET' | 'PER' | 'HUM' | 'VAL' | 'ELI';
  iceWeight?: number;
  dgrClass?: string;
  dgrPackingGroup?: 'I' | 'II' | 'III' | 'N/A';
}

export interface CargoInput {
  flightCode: string;
  origin: string;
  destination: string;
  aircraft: AircraftType;
  flightDate?: string;
  aiReasoning?: string;
  clsInfo?: string;
  pranchas: Prancha[];
  isICE: boolean;
  isAVI: boolean;
  isDGR: boolean;
  isWET: boolean;
  isHUM: boolean;
  cargoType: 'LOOSE' | 'ULD';
  uldType: 'AKH' | 'AKE' | 'PKC' | 'NONE';
  dgrTypes: string[]; // 'ICE', 'AVI', 'LITHIUM_BULK', 'LITHIUM_EQUIP', 'FLAM', 'EXPLOSIVE', 'GAS', 'TOXIC', 'RADIOACTIVE'
}

export interface CalculationBreakdown {
  totalRealWeight: number;
  totalRealPos: number;
  totalCubedWeight: number;
  totalCubedPos: number;
  oversizePos: number;
  finalPos: number;
  limitingFactor: 'WEIGHT' | 'CUBAGE' | 'OVERSIZE' | 'MINIMUM';
}

export interface DoorCheck {
  pranchaId: string;
  pranchaIndex: number;
  passed: boolean;
  pieceDims: [number, number, number]; // L, W, H
  sortedDims: [number, number, number]; // Smallest to Largest
  doorDims: { w: number, h: number };
  message: string;
}

export interface ManifestResult {
  flight_info: {
    code: string;
    route: string;
    aircraft: string;
    date: string;
  };
  status: 'OK' | 'ALERTA' | 'REJEITADO';
  posicoes: number;
  esg_impact: string;
  co2_emissions: number;
  fuel_penalty: string;
  warnings: string[];
  dgr_alerts: string[];
  door_checks: DoorCheck[];
  cg_impact: string;
  cubage_alert: boolean;
  validation_code: string;
  json_valid: boolean;
  
  // Extra fields for UI
  stability: string;
  netAvailability: number;
  clsInfo?: string;
  allocation: {
    fwd: number;
    aft: number;
    bulk: number;
  };
  max_cargo_weight: number;
  dov_alert: string;
  calculationBreakdown?: CalculationBreakdown;
}

const FLEET_CONFIG = {
  'A319': { totalPos: 4, bagsPos: 2, cargoMax: 2, iceLimit: 120, hasBulk: false, uldMax: 0, doorDims: { w: 181, h: 124 } },
  'A320': { totalPos: 7, bagsPos: 3, cargoMax: 4, iceLimit: 200, hasBulk: true, uldMax: 7, doorDims: { w: 181, h: 124 } },
  'A321': { totalPos: 10, bagsPos: 3, cargoMax: 7, iceLimit: 200, hasBulk: true, uldMax: 10, doorDims: { w: 181, h: 124 } },
  'OTHER': { totalPos: 0, bagsPos: 0, cargoMax: 0, iceLimit: 0, hasBulk: false, uldMax: 0, doorDims: { w: 0, h: 0 } }
};

export function generateManifest(input: CargoInput): ManifestResult {
  const validation_code = `PYTHON_HASH_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  
  // 1. Basic Validation
  if (input.aircraft === 'OTHER') {
    return {
      flight_info: {
        code: input.flightCode || 'LA0000',
        route: `${(input.origin || 'XXX').toUpperCase()} - ${(input.destination || 'XXX').toUpperCase()}`,
        aircraft: input.aircraft,
        date: input.flightDate || 'DD/MM/YYYY'
      },
      status: 'REJEITADO',
      posicoes: 0,
      esg_impact: 'N/A',
      co2_emissions: 0,
      fuel_penalty: 'N/A',
      warnings: ['CRÍTICO: Aeronave não homologada para este sistema.'],
      dgr_alerts: [],
      door_checks: [],
      cg_impact: 'N/A',
      cubage_alert: false,
      validation_code,
      json_valid: true,
      stability: 'N/A',
      netAvailability: 0,
      clsInfo: input.clsInfo,
      allocation: { fwd: 0, aft: 0, bulk: 0 },
      max_cargo_weight: 0,
      dov_alert: ''
    };
  }

  const config = FLEET_CONFIG[input.aircraft];
  
  // 3. Physical Constraints, Cubage & Positions
  let cubage_alert = false;
  let posicoes = 0;
  let totalCubedPos = 0;
  let totalWeightPos = 0;
  let calculationBreakdown: CalculationBreakdown | undefined;
  let status: 'OK' | 'ALERTA' | 'REJEITADO' = 'OK';
  const warnings: string[] = [];
  const dgr_alerts: string[] = [];
  const door_checks: DoorCheck[] = [];
  
  const totalWeight = input.pranchas.reduce((sum, p) => sum + p.weight, 0);
  const totalVolumes = input.pranchas.reduce((sum, p) => sum + p.volumes, 0);
  
  // Rule 1: Barrow/Container Limit or ULD Limit
  if (input.cargoType === 'ULD') {
    let uldTare = 0;
    let uldMaxWeight = 0;
    
    if (input.uldType === 'AKH') {
      uldTare = 85;
      uldMaxWeight = 1134;
    } else if (input.uldType === 'AKE') {
      uldTare = 75;
      uldMaxWeight = 1588;
      if (input.aircraft === 'A319' || input.aircraft === 'A320' || input.aircraft === 'A321') {
        warnings.push('CRÍTICO: AKE não é compatível com o sistema de carregamento (Cargo Loading System) da família A320. Use AKH.');
        status = 'REJEITADO';
      }
    } else if (input.uldType === 'PKC') {
      uldTare = 120;
      uldMaxWeight = 1500;
    } else {
      uldTare = 85; // Default to AKH
      uldMaxWeight = 1134;
    }
    
    const weightPos = Math.ceil((totalWeight + uldTare) / uldMaxWeight);
    posicoes = Math.max(weightPos, input.pranchas.length); // Assuming 1 ULD = 1 prancha entry
    if (posicoes > config.uldMax) {
      warnings.push(`CRÍTICO: Limite de ULDs excedido para ${input.aircraft} (Max: ${config.uldMax} ${input.uldType}).`);
      status = 'REJEITADO';
    }
  } else {
    // LOOSE CARGO:
    let totalLooseWeight = 0;
    let totalLooseCubedWeight = 0;
    let maxOversizePos = 0;

    input.pranchas.forEach((p, index) => {
      const pranchaNum = index + 1;
      
      totalLooseWeight += p.weight;

      // Cálculo do peso cubado (Fator de conversão: (C x L x A) / 6000)
      const cubedWeight = (p.length * p.width * p.height) / 6000;
      totalLooseCubedWeight += cubedWeight;
      
      // Se for um único volume indivisível e for muito comprido, ele vai dar overlap físico inevitável
      if (p.volumes === 1 && p.length > 150) {
        const lengthPos = Math.ceil(p.length / 150);
        if (lengthPos > maxOversizePos) {
           maxOversizePos = lengthPos; // Mantém o maior overlap físico necessário
           warnings.push(`INFO (Prancha ${pranchaNum}): Volume único longo detectado (${p.length}cm). Requer espaço físico contínuo de ${lengthPos} posições.`);
        }
      }

      // Tratamento de Overlap Explícito (Oversize)
      if (p.hasOversize && p.oversizeVolumes > 0) {
        const oversizeLength = p.oversizeLength || 200;
        const positionsPerOversize = Math.ceil(oversizeLength / 150);
        
        if (positionsPerOversize > maxOversizePos) {
          maxOversizePos = positionsPerOversize;
          warnings.push(`INFO (Prancha ${pranchaNum}): Overlap explícito detectado. Item oversize bloqueando ${positionsPerOversize} posições físicas.`);
        }
      }
      
      if (p.height > 114) {
        warnings.push(`CRÍTICO (Prancha ${pranchaNum}): Altura máxima excedida (114cm).`);
        status = 'REJEITADO';
      }
      
      if (p.width > 145) {
        warnings.push(`AVISO (Prancha ${pranchaNum}): Base Width > 145cm. Requer verificação de compatibilidade.`);
        if (status !== 'REJEITADO') status = 'ALERTA';
      }
      
      if (p.length > 220) {
        warnings.push(`AVISO (Prancha ${pranchaNum}): Comprimento > 220cm. Requer amarração especial.`);
        if (status !== 'REJEITADO') status = 'ALERTA';
      }

      // Door Dimension Check (Tipping Check)
      // Sort dimensions to find the smallest two (which must pass through the door)
      const dims = [p.length, p.width, p.height].sort((a, b) => a - b);
      const minDim = dims[0];
      const midDim = dims[1];
      
      // Check against door dimensions (considering rotation)
      // Door is W x H. Cargo must fit either W x H or H x W.
      // Usually, minDim must be < DoorHeight and midDim < DoorWidth
      // OR minDim < DoorWidth and midDim < DoorHeight
      const fitsDoor = (minDim < config.doorDims.h && midDim < config.doorDims.w) || 
                       (minDim < config.doorDims.w && midDim < config.doorDims.h);

      door_checks.push({
        pranchaId: p.id,
        pranchaIndex: pranchaNum,
        passed: fitsDoor,
        pieceDims: [p.length, p.width, p.height],
        sortedDims: [minDim, midDim, dims[2]],
        doorDims: config.doorDims,
        message: fitsDoor ? 'OK' : `Dimensões excedem a porta (${config.doorDims.w}x${config.doorDims.h}cm)`
      });

      if (!fitsDoor && input.aircraft !== 'OTHER') {
         warnings.push(`CRÍTICO (Prancha ${pranchaNum}): Dimensões excedem a porta de carga (${config.doorDims.w}x${config.doorDims.h}cm). Risco de não embarque.`);
         status = 'REJEITADO';
      }
      
      // Floor load calculation (kg/m² and kg/inch)
      const areaM2 = (p.length / 100) * (p.width / 100);
      const floorLoadArea = areaM2 > 0 ? p.weight / areaM2 : 0;
      
      // Running load (kg/inch) - Airbus WBM standard check
      const lengthInches = p.length / 2.54;
      const runningLoad = lengthInches > 0 ? p.weight / lengthInches : 0;
      
      if (floorLoadArea > 732) { // Airbus standard area load limit
        warnings.push(`CRÍTICO (Prancha ${pranchaNum}): Limite de Area Load excedido (${Math.round(floorLoadArea)} kg/m² > 732 kg/m²). Necessário uso de pranchas de distribuição (Shoring).`);
        if (status !== 'REJEITADO') status = 'ALERTA';
      }
      
      if (runningLoad > 26.8) { // Airbus standard running load limit (approx 1500 lb/ft)
        warnings.push(`CRÍTICO (Prancha ${pranchaNum}): Limite de Running Load excedido (${runningLoad.toFixed(1)} kg/inch). Risco estrutural ao piso do porão.`);
        status = 'REJEITADO';
      }
    });

    // Cálculo final de posições baseado nos TOTAIS (Agregação)
    const totalWeightPos = Math.ceil(totalLooseWeight / 900);
    const totalCubedPosCalc = Math.ceil(totalLooseCubedWeight / 600);
    
    // A quantidade de posições é definida pelo maior limitante: Peso Real, Peso Cubado ou Restrição Física (Oversize)
    // Garante no mínimo 1 posição se houver carga
    posicoes = Math.max(totalWeightPos, totalCubedPosCalc, maxOversizePos, input.pranchas.length > 0 ? 1 : 0);
    
    totalCubedPos = totalCubedPosCalc; // Para uso no alerta de cubagem global

    let limitingFactor: 'WEIGHT' | 'CUBAGE' | 'OVERSIZE' | 'MINIMUM' = 'MINIMUM';
    if (posicoes === totalWeightPos && totalWeightPos > totalCubedPosCalc && totalWeightPos > maxOversizePos) {
        limitingFactor = 'WEIGHT';
    } else if (posicoes === totalCubedPosCalc && totalCubedPosCalc > totalWeightPos && totalCubedPosCalc > maxOversizePos) {
        limitingFactor = 'CUBAGE';
    } else if (posicoes === maxOversizePos && maxOversizePos > totalWeightPos && maxOversizePos > totalCubedPosCalc) {
        limitingFactor = 'OVERSIZE';
    } else if (posicoes === 1 && input.pranchas.length > 0) {
        limitingFactor = 'MINIMUM';
    } else {
        // Tie-breaker or default
        if (posicoes === totalWeightPos) limitingFactor = 'WEIGHT';
        else if (posicoes === totalCubedPosCalc) limitingFactor = 'CUBAGE';
        else if (posicoes === maxOversizePos) limitingFactor = 'OVERSIZE';
    }

    calculationBreakdown = {
        totalRealWeight: totalLooseWeight,
        totalRealPos: totalWeightPos,
        totalCubedWeight: totalLooseCubedWeight,
        totalCubedPos: totalCubedPosCalc,
        oversizePos: maxOversizePos,
        finalPos: posicoes,
        limitingFactor
    };

    if (limitingFactor === 'WEIGHT') {
        warnings.push(`INFO: Alocação definida pelo Peso Real.`);
    } else if (limitingFactor === 'CUBAGE') {
        warnings.push(`INFO: Alocação definida pela Cubagem.`);
    } else if (limitingFactor === 'OVERSIZE') {
        warnings.push(`INFO: Alocação definida por restrição física de item Oversize.`);
    }
  }
  
  // ICE Validation per prancha
  let totalIceWeight = 0;
  input.pranchas.forEach((p) => {
    if (p.specialCargoType === 'ICE' && p.iceWeight) {
      totalIceWeight += p.iceWeight;
    }
  });

  if (totalIceWeight > 0) {
    if (totalIceWeight > config.iceLimit) {
      warnings.push(`CRÍTICO: Limite de Gelo Seco (ICE) excedido! Total: ${totalIceWeight}kg (Limite da aeronave ${input.aircraft}: ${config.iceLimit}kg).`);
      status = 'REJEITADO';
    } else {
      warnings.push(`INFO: Gelo Seco (ICE) detectado: ${totalIceWeight}kg (Limite: ${config.iceLimit}kg). Requer ventilação adequada.`);
    }
  }
  
  // 4. Special Loads & Product Types & DGR Matrix
  const hasLithiumBulk = input.dgrTypes?.includes('LITHIUM_BULK') || false;
  const hasLithiumEquip = input.dgrTypes?.includes('LITHIUM_EQUIP') || false;
  const hasFlammable = input.dgrTypes?.includes('FLAM') || false;
  const hasExplosive = input.dgrTypes?.includes('EXPLOSIVE') || false;
  const hasGas = input.dgrTypes?.includes('GAS') || false;
  const hasToxic = input.dgrTypes?.includes('TOXIC') || false;
  const hasRadioactive = input.dgrTypes?.includes('RADIOACTIVE') || false;
  const hasIce = input.dgrTypes?.includes('ICE') || input.isICE;
  const hasAvi = input.dgrTypes?.includes('AVI') || input.isAVI;
  const hasHum = input.isHUM;
  const hasEli = input.pranchas.some(p => p.specialCargoType === 'ELI');

  // Collect all DGR Classes present
  const dgrClassesPresent = new Set<string>();
  input.pranchas.forEach(p => {
    if (p.specialCargoType === 'DGR' && p.dgrClass) {
      dgrClassesPresent.add(p.dgrClass);
    }
  });

  // IATA Table 9.3.A Segregation Logic
  if (dgrClassesPresent.has('1') || dgrClassesPresent.has('1.3') || dgrClassesPresent.has('1.4')) {
     dgr_alerts.push('CRÍTICO (DGR): Explosivos (Class 1) detectados. Segregação rigorosa exigida. Verificar compatibilidade com PAX.');
     if (dgrClassesPresent.has('1.1') || dgrClassesPresent.has('1.2') || dgrClassesPresent.has('1.5') || dgrClassesPresent.has('1.6')) {
        warnings.push('CRÍTICO: Explosivos 1.1, 1.2, 1.5, 1.6 PROIBIDOS em aeronaves de passageiros.');
        status = 'REJEITADO';
     }
  }

  // Class 3 vs 5.1
  if (dgrClassesPresent.has('3') && dgrClassesPresent.has('5.1')) {
      dgr_alerts.push('CRÍTICO (DGR): Inflamáveis (Class 3) e Oxidantes (Class 5.1) requerem segregação "Separated from".');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 3 vs 5.2
  if (dgrClassesPresent.has('3') && dgrClassesPresent.has('5.2')) {
      dgr_alerts.push('CRÍTICO (DGR): Inflamáveis (Class 3) e Peróxidos Orgânicos (Class 5.2) requerem segregação "Separated from".');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 2.1 vs 5.1
  if (dgrClassesPresent.has('2.1') && dgrClassesPresent.has('5.1')) {
      dgr_alerts.push('CRÍTICO (DGR): Gás Inflamável (Class 2.1) e Oxidantes (Class 5.1) requerem segregação.');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 4.1 vs 5.1
  if (dgrClassesPresent.has('4.1') && dgrClassesPresent.has('5.1')) {
      dgr_alerts.push('CRÍTICO (DGR): Sólidos Inflamáveis (Class 4.1) e Oxidantes (Class 5.1) requerem segregação.');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 4.2 vs 5.1
  if (dgrClassesPresent.has('4.2') && dgrClassesPresent.has('5.1')) {
      dgr_alerts.push('CRÍTICO (DGR): Combustão Espontânea (Class 4.2) e Oxidantes (Class 5.1) requerem segregação.');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 8 vs 4.2
  if (dgrClassesPresent.has('8') && dgrClassesPresent.has('4.2')) {
      dgr_alerts.push('CRÍTICO (DGR): Corrosivos (Class 8) e Combustão Espontânea (Class 4.2) requerem segregação.');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 8 vs 5.2
  if (dgrClassesPresent.has('8') && dgrClassesPresent.has('5.2')) {
      dgr_alerts.push('CRÍTICO (DGR): Corrosivos (Class 8) e Peróxidos Orgânicos (Class 5.2) requerem segregação "Separated from" (risco de reação violenta).');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 6.1 (Toxic) vs AVI/Food
  if (dgrClassesPresent.has('6.1') && hasAvi) {
      dgr_alerts.push('CRÍTICO (DGR): Tóxicos (Class 6.1) devem ser segregados de Animais Vivos (AVI) e Alimentos/Pharma.');
      if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Class 7 (Radioactive) vs AVI
  if (dgrClassesPresent.has('7') && hasAvi) {
      dgr_alerts.push('INFO (DGR): Radioativos (Class 7) e Animais Vivos (AVI) requerem distanciamento mínimo baseado no Índice de Transporte (TI).');
  }

  // Class 4.3 vs Water/WET
  if (dgrClassesPresent.has('4.3') && (input.isWET || hasIce)) {
      dgr_alerts.push('CRÍTICO (DGR): Class 4.3 (Perigoso quando molhado) incompatível com WET Cargo ou Gelo Seco (Condensação).');
      status = 'REJEITADO';
  }

  // DGR Segregation Matrix (ICAO Table 9.3.A)
  if (hasExplosive && (hasFlammable || hasGas || hasToxic || hasRadioactive)) {
    dgr_alerts.push('CRÍTICO (DGR): Explosivos (Class 1) devem ser segregados de quase todas as outras classes. Embarque negado.');
    status = 'REJEITADO';
  }
  
  if (hasFlammable && hasToxic) {
    dgr_alerts.push('CRÍTICO (DGR): Inflamáveis (Class 3) e Tóxicos (Class 6) requerem segregação "Separated from".');
    if (status !== 'REJEITADO') status = 'ALERTA';
  }

  // Lithium Batteries Rules
  if (hasLithiumBulk) {
    dgr_alerts.push('CRÍTICO (DGR): Baterias de Lítio UN3480/UN3090 (Bulk) são PROIBIDAS em aeronaves de passageiros (PAX). Apenas CAO (Cargo Aircraft Only).');
    status = 'REJEITADO';
  }
  
  if (hasLithiumEquip) {
    dgr_alerts.push('INFO (DGR): Baterias de Lítio UN3481/UN3091 (In Equipment) permitidas. Verificar limite de SoC (State of Charge < 30%).');
  }

  if (hasEli) {
    dgr_alerts.push('INFO (DGR): Baterias de Lítio ELI (Exception) detectadas. Verificar limites de peso/quantidade por volume (PI 965/966/967 Section II).');
  }

  if ((hasLithiumBulk || hasLithiumEquip || hasEli) && hasFlammable) {
    dgr_alerts.push('CRÍTICO (DGR): Incompatibilidade detectada. Baterias de Lítio e Líquidos Inflamáveis devem ser segregados em compartimentos distintos.');
    status = 'REJEITADO';
  }
  
  if (hasIce && hasAvi) {
    dgr_alerts.push('CRÍTICO (DGR): Risco de Asfixia. Gelo Seco (ICE) e Animais Vivos (AVI) não podem compartilhar o mesmo fluxo de ventilação.');
    status = 'REJEITADO';
  }
  
  if (hasIce && totalWeight > config.iceLimit) {
    warnings.push(`CRÍTICO: Limite de Gelo Seco excedido para ${input.aircraft} (${config.iceLimit}kg).`);
    status = 'REJEITADO';
  }
  
  if ((input.dgrTypes && input.dgrTypes.length > 0) || input.isDGR || hasIce || hasAvi || hasHum || hasEli) {
    warnings.push('AVISO: Presença de DGR/ICE/AVI/HUM/ELI. Requer emissão de NOTOC (Notification to Captain).');
    if (status !== 'REJEITADO') status = 'ALERTA';
  }
  
  // 5. Allocation & Stability & CG Impact
  let stability = 'OK';
  let fwd = 0;
  let aft = 0;
  let bulk = 0;
  let cg_impact = 'Neutro';
  let fuel_penalty = 'N/A';
  
  if (input.cargoType === 'LOOSE' && totalCubedPos > config.cargoMax) {
    cubage_alert = true;
    warnings.push(`ALERTA DE CUBAGEM: O volume total da carga exige ${totalCubedPos} posições cubadas, excedendo a capacidade padrão de ${config.cargoMax} posições. Risco de corte de carga por falta de espaço físico.`);
    if (status !== 'REJEITADO') status = 'ALERTA';
  }
  
  if (input.cargoType === 'LOOSE' && posicoes > config.cargoMax) {
    warnings.push(`CRÍTICO: Capacidade máxima de posições de carga solta excedida (Allotment Padrão: ${config.cargoMax} pos). Necessário: ${posicoes} pos.`);
    status = 'REJEITADO';
  } else {
    if (input.aircraft === 'A321') {
      // SAFETY PRIORITY: For A321, prioritize FWD (Hold 1) loading to prevent "Tip-over".
      fwd = posicoes;
      stability = 'OK (Prioridade FWD aplicada)';
      cg_impact = 'Tendência FWD (Prevenção de Tail Tipping ativa).';
      fuel_penalty = 'Alta (CG FWD aumenta arrasto de compensação do profundor).';
      if (input.isWET) {
        warnings.push('CRÍTICO: Conflito A321 Tip-over vs WET CARGO. WET exige AFT, mas A321 exige FWD. Requer análise de engenharia.');
        status = 'ALERTA';
        stability = 'ALERTA TIP-OVER / WET CONFLICT';
      }
    } else {
      if (input.isWET) {
        aft = posicoes;
        warnings.push('INFO: WET CARGO alocado no AFT por prioridade de proteção de ativos.');
        cg_impact = 'Tendência AFT (Restrição WET).';
        fuel_penalty = 'Baixa (CG AFT reduz arrasto de compensação).';
      } else if (hasAvi && config.hasBulk) {
        bulk = 1;
        posicoes = Math.max(0, posicoes - 1);
        fwd = Math.ceil(posicoes / 2);
        aft = posicoes - fwd;
        dgr_alerts.push('INFO (DGR): AVI alocado obrigatoriamente no porão BULK (Hold 5) para controle de temperatura/ventilação.');
        cg_impact = 'Balanceado com leve tendência AFT (Bulk ocupado).';
        fuel_penalty = 'Média/Baixa.';
      } else {
        // Default allocation
        fwd = Math.ceil(posicoes / 2);
        aft = posicoes - fwd;
        cg_impact = 'Balanceado (Distribuição FWD/AFT simétrica).';
        fuel_penalty = 'Média (Ideal para cruzeiro padrão).';
      }
    }
  }

  // 6. ESG / Fuel Efficiency / CO2
  // Rough estimate: 0.15 kg of CO2 per kg of cargo for a standard 2h flight.
  const co2_emissions = Math.round(totalWeight * 0.15);
  let esg_impact = `Emissão estimada: +${co2_emissions} kg CO2 (Scope 3). `;
  
  if (totalWeight > 2000) {
    esg_impact += 'Alto impacto no Fuel Burn. Sugestão: Otimizar ZFW CG para reduzir arrasto.';
  } else {
    esg_impact += 'Impacto marginal no Fuel Burn (Dentro da cota verde).';
  }

  // 7. Mandatory Tie-down
  warnings.push('MANDATÓRIO: Garantir amarração (Tie-down) conforme WBM para evitar deslocamento em voo.');

  // 8. DOV Alert & Max Weight
  const max_cargo_weight = (config.cargoMax * 900) + (config.hasBulk ? 1000 : 0);
  let dov_alert = '';
  const totalRequestedPos = posicoes + bulk;
  
  if (totalRequestedPos > 0) {
    const usagePercent = totalRequestedPos / config.totalPos;
    
    if (usagePercent >= 0.5) {
      if (usagePercent >= 0.8) {
        dov_alert = `ALERTA DOV: Alto risco de corte de carga. Solicitando ${totalRequestedPos} de ${config.totalPos} posições totais (${Math.round(usagePercent * 100)}%). A aeronave requer posições e margem de peso para bagagens e combustível, o que impacta diretamente o balanceamento (CG). A aprovação final depende do Despachante Operacional de Voo (DOV).`;
      } else {
        dov_alert = `AVISO DOV: Possibilidade de corte. Solicitando ${totalRequestedPos} de ${config.totalPos} posições totais (${Math.round(usagePercent * 100)}%). A aprovação final depende da equipe do DOV, considerando o peso/volume de bagagens e combustível.`;
      }
    }
  }

  if (status === 'REJEITADO') {
    posicoes = 0;
    fwd = 0;
    aft = 0;
    bulk = 0;
  }

  return {
    flight_info: {
      code: input.flightCode || 'LA0000',
      route: `${(input.origin || 'XXX').toUpperCase()} - ${(input.destination || 'XXX').toUpperCase()}`,
      aircraft: input.aircraft,
      date: input.flightDate || 'DD/MM/YYYY'
    },
    status,
    posicoes: posicoes + bulk,
    esg_impact,
    co2_emissions,
    fuel_penalty,
    warnings,
    dgr_alerts,
    door_checks,
    cg_impact,
    cubage_alert,
    validation_code,
    json_valid: true,
    stability,
    netAvailability: Math.max(0, config.totalPos - config.bagsPos - posicoes - bulk),
    clsInfo: input.clsInfo,
    allocation: { fwd, aft, bulk },
    max_cargo_weight,
    dov_alert,
    calculationBreakdown
  };
}
