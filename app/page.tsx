"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Plane, AlertTriangle, CheckCircle, Package, Shield, Leaf, Search, Loader2 } from "lucide-react";

export default function LatamCargoDashboard() {
  const [flightCode, setFlightCode] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<any>(null);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flightCode) return;

    setLoading(true);
    setError("");
    setManifest(null);

    try {
      const response = await fetch("/api/manifest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flightCode, date }),
      });

      if (!response.ok) {
        throw new Error("Falha ao buscar manifesto");
      }

      const data = await response.json();
      setManifest(data);
    } catch (err: any) {
      setError(err.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl space-y-8">
        
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#e3004a] p-2 rounded-lg">
              <Plane className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">LATAM Cargo</h1>
              <p className="text-sm text-neutral-400">Global Operations Master</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-500 bg-neutral-800/50 px-3 py-1.5 rounded-full border border-neutral-800">
            <Shield className="w-3 h-3 text-[#1b0088]" />
            <span>QA & SWE CERTIFIED</span>
          </div>
        </header>

        {/* Search Form */}
        <motion.form 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSearch}
          className="bg-neutral-800/30 backdrop-blur-[15px] border border-neutral-800 rounded-2xl p-6 shadow-2xl w-full"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <label htmlFor="flightCode" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Código do Voo
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  id="flightCode"
                  type="text"
                  placeholder="Ex: LA3465"
                  value={flightCode}
                  onChange={(e) => setFlightCode(e.target.value.toUpperCase())}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#e3004a] focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="date" className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Data (Opcional)
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#e3004a] focus:border-transparent transition-all [color-scheme:dark]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !flightCode}
              className="w-full bg-[#1b0088] hover:bg-[#1b0088]/80 text-white font-medium py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 h-[46px]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <span>Gerar Manifesto</span>
              )}
            </button>
          </div>
        </motion.form>

        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 flex items-center gap-3"
          >
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        {/* Results */}
        {manifest && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-neutral-800/40 backdrop-blur-xl border border-neutral-700 rounded-2xl overflow-hidden shadow-2xl">
              
              {/* Manifest Header */}
              <div className="bg-neutral-800/80 p-6 border-b border-neutral-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    MANIFESTO TÉCNICO DE CARGA
                  </h2>
                  <p className="text-sm text-neutral-400 font-mono mt-1">
                    VOO: {manifest.flight_info?.code} | AERONAVE: {manifest.flight_info?.aircraft} ({manifest.flight_info?.registration})
                  </p>
                </div>
                
                <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
                  manifest.status === 'OK' 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}>
                  {manifest.status === 'OK' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  <span className="text-sm font-bold tracking-wide">ESTABILIDADE: {manifest.status}</span>
                </div>
              </div>

              {/* Manifest Body */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* Left Column: Stats */}
                <div className="space-y-6">
                  <div className="bg-neutral-900/50 rounded-xl p-5 border border-neutral-800">
                    <div className="flex items-center gap-3 mb-2">
                      <Package className="w-5 h-5 text-[#e3004a]" />
                      <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Disponibilidade Líquida</h3>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-light text-white">{manifest.posicoes}</span>
                      <span className="text-sm text-neutral-500">Posições (Pós-reserva de Bagagem)</span>
                    </div>
                  </div>

                  <div className="bg-neutral-900/50 rounded-xl p-5 border border-neutral-800">
                    <div className="flex items-center gap-3 mb-2">
                      <Leaf className="w-5 h-5 text-emerald-500" />
                      <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Impacto ESG</h3>
                    </div>
                    <p className="text-lg text-white">{manifest.esg_impact || "Neutro"}</p>
                  </div>
                </div>

                {/* Right Column: Warnings & Validation */}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Avisos Operacionais
                    </h3>
                    {manifest.warnings && manifest.warnings.length > 0 ? (
                      <ul className="space-y-2">
                        {manifest.warnings.map((warning: string, idx: number) => (
                          <li key={idx} className="bg-amber-500/5 border border-amber-500/10 text-amber-200/80 text-sm p-3 rounded-lg flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">•</span>
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="bg-neutral-900/50 border border-neutral-800 text-neutral-500 text-sm p-3 rounded-lg">
                        Nenhum aviso crítico para esta operação.
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-neutral-800">
                    <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
                      Código de Validação (Hash)
                    </h3>
                    <div className="bg-black/50 font-mono text-xs text-neutral-400 p-3 rounded-lg border border-neutral-800 break-all">
                      {manifest.validation_code || "N/A"}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
