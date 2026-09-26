import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type PartnerPresence = 'idle' | 'thinking' | 'speaking' | 'sleeping';

type PartnerPresenceContextValue = {
  presence: PartnerPresence;
  setPresence: (presence: PartnerPresence) => void;
  pulseTick: number;
  pulse: () => void;
};

const PartnerPresenceContext = createContext<PartnerPresenceContextValue | null>(null);

export function PartnerPresenceProvider({ children }: { children: React.ReactNode }) {
  const [presence, setPresence] = useState<PartnerPresence>('idle');
  const [pulseTick, setPulseTick] = useState(0);

  const pulse = useCallback(() => {
    setPulseTick((t) => t + 1);
  }, []);

  const value = useMemo(
    () => ({ presence, setPresence, pulseTick, pulse }),
    [presence, pulseTick, pulse],
  );

  return (
    <PartnerPresenceContext.Provider value={value}>
      {children}
    </PartnerPresenceContext.Provider>
  );
}

export function usePartnerPresence() {
  const ctx = useContext(PartnerPresenceContext);
  if (!ctx) {
    throw new Error('usePartnerPresence must be used within PartnerPresenceProvider');
  }
  return ctx;
}

/** Safe hook for screens that may render outside the provider */
export function usePartnerPresenceOptional() {
  return useContext(PartnerPresenceContext);
}