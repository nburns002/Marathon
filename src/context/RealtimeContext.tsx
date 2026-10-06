import React, { createContext, useContext, useEffect, useState } from 'react';

type EventCallback = (data: any) => void;

interface RealtimeContextType {
  connected: boolean;
  subscribe: (eventType: string, callback: EventCallback) => () => void;
  lastEvent: { type: string; data: any; timestamp: number } | null;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; data: any; timestamp: number } | null>(null);
  const [listeners, setListeners] = useState<Map<string, Set<EventCallback>>>(() => new Map<string, Set<EventCallback>>());

  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onerror = () => {
        setConnected(false);
        if (eventSource) {
          eventSource.close();
        }
        // Reconnect after 3 seconds
        setTimeout(connectSSE, 3000);
      };

      const handleEvent = (type: string, ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          setLastEvent({ type, data, timestamp: Date.now() });

          const callbacks = listeners.get(type);
          if (callbacks) {
            callbacks.forEach((cb) => cb(data));
          }
          // Also trigger generic wildcard callbacks
          const wildcard = listeners.get('*');
          if (wildcard) {
            wildcard.forEach((cb) => cb({ type, data }));
          }
        } catch (err) {
          console.error('Error handling SSE payload:', err);
        }
      };

      // Register standard tournament events
      const eventTypes = [
        'CONNECTED',
        'MATCH_UPDATED',
        'MESSAGE_POSTED',
        'BRACKET_GENERATED',
        'REGISTRY_UPDATED',
        'DISPUTE_RESOLVED',
        'ADMIN_TICKET_CREATED',
        'TOURNAMENT_UPDATED'
      ];

      eventTypes.forEach((type) => {
        eventSource?.addEventListener(type, (ev: MessageEvent) => handleEvent(type, ev));
      });
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [listeners]);

  const subscribe = (eventType: string, callback: EventCallback) => {
    setListeners((prev: Map<string, Set<EventCallback>>) => {
      const next = new Map<string, Set<EventCallback>>(prev);
      const existing = next.get(eventType);
      if (!existing) {
        const newSet = new Set<EventCallback>();
        newSet.add(callback);
        next.set(eventType, newSet);
      } else {
        existing.add(callback);
      }
      return next;
    });

    return () => {
      setListeners((prev: Map<string, Set<EventCallback>>) => {
        const next = new Map<string, Set<EventCallback>>(prev);
        const set = next.get(eventType);
        if (set) {
          set.delete(callback);
          if (set.size === 0) {
            next.delete(eventType);
          }
        }
        return next;
      });
    };
  };

  return (
    <RealtimeContext.Provider value={{ connected, subscribe, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
};
