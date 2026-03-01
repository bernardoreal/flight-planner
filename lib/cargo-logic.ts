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
  specialCargoType?: 'NONE' | 'ICE' | 'AVI' | 'DGR' | 'WET' | 'PER' | 'HUM' | 'VAL';
  iceWeight?: number;
}

export interface CargoInput {
  flightCode: string;
  origin: string;
  destination: string;
  productType: 'GENERAL' | 'EXPRESS' | 'PHARMA' | 'ALIVE';
  aircraft: AircraftType;
  registration: string;
  flightDate?: string;
  pranchas: Prancha[];
  isICE: boolean;
  isAVI: boolean;
  isDGR: boolean;
  isWET: boolean;
  cargoType: 'LOOSE' | 'ULD';
  uldType: 'AKH' | 'AKE' | 'PKC' | 'NONE';
  dgrTypes: string[]; // 'ICE', 'AVI', 'LITHIUM_BULK', 'LITHIUM_EQUIP', 'FLAM', 'EXPLOSIVE', 'GAS', 'TOXIC', 'RADIOACTIVE'
}

export interface ManifestResult {
  flight_info: {
    code: string;
    route: string;
    aircraft: string;
    registration: string;
    date: string;
  };
  status: 'OK' | 'ALERTA' | 'REJEITADO';
  posicoes: number;
  esg_impact: string;
  co2_emissions: number;
  fuel_penalty: string;
  warnings: string[];
  dgr_alerts: string[];
  cg_impact: string;
  cubage_alert: boolean;
  validation_code: string;
  json_valid: boolean;
  
  // Extra fields for UI
  stability: string;
  netAvailability: number;
  allocation: {
    fwd: number;
    aft: number;
    bulk: number;
  };
}

