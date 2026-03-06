'use client';

import { useEffect, useRef, useCallback } from 'react';

const INACTIVITY_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const STORAGE_KEY_LAST_ACTIVE = 'latamCargoLastActive';

export function useDataRetention() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearDataAndReload = useCallback(() => {
    console.warn('Sessão expirada por inatividade. Limpando dados sensíveis (LGPD).');
    localStorage.removeItem('latamCargoInput');
    localStorage.removeItem(STORAGE_KEY_LAST_ACTIVE);
    // Optional: Clear other keys if any
    window.location.reload();
  }, []);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Update last active timestamp
    localStorage.setItem(STORAGE_KEY_LAST_ACTIVE, Date.now().toString());
    
    timeoutRef.current = setTimeout(() => {
      clearDataAndReload();
    }, INACTIVITY_LIMIT_MS);
  }, [clearDataAndReload]);

  useEffect(() => {
    // Check on mount if we should already clear
    const lastActive = localStorage.getItem(STORAGE_KEY_LAST_ACTIVE);
    if (lastActive) {
      const timeSinceLastActive = Date.now() - parseInt(lastActive, 10);
      if (timeSinceLastActive > INACTIVITY_LIMIT_MS) {
        clearDataAndReload();
        return; // Stop here, reload will happen
      }
    }

    // Initial timer start
    resetTimer();

    // Event listeners for activity
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => resetTimer();

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [clearDataAndReload, resetTimer]);
}
