import { buildWebSocketUrl } from "@/lib/api";

export type StreamFrame = {
  type?: string;
  channel?: string;
  timestamp?: string;
  data?: unknown;
  machineId?: string;
  [key: string]: unknown;
};

type StreamListener = (frame: StreamFrame) => void;

type SubscriptionRecord = {
  channels: Set<string>;
  listener: StreamListener;
};

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 15000;

const normalizeChannel = (channel: string) => channel.trim();

const channelMatches = (subscription: Set<string>, channel?: string) => {
  if (!channel) return false;
  if (subscription.has(channel)) return true;

  if (channel.startsWith("telemetry:")) {
    return subscription.has("telemetry:all");
  }

  if (channel === "alerts" || channel === "schedule" || channel === "factory") {
    return subscription.has(`${channel}:all`) || subscription.has(channel);
  }

  return subscription.has(channel);
};

class MultiplexStreamClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempt = 0;
  private manualClose = false;
  private nextSubscriptionId = 1;
  private subscriptions = new Map<number, SubscriptionRecord>();
  private channelCounts = new Map<string, number>();

  subscribe(channels: string[], listener: StreamListener) {
    const normalizedChannels = Array.from(
      new Set(channels.map(normalizeChannel).filter(Boolean))
    );

    if (normalizedChannels.length === 0) {
      return () => undefined;
    }

    const id = this.nextSubscriptionId++;
    this.subscriptions.set(id, {
      channels: new Set(normalizedChannels),
      listener,
    });

    normalizedChannels.forEach((channel) => this.incrementChannel(channel));
    this.ensureSocket();

    return () => {
      const record = this.subscriptions.get(id);
      if (!record) return;

      this.subscriptions.delete(id);
      record.channels.forEach((channel) => this.decrementChannel(channel));

      if (this.subscriptions.size === 0) {
        this.close(true);
      }
    };
  }

  private ensureSocket() {
    if (typeof window === "undefined") return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manualClose = false;
    this.connect();
  }

  private connect() {
    if (typeof window === "undefined") return;

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = new WebSocket(buildWebSocketUrl("/ws/stream"));
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.syncSubscriptions();
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data) as StreamFrame;
        this.dispatch(frame);
      } catch {
        // Ignore malformed frames.
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manualClose || this.subscriptions.size === 0) {
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private scheduleReconnect() {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer) return;

    const jitter = 0.7 + Math.random() * 0.6;
    const delay = Math.min(
      RECONNECT_MAX_MS,
      Math.round(RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt) * jitter)
    );

    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.subscriptions.size > 0) {
        this.connect();
      }
    }, delay);
  }

  private syncSubscriptions() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const channels = Array.from(this.channelCounts.keys());
    if (channels.length > 0) {
      this.socket.send(JSON.stringify({
        action: "subscribe",
        channels,
      }));
    }
  }

  private incrementChannel(channel: string) {
    const nextCount = (this.channelCounts.get(channel) || 0) + 1;
    this.channelCounts.set(channel, nextCount);
    if (nextCount === 1 && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: "subscribe", channels: [channel] }));
    }
  }

  private decrementChannel(channel: string) {
    const current = this.channelCounts.get(channel) || 0;
    if (current <= 1) {
      this.channelCounts.delete(channel);
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ action: "unsubscribe", channels: [channel] }));
      }
      return;
    }

    this.channelCounts.set(channel, current - 1);
  }

  private dispatch(frame: StreamFrame) {
    const channel = frame.channel;
    this.subscriptions.forEach((subscription) => {
      if (channelMatches(subscription.channels, channel)) {
        subscription.listener(frame);
      }
    });
  }

  private close(manual = false) {
    this.manualClose = manual;

    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (manual) {
      this.reconnectAttempt = 0;
    }
  }
}

declare global {
  interface Window {
    __multiplexStreamClient?: MultiplexStreamClient;
  }
}

const getStreamClient = () => {
  if (typeof window === "undefined") {
    return new MultiplexStreamClient();
  }

  if (!window.__multiplexStreamClient) {
    window.__multiplexStreamClient = new MultiplexStreamClient();
  }

  return window.__multiplexStreamClient;
};

export const multiplexStreamClient = getStreamClient();
