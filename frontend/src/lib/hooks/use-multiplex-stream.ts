'use client';

import { useEffect, useRef } from "react";
import { multiplexStreamClient, StreamFrame } from "@/lib/stream/multiplex-client";

type UseMultiplexStreamOptions = {
  enabled?: boolean;
};

export function useMultiplexStream(
  channels: string[],
  onMessage: (frame: StreamFrame) => void,
  options: UseMultiplexStreamOptions = {}
) {
  const { enabled = true } = options;
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  const channelKey = channels
    .map((channel) => channel.trim())
    .filter(Boolean)
    .sort()
    .join("|");

  useEffect(() => {
    if (!enabled || !channelKey) {
      return;
    }

    return multiplexStreamClient.subscribe(
      channelKey.split("|").filter(Boolean),
      (frame) => handlerRef.current(frame)
    );
  }, [channelKey, enabled]);
}
