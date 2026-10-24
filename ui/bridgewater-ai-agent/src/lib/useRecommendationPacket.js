'use client';
import { useState, useEffect } from 'react';
import { getLatestRecommendation } from '@/lib/backendApi';
import staticPacket from '@/data/recommendation_packet.json';

const LOCALSTORAGE_KEY = 'bridgewater_latest_recommendation_packet';

/**
 * Loads the recommendation packet with a three-tier fallback:
 * 1. GET /api/backend/recommendation/latest?refresh=auto
 * 2. localStorage (populated by step-1 live run)
 * 3. Static src/data/recommendation_packet.json
 *
 * Returns { packet, isStaticFallback, isLoading, packetSource, packetGeneratedAt,
 *           lastLoadedAt, packetRefreshStatus, packetRefreshMessage, packetAgeHours }
 * packetSource: "live_backend" | "cached_source_packet"
 * packetGeneratedAt: ISO string from packet.generated_at, or null
 * lastLoadedAt: formatted time string when load completed
 */
export function useRecommendationPacket() {
  const [packet, setPacket] = useState(null);
  const [isStaticFallback, setIsStaticFallback] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [packetSource, setPacketSource] = useState(null);
  const [packetGeneratedAt, setPacketGeneratedAt] = useState(null);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [packetRefreshStatus, setPacketRefreshStatus] = useState(null);
  const [packetRefreshMessage, setPacketRefreshMessage] = useState(null);
  const [packetAgeHours, setPacketAgeHours] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);

      function markLoaded(pkt, source) {
        if (cancelled) return;
        setPacket(pkt);
        setIsStaticFallback(source === 'cached_source_packet');
        setPacketSource(source);
        setPacketGeneratedAt(pkt?.generated_at ?? null);
        setPacketRefreshStatus(pkt?.packet_refresh_status ?? null);
        setPacketRefreshMessage(pkt?.packet_refresh_message ?? null);
        setPacketAgeHours(pkt?.packet_age_hours ?? null);
        setLastLoadedAt(
          new Date().toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })
        );
        setIsLoading(false);
      }

      // 1. GET /api/backend/recommendation/latest?refresh=auto
      try {
        const data = await getLatestRecommendation({ refresh: 'auto' });
        markLoaded(data, 'live_backend');
        return;
      } catch {
        // backend down — fall through to local cache
      }

      // 2. localStorage (populated by step-1 live run)
      try {
        const stored = localStorage.getItem(LOCALSTORAGE_KEY);
        if (stored) {
          markLoaded(JSON.parse(stored), 'live_backend');
          return;
        }
      } catch {
        // bad JSON or localStorage unavailable — continue
      }

      // 3. Static cached fallback
      markLoaded(staticPacket, 'cached_source_packet');
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return {
    packet,
    isStaticFallback,
    isLoading,
    packetSource,
    packetGeneratedAt,
    lastLoadedAt,
    packetRefreshStatus,
    packetRefreshMessage,
    packetAgeHours,
  };
}
