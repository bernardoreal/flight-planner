import React from 'react';

interface AircraftHoldMapProps {
  aircraft: string;
  allocation: { fwd: number; aft: number; bulk: number };
}

export function AircraftHoldMap({ aircraft, allocation }: AircraftHoldMapProps) {
  if (aircraft === 'OTHER' || !aircraft) return null;

  const config = {
    'A319': { fwd: 2, aft: 2, bulk: 0, bags: 2 },
    'A320': { fwd: 3, aft: 4, bulk: 1, bags: 3 },
    'A321': { fwd: 5, aft: 5, bulk: 1, bags: 3 },
  }[aircraft] || { fwd: 0, aft: 0, bulk: 0, bags: 0 };

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 mb-6 overflow-hidden">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-4 border-b border-white/10 pb-2">
        Mapa de Porões (Visualização de Carregamento)
      </h3>
      
      <div className="relative flex flex-col items-center justify-center py-4 w-full">
        {/* Scalable Fuselage Background - Desktop Only */}
        <div className="hidden md:block absolute inset-0 w-full h-full opacity-20 pointer-events-none">
           <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
             <path d="M 50,100 C 50,50 150,20 300,20 L 600,20 C 750,20 780,80 780,100 C 780,120 750,180 600,180 L 300,180 C 150,180 50,150 50,100 Z" 
                   fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-600" />
             <path d="M 350,20 L 350,180" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" className="text-slate-700" />
           </svg>
        </div>
        
        {/* Holds Content - Responsive Container */}
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between w-full max-w-lg px-2 gap-6 md:gap-2">
          
          {/* FWD Section */}
          <div className="flex flex-col items-center gap-2 w-full md:w-auto">
            <div className="text-[10px] font-mono text-slate-500 md:hidden tracking-widest border-b border-slate-700/50 pb-1 w-full text-center mb-1">PORÃO DIANTEIRO (FWD)</div>
            <div className="flex gap-1.5 sm:gap-2">
              <div className="text-[8px] font-mono text-slate-600 hidden md:block self-center mr-1">NOSE</div>
              {Array.from({ length: Math.max(config.fwd, allocation.fwd) }).map((_, i) => {
                 const isUsed = i < allocation.fwd;
                 const isOver = i >= config.fwd;
                 
                 let boxClass = 'bg-slate-800/80 border-slate-600 text-slate-500';
                 let label = 'LIV';
                 
                 if (isOver) {
                   boxClass = 'bg-red-500/20 border-red-500 border-dashed text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
                   label = 'EXC';
                 } else if (isUsed) {
                   boxClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                   label = 'CGO';
                 }

                 return (
                  <div 
                    key={`fwd-${i}`} 
                    className={`h-10 w-8 md:h-10 md:w-8 rounded-sm border flex items-center justify-center text-[9px] font-bold transition-all ${boxClass}`}
                  >
                    {label}
                  </div>
                 );
              })}
            </div>
          </div>
          
          {/* Center Gap / Separator */}
          <div className="flex items-center justify-center px-1 w-full md:w-auto">
            {/* Desktop Wing Separator */}
            <div className="hidden md:flex flex-col items-center">
              <div className="w-px h-8 bg-slate-700/50"></div>
              <span className="text-[6px] text-slate-600 font-mono my-1">WING</span>
              <div className="w-px h-8 bg-slate-700/50"></div>
            </div>
            
            {/* Mobile Wing Separator */}
            <div className="md:hidden w-full flex items-center gap-2 opacity-50">
              <div className="h-px bg-slate-700 flex-1"></div>
              <span className="text-[8px] text-slate-600 font-mono uppercase">Asas (Wing Box)</span>
              <div className="h-px bg-slate-700 flex-1"></div>
            </div>
          </div>
          
          {/* AFT Section */}
          <div className="flex flex-col items-center gap-2 w-full md:w-auto">
            <div className="text-[10px] font-mono text-slate-500 md:hidden tracking-widest border-b border-slate-700/50 pb-1 w-full text-center mb-1">PORÃO TRASEIRO (AFT)</div>
            <div className="flex gap-1.5 sm:gap-2">
              {Array.from({ length: Math.max(config.aft, allocation.aft + config.bags) }).map((_, i) => {
                 const isBag = i >= config.aft - config.bags && i < config.aft;
                 const isUsed = !isBag && i < allocation.aft + (i >= config.aft ? config.bags : 0);
                 const isOver = i >= config.aft;
                 
                 let boxClass = 'bg-slate-800/80 border-slate-600 text-slate-500';
                 let label = 'LIV';
                 
                 if (isOver) {
                   boxClass = 'bg-red-500/20 border-red-500 border-dashed text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
                   label = 'EXC';
                 } else if (isBag) {
                   boxClass = 'bg-amber-500/20 border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]';
                   label = 'BAG';
                 } else if (isUsed) {
                   boxClass = 'bg-emerald-500/20 border-emerald-500 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
                   label = 'CGO';
                 }

                 return (
                  <div 
                    key={`aft-${i}`} 
                    className={`h-10 w-8 md:h-10 md:w-8 rounded-sm border flex items-center justify-center text-[9px] font-bold transition-all ${boxClass}`}
                  >
                    {label}
                  </div>
                 );
              })}
              
              {/* BULK */}
              {config.bulk > 0 && (
                <>
                  <div className="w-px h-10 border-l border-slate-700/50 border-dashed mx-0.5"></div>
                  {Array.from({ length: Math.max(config.bulk, allocation.bulk) }).map((_, i) => {
                     const isUsed = i < allocation.bulk;
                     const isOver = i >= config.bulk;
                     
                     let boxClass = 'bg-slate-800/80 border-indigo-500/30 text-slate-500';
                     let label = 'LIV';
                     
                     if (isOver) {
                       boxClass = 'bg-red-500/20 border-red-500 border-dashed text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
                       label = 'EXC';
                     } else if (isUsed) {
                       boxClass = 'bg-indigo-500/20 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.2)]';
                       label = 'BLK';
                     } else {
                       // Empty Bulk Position - Distinct border to identify it's BULK
                       boxClass = 'bg-slate-800/80 border-indigo-500/50 text-white/40';
                       label = 'BLK';
                     }

                     return (
                      <div 
                        key={`bulk-${i}`} 
                        className={`h-10 w-8 md:h-10 md:w-8 rounded-sm border flex items-center justify-center text-[9px] font-bold transition-all ${boxClass}`}
                      >
                        {label}
                      </div>
                     );
                  })}
                </>
              )}
              <div className="text-[8px] font-mono text-slate-600 hidden md:block self-center ml-1">TAIL</div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t border-white/10 px-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-500"></div>
          <span className="text-[9px] text-white/40 font-mono">Carga</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-500"></div>
          <span className="text-[9px] text-white/40 font-mono">Bagagem</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-indigo-500/40 border border-indigo-500"></div>
          <span className="text-[9px] text-white/40 font-mono">Bulk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500/40 border border-red-500 border-dashed"></div>
          <span className="text-[9px] text-white/40 font-mono">Excesso</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-white/5 border border-white/10"></div>
          <span className="text-[9px] text-white/40 font-mono">Livre</span>
        </div>
      </div>
    </div>
  );
}
