'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

function useOnlineStatus() {
  return useSyncExternalStore(
    (callback) => {
      window.addEventListener('online', callback);
      window.addEventListener('offline', callback);
      return () => {
        window.removeEventListener('online', callback);
        window.removeEventListener('offline', callback);
      };
    },
    () => navigator.onLine,
    () => true // Server snapshot
  );
}

export function NetworkStatus() {
  const isOnline = useOnlineStatus();
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    if (isOnline) {
      setShowStatus(true);
      const timer = setTimeout(() => setShowStatus(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowStatus(true);
    }
  }, [isOnline]);

  if (!showStatus && isOnline) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-all duration-300 ${
      isOnline 
        ? 'bg-emerald-500 text-white' 
        : 'bg-rose-600 text-white animate-pulse'
    }`}>
      {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
      <span className="text-xs font-bold uppercase tracking-wider">
        {isOnline ? 'CONEXÃO RESTABELECIDA' : 'MODO OFFLINE (PWA)'}
      </span>
    </div>
  );
}
