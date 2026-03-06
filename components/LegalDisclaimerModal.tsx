'use client';

import { useState } from 'react';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function LegalDisclaimerModal({ onAccept }: { onAccept: () => void }) {
  const [isOpen, setIsOpen] = useState(true);

  const handleAccept = () => {
    setIsOpen(false);
    onAccept();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
          >
            <div className="bg-[#e3004a] p-6 text-white flex items-center gap-4">
              <ShieldAlert className="w-10 h-10 shrink-0" />
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">Aviso Legal Obrigatório</h2>
                <p className="text-xs opacity-90 font-mono">Compliance & Jurídico LATAM Cargo</p>
              </div>
            </div>
            
            <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                <strong className="text-slate-900 dark:text-white">ATENÇÃO OPERADOR:</strong>
              </p>
              <p>
                Esta ferramenta (&quot;Global Operations Master&quot;) é um sistema de <strong>APOIO À DECISÃO</strong> baseado em Inteligência Artificial.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>NÃO SUBSTITUI</strong> os sistemas oficiais de peso e balanceamento (Lido/Flight, NetLine/Load).
                </li>
                <li>
                  Os resultados apresentados são <strong>ESTIMATIVAS</strong> e devem ser validados manualmente.
                </li>
                <li>
                  A responsabilidade final pela segurança do voo e compliance com a ANAC/RBAC 121 é exclusivamente do <strong>Despachante Operacional de Voo (DOV)</strong> e do <strong>Supervisor de Carga</strong>.
                </li>
              </ul>
              <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 p-3 text-xs">
                <p className="font-semibold text-amber-700 dark:text-amber-400">
                  POLÍTICA DE RETENÇÃO DE DADOS (LGPD):
                </p>
                <p className="text-amber-800/80 dark:text-amber-500/80 mt-1">
                  Para sua segurança, dados sensíveis serão apagados automaticamente após inatividade. Não utilize este dispositivo para armazenar dados pessoais de clientes.
                </p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={handleAccept}
                className="bg-[#1b0088] hover:bg-[#2a00a8] text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-indigo-900/20"
              >
                <CheckCircle className="w-4 h-4" />
                DECLARO QUE LI E ACEITO
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}