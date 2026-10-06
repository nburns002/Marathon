import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

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
  
  // Stable ref for listeners so adding/removing subscribers NEVER recreates the EventSource connection
  const listenersRef = useRef<Map<string, Set<EventCallback>>>(new Map());
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let isMounted = true;

    const connectSSE = () => {
      if (!isMounted) return;

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource('/api/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (isMounted) setConnected(true);
      };

      eventSource.onerror = () => {
        if (!isMounted) return;
        setConnected(false);
        eventSource.close();
        eventSourceRef.current = null;

        // Clear existing reconnect timer if any
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          if (isMounted) connectSSE();
        }, 3000);
      };

      const handleEvent = (type: string, ev: MessageEvent) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(ev.data);
          setLastEvent({ type, data, timestamp: Date.now() });

          const callbacks = listenersRef.current.get(type);
          if (callbacks) {
            callbacks.forEach((cb) => {
              try {
                cb(data);
              } catch (cbErr) {
                console.error(`Error in SSE listener for '${type}':`, cbErr);
              }
            });
          }

          // Trigger generic wildcard callbacks
          const wildcard = listenersRef.current.get('*');
          if (wildcard) {
            wildcard.forEach((cb) => {
              try {
                cb({ type, data });
              } catch (cbErr) {
                console.error("Error in wildcard SSE listener:", cbErr);
              }
            });
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
        eventSource.addEventListener(type, (ev: MessageEvent) => handleEvent(type, ev));
      });
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const subscribe = useCallback((eventType: string, callback: EventCallback) => {
    let set = listenersRef.current.get(eventType);
    if (!set) {
      set = new Set<EventCallback>();
      listenersRef.current.set(eventType, set);
    }
    set.add(callback);

    return () => {
      const currentSet = listenersRef.current.get(eventType);
      if (currentSet) {
        currentSet.delete(callback);
        if (currentSet.size === 0) {
          listenersRef.current.delete(eventType);
        }
      }
    };
  }, []);

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