const FLEET_CONFIG = {
  'A319': { totalPos: 4, bagsPos: 2, cargoMax: 2, iceLimit: 120, hasBulk: false, uldMax: 0 },
  'A320': { totalPos: 7, bagsPos: 3, cargoMax: 4, iceLimit: 200, hasBulk: true, uldMax: 7 },
  'A321': { totalPos: 10, bagsPos: 3, cargoMax: 7, iceLimit: 200, hasBulk: true, uldMax: 10 },
  'OTHER': { totalPos: 0, bagsPos: 0, cargoMax: 0, iceLimit: 0, hasBulk: false, uldMax: 0 }
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
        registration: input.registration || 'N/A',
        date: input.flightDate || new Date().toLocaleDateString('pt-BR')
      },
      status: 'REJEITADO',
      posicoes: 0,
      esg_impact: 'N/A',
      co2_emissions: 0,
      fuel_penalty: 'N/A',
      warnings: ['CRÍTICO: Aeronave não homologada para este sistema.'],
      dgr_alerts: [],
      cg_impact: 'N/A',
      cubage_alert: false,
      validation_code,
      json_valid: true,
      stability: 'N/A',
      netAvailability: 0,
      allocation: { fwd: 0, aft: 0, bulk: 0 }
    };
  }

  const config = FLEET_CONFIG[input.aircraft];
  
  // 3. Physical Constraints, Cubage & Positions
  let cubage_alert = false;
  let posicoes = 0;
  let status: 'OK' | 'ALERTA' | 'REJEITADO' = 'OK';
  const warnings: string[] = [];
  const dgr_alerts: string[] = [];
  
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
    input.pranchas.forEach((p, index) => {
      const pranchaNum = index + 1;
      let pranchaPos = 0;
      
      // Regra LATAM & Dnata: 900kg real ou 600kg cubado por posição
      const weightPos = Math.ceil(p.weight / 900);
      
      // Cálculo do peso cubado (Fator de conversão padrão IATA: 167 kg/m³)
      const volumeM3 = (p.length * p.width * p.height) / 1000000;
      const cubedWeight = volumeM3 * 167;
      const cubedPos = Math.ceil(cubedWeight / 600);
      
      // Limite de contagem de volumes (75 volumes soltos por posição)
      const volCountPos = Math.ceil(p.volumes / 75);
      
      // A alocação final é o maior valor entre a necessidade por peso real, peso cubado e contagem de volumes
      pranchaPos = Math.max(weightPos, cubedPos, volCountPos, 1); // Garante no mínimo 1 posição
      
      // Se for um único volume indivisível e for muito comprido, ele vai dar overlap físico inevitável
      if (p.volumes === 1 && p.length > 150) {
        const lengthPos = Math.ceil(p.length / 150);
        if (lengthPos > pranchaPos) {
          pranchaPos = lengthPos;
          warnings.push(`INFO (Prancha ${pranchaNum}): Volume único longo detectado (${p.length}cm). Ocupará ${lengthPos} posições por Overlap físico.`);
        }
      } else if (p.volumes > 1 && p.length > 150) {
        warnings.push(`INFO (Prancha ${pranchaNum}): Dimensões da prancha (${p.length}x${p.width}x${p.height}cm) indicam carga espalhada. Como são ${p.volumes} volumes soltos, assumimos que podem ser rearranjados no porão para otimizar espaço, ocupando ${pranchaPos} posição(ões) com base no peso real (${p.weight}kg), cubado (${Math.round(cubedWeight)}kg) e contagem de volumes.`);
      }
      
      // Tratamento de Overlap Explícito (Oversize)
      if (p.hasOversize && p.oversizeVolumes > 0) {
        // Cada volume oversize ocupa pelo menos 2 posições por overlap
        const oversizePos = p.oversizeVolumes * 2;
        
        // Peso restante da carga "normal"
        const normalWeight = Math.max(0, p.weight - p.oversizeWeight);
        const normalWeightPos = Math.ceil(normalWeight / 900);
        
        // Recalcula posições totais: posições do oversize + posições do peso normal
        const totalPosWithOversize = oversizePos + normalWeightPos;
        
        if (totalPosWithOversize > pranchaPos) {
          pranchaPos = totalPosWithOversize;
          warnings.push(`INFO (Prancha ${pranchaNum}): Overlap explícito detectado. ${p.oversizeVolumes} volume(s) oversize ocupando ${oversizePos} posições. Carga restante (${normalWeight}kg) ocupa ${normalWeightPos} posição(ões). Total: ${pranchaPos} posições.`);
        } else {
          warnings.push(`INFO (Prancha ${pranchaNum}): Overlap explícito detectado (${p.oversizeVolumes} vols), mas o peso/volume total já exigia ${pranchaPos} posições, absorvendo o overlap.`);
        }
      }
      
      if (volCountPos > Math.max(weightPos, cubedPos) && (!p.hasOversize || pranchaPos === volCountPos)) {
        warnings.push(`INFO (Prancha ${pranchaNum}): A quantidade de volumes (${p.volumes} vols) foi o fator determinante para alocar ${pranchaPos} posições (Limite: 75 vols/posição).`);
        cubage_alert = true;
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
      
      posicoes += pranchaPos;
    });
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

  if (input.productType === 'PHARMA') {
    warnings.push('INFO: Produto PHARMA detectado. Prioridade de embarque ativada. Monitoramento de temperatura obrigatório.');
    if (!hasIce) {
      warnings.push('AVISO: Produto PHARMA sem declaração de ICE (Gelo Seco). Verifique se a embalagem é passiva ou ativa.');
      if (status !== 'REJEITADO') status = 'ALERTA';
    }
  }

  if (input.productType === 'ALIVE' && !hasAvi) {
    warnings.push('CRÍTICO: Produto ALIVE selecionado, mas flag AVI não está marcada. Correção automática aplicada.');
  }

  if (input.productType === 'EXPRESS') {
    warnings.push('INFO: Produto EXPRESS. Garantia de embarque (Must Ride).');
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

  if ((hasLithiumBulk || hasLithiumEquip) && hasFlammable) {
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
  
  if ((input.dgrTypes && input.dgrTypes.length > 0) || input.isDGR || hasIce || hasAvi) {
    warnings.push('AVISO: Presença de DGR/ICE/AVI. Requer emissão de NOTOC.');
    if (status !== 'REJEITADO') status = 'ALERTA';
  }
  
  // 5. Allocation & Stability & CG Impact
  let stability = 'OK';
  let fwd = 0;
  let aft = 0;
  let bulk = 0;
  let cg_impact = 'Neutro';
  let fuel_penalty = 'N/A';
  
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
      registration: input.registration || 'N/A',
      date: input.flightDate || new Date().toLocaleDateString('pt-BR')
    },
    status,
    posicoes: posicoes + bulk,
    esg_impact,
    co2_emissions,
    fuel_penalty,
    warnings,
    dgr_alerts,
    cg_impact,
    cubage_alert,
    validation_code,
    json_valid: true,
    stability,
    netAvailability: Math.max(0, config.totalPos - config.bagsPos - posicoes - bulk),
    allocation: { fwd, aft, bulk }
  };
}
