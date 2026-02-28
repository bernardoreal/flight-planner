import React from 'react';

interface AircraftHoldMapProps {
  aircraft: string;
  allocation: { fwd: number; aft: number; bulk: number };
}

export function AircraftHoldMap({ aircraft, allocation }: AircraftHoldMapProps) {
  if (aircraft === 'OTHER' || !aircraft) return null;

  const config = {
    'A319': { fwd: 2, aft: 2, bulk: 0 },
    'A320': { fwd: 3, aft: 4, bulk: 1 },
    'A321': { fwd: 5, aft: 5, bulk: 1 },
  }[aircraft] || { fwd: 0, aft: 0, bulk: 0 };

  const renderPositions = (total: number, used: number, label: string) => {
    const positions = [];
    for (let i = 0; i < total; i++) {
      const isUsed = i < used;
      const isOverallocated = used > total && i === total - 1; // Highlight if somehow overallocated (though logic prevents this, good for safety)
      
      positions.push(
        <div 
          key={i} 
          className={`h-10 w-8 rounded-sm border flex items-center justify-center text-[9px] font-bold transition-all ${
            isUsed 
              ? 'bg-[#e3004a]/20 border-[#e3004a] text-[#e3004a] shadow-[0_0_10px_rgba(227,0,74,0.2)]' 
              : 'bg-slate-800/80 border-slate-600 text-slate-500'
          }`}
        >
          {isUsed ? 'CGO' : 'LIV'}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <div className="flex gap-1">
          {positions}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#1e293b]/30 rounded-lg p-5 border border-slate-700/50 mb-6 overflow-hidden">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-6 border-b border-slate-700/50 pb-2">
        Mapa de Porões (Visualização de Carregamento)
      </h3>
      
      <div className="relative flex items-center justify-start sm:justify-center py-6 overflow-x-auto overflow-y-hidden w-full scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent pb-8">
        {/* Fuselage Outline */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none min-w-[600px] opacity-30 sm:opacity-100">
          <div className="w-[95%] h-28 border-2 border-slate-700/40 rounded-full relative flex items-center">
             {/* Cockpit Window */}
             <div className="absolute left-2 w-4 h-8 border-r-2 border-slate-700/40 rounded-full"></div>
             {/* Wings */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-56 border-2 border-slate-700/40 rounded-xl z-[-1] opacity-50"></div>
             {/* Tail */}
             <div className="absolute top-1/2 right-2 -translate-y-1/2 w-12 h-24 border-2 border-slate-700/40 rounded-md z-[-1] opacity-50"></div>
          </div>
        </div>
        
        {/* Holds Content */}
        <div className="relative z-10 flex items-center gap-2 sm:gap-4 px-4 sm:px-8 min-w-max mx-auto">
          {/* Nose label */}
          <div className="text-[9px] font-mono text-slate-600 mr-1 sm:mr-2">NOSE</div>

          {/* FWD */}
          {renderPositions(config.fwd, allocation.fwd, 'FWD')}
          
          {/* Center Gap for Wing Box */}
          <div className="w-6 sm:w-12 flex flex-col items-center justify-center mx-1 sm:mx-0">
            <div className="w-full h-px bg-slate-700/50 mb-1"></div>
            <span className="text-[7px] sm:text-[8px] text-slate-600 font-mono">C-WING</span>
            <div className="w-full h-px bg-slate-700/50 mt-1"></div>
          </div>
          
          {/* AFT */}
          {renderPositions(config.aft, allocation.aft, 'AFT')}
          
          {/* BULK */}
          {config.bulk > 0 && (
            <>
              <div className="w-1 sm:w-2 h-8 border-l border-slate-700/50 border-dashed mx-1 sm:mx-0"></div>
              {renderPositions(config.bulk, allocation.bulk, 'BLK')}
            </>
          )}

          {/* Tail label */}
          <div className="text-[9px] font-mono text-slate-600 ml-1 sm:ml-2">TAIL</div>
        </div>
      </div>
      
      <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-[#e3004a]/20 border border-[#e3004a]"></div>
          <span className="text-[10px] text-slate-400 font-mono">Carga Alocada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-slate-800/80 border border-slate-600"></div>
          <span className="text-[10px] text-slate-400 font-mono">Livre / Bagagem</span>
        </div>
      </div>
    </div>
  );
}
