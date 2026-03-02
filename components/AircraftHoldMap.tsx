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
    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 mb-6 overflow-hidden">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4 border-b border-white/10 pb-2">
        Mapa de Porões (Visualização de Carregamento)
      </h3>
      
      <div className="relative flex flex-col items-center justify-center py-4 w-full">
        {/* Scalable Fuselage Background */}
        <div className="absolute inset-0 w-full h-full opacity-20 pointer-events-none">
           <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
             <path d="M 50,100 C 50,50 150,20 300,20 L 600,20 C 750,20 780,80 780,100 C 780,120 750,180 600,180 L 300,180 C 150,180 50,150 50,100 Z" 
                   fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600" />
             <path d="M 350,20 L 350,180" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" className="text-slate-700" />
           </svg>
        </div>
        
        {/* Holds Content - Flex container that scales */}
        <div className="relative z-10 flex items-center justify-between w-full max-w-lg px-2 gap-1 sm:gap-2">
          {/* Nose label */}
          <div className="text-[8px] font-mono text-slate-600 hidden sm:block">NOSE</div>

          {/* FWD */}
          <div className="flex gap-1">
            {Array.from({ length: config.fwd }).map((_, i) => {
               const isUsed = i < allocation.fwd;
               return (
                <div 
                  key={`fwd-${i}`} 
                  className={`h-8 w-6 sm:h-10 sm:w-8 rounded-sm border flex items-center justify-center text-[8px] font-bold transition-all ${
                    isUsed 
                      ? 'bg-[#e3004a]/20 border-[#e3004a] text-[#e3004a] shadow-[0_0_10px_rgba(227,0,74,0.2)]' 
                      : 'bg-slate-800/80 border-slate-600 text-slate-500'
                  }`}
                >
                  {isUsed ? 'CGO' : 'LIV'}
                </div>
               );
            })}
          </div>
          
          {/* Center Gap for Wing Box */}
          <div className="flex flex-col items-center justify-center px-1">
            <div className="w-px h-8 bg-slate-700/50"></div>
            <span className="text-[6px] text-slate-600 font-mono my-1">WING</span>
            <div className="w-px h-8 bg-slate-700/50"></div>
          </div>
          
          {/* AFT */}
          <div className="flex gap-1">
            {Array.from({ length: config.aft }).map((_, i) => {
               const isUsed = i < allocation.aft;
               return (
                <div 
                  key={`aft-${i}`} 
                  className={`h-8 w-6 sm:h-10 sm:w-8 rounded-sm border flex items-center justify-center text-[8px] font-bold transition-all ${
                    isUsed 
                      ? 'bg-[#e3004a]/20 border-[#e3004a] text-[#e3004a] shadow-[0_0_10px_rgba(227,0,74,0.2)]' 
                      : 'bg-slate-800/80 border-slate-600 text-slate-500'
                  }`}
                >
                  {isUsed ? 'CGO' : 'LIV'}
                </div>
               );
            })}
          </div>
          
          {/* BULK */}
          {config.bulk > 0 && (
            <>
              <div className="w-px h-8 border-l border-slate-700/50 border-dashed mx-1"></div>
              <div className="flex gap-1">
                {Array.from({ length: config.bulk }).map((_, i) => {
                   const isUsed = i < allocation.bulk;
                   return (
                    <div 
                      key={`bulk-${i}`} 
                      className={`h-8 w-6 sm:h-10 sm:w-8 rounded-sm border flex items-center justify-center text-[8px] font-bold transition-all ${
                        isUsed 
                          ? 'bg-[#e3004a]/20 border-[#e3004a] text-[#e3004a] shadow-[0_0_10px_rgba(227,0,74,0.2)]' 
                          : 'bg-slate-800/80 border-slate-600 text-slate-500'
                      }`}
                    >
                      {isUsed ? 'CGO' : 'LIV'}
                    </div>
                   );
                })}
              </div>
            </>
          )}

          {/* Tail label */}
          <div className="text-[8px] font-mono text-slate-600 hidden sm:block">TAIL</div>
        </div>
      </div>
      
      <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-white/10">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#e3004a]/40 border border-[#e3004a]"></div>
          <span className="text-[9px] text-white/40 font-mono">Ocupado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-white/5 border border-white/10"></div>
          <span className="text-[9px] text-white/40 font-mono">Livre</span>
        </div>
      </div>
    </div>
  );
}
