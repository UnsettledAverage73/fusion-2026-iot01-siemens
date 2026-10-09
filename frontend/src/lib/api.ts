const normalizeBaseUrl = (value?: string) => value?.replace(/\/+$/, "") || "";

const getBrowserBackendOrigin = () => {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }

  return `${window.location.protocol}//${window.location.hostname}:8000`;
};

const EXTERNAL_API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
const API_BASE_URL = EXTERNAL_API_BASE_URL || "";

const getBrowserApiOrigin = () => {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000";
  }
  // If running on HTTPS in production and no API URL configured, use relative endpoint for Next.js rewrites
  if (window.location.protocol === "https:" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "";
  }
  return `http://${window.location.hostname}:8000`;
};

export function buildApiUrl(endpoint: string) {
  if (API_BASE_URL && !API_BASE_URL.includes("192.168.182.181")) {
    return `${API_BASE_URL}${endpoint}`;
  }

  if (typeof window !== "undefined") {
    // If running in production (HTTPS or non-local host) without an explicit API base, route relatively to hit Next.js rewrites
    if (window.location.protocol === "https:" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    }
    return `http://${window.location.hostname}:8000${endpoint}`;
  }

  return `${getBrowserApiOrigin()}${endpoint}`;
}

export function buildWebSocketUrl(path: string) {
  let backendOrigin = API_BASE_URL;
  if (!backendOrigin || backendOrigin.includes("192.168.182.181")) {
    if (typeof window !== "undefined") {
      const isHttps = window.location.protocol === "https:";
      const wsProtocol = isHttps ? "wss:" : "ws:";
      if (isHttps || !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
        return `${wsProtocol}//${window.location.host}${path.startsWith("/") ? path : `/${path}`}`;
      }
      return `ws://${window.location.hostname}:8000${path.startsWith("/") ? path : `/${path}`}`;
    }
    backendOrigin = "http://127.0.0.1:8000";
  }

  try {
    const wsUrl = new URL(backendOrigin);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    wsUrl.pathname = path.startsWith("/") ? path : `/${path}`;
    wsUrl.search = "";
    wsUrl.hash = "";
    return wsUrl.toString();
  } catch {
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const cleanHost = backendOrigin.replace(/^https?:\/\//, "");
    return `${isHttps ? "wss:" : "ws:"}//${cleanHost}${path.startsWith("/") ? path : `/${path}`}`;
  }
}

export async function fetchApi(endpoint: string, options?: RequestInit) {
  const url = buildApiUrl(endpoint);
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
  } catch (error) {
    // Self-healing fallback: if the primary URL fails, attempt direct host:8000 or same-origin
    try {
      const fallbackUrl = typeof window !== "undefined"
        ? `http://${window.location.hostname}:8000${endpoint}`
        : `http://127.0.0.1:8000${endpoint}`;

      if (fallbackUrl !== url) {
        response = await fetch(fallbackUrl, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
        });
      } else {
        throw error;
      }
    } catch {
      const message = error instanceof Error ? error.message : "Network request failed";
      throw new Error(`Unable to reach backend at ${url}: ${message}`);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(async () => {
      const text = await response.text().catch(() => "");
      return { detail: text || response.statusText || "Unknown error" };
    });
    const message = typeof error.detail === 'string' 
      ? error.detail
      : JSON.stringify(error.detail) || response.statusText;
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  getEquipment: () => fetchApi("/api/equipment"),
  onboardMachine: (payload: any) => fetchApi("/api/equipment", { method: "POST", body: JSON.stringify(payload) }),
  testConnection: (payload: any) => fetchApi("/api/test-connection", { method: "POST", body: JSON.stringify(payload) }),
  getFactoryStats: () => fetchApi("/api/factory/stats"),
  getFactoryUsage: () => fetchApi("/api/factory/usage"),
  getNetworkEndpoint: () => fetchApi("/api/network/endpoint"),
  detectDevices: () => fetchApi("/api/iot/detect-devices"),
  getConnectedSensors: (minutes: number = 5) => fetchApi(`/api/iot/connected-sensors?minutes=${minutes}`),
  pairEsp32: (equipmentId: string, macAddress: string, sensorKind?: string) => fetchApi(`/api/equipment/${equipmentId}/pair-esp32`, {
    method: "POST",
    body: JSON.stringify({
      mac_address: macAddress,
      ...(sensorKind ? { sensor_kind: sensorKind } : {}),
    }),
  }),
  getMachineTelemetry: (id: string, minutes: number = 60) => fetchApi(`/api/telemetry/${id}?minutes=${minutes}`),
  getMachineHistory: (id: string) => fetchApi(`/api/history/${id}`),
  getMachineInsights: (id: string) => fetchApi(`/api/machines/${id}/insights`),
  getAlerts: () => fetchApi("/api/alerts"),
  getSchedule: (aiPrioritized: boolean = false) => fetchApi(`/api/schedule?ai_prioritized=${aiPrioritized}`),
  updateTask: (id: number | string, payload: any) => fetchApi(`/api/schedule/${id}`, { method: "POST", body: JSON.stringify(payload) }),
  chat: (payload: any) => fetchApi("/api/chat", { method: "POST", body: JSON.stringify(payload) }),
  chatVoice: async (formData: FormData) => {
    const response = await fetch(buildApiUrl("/api/chat/voice"), {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || response.statusText);
    }
    return response.json();
  },
  chatVision: async (formData: FormData) => {
    const response = await fetch(buildApiUrl("/api/chat/vision"), {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || response.statusText);
    }
    return response.json();
  },
  logRepair: (payload: any) => fetchApi("/api/logs", { method: "POST", body: JSON.stringify(payload) }),
  mitigateRisk: (id: string) => fetchApi(`/api/equipment/${id}/mitigate`, { method: "POST" }),
  triggerAnomaly: (id: string, payload?: { parameter?: string, value?: number }) => fetchApi(`/api/equipment/${id}/trigger_anomaly`, { method: "POST", body: JSON.stringify(payload || {}) }),
  getWhatsAppNumber: () => fetchApi("/api/settings/whatsapp"),
  updateWhatsAppNumber: (number: string) => fetchApi("/api/settings/whatsapp", { method: "POST", body: JSON.stringify({ number }) }),
  submitAlertFeedback: (id: string | number, payload: any) => fetchApi(`/api/alerts/${id}/feedback`, { method: "POST", body: JSON.stringify(payload) }),
  getMachineParameters: (id: string) => fetchApi(`/api/machines/${id}/parameters`),
  addMachineParameter: (id: string, payload: any) => fetchApi(`/api/machines/${id}/parameters`, { method: "POST", body: JSON.stringify(payload) }),
  getTemplates: () => fetchApi("/api/machines/templates"),
  applyTemplate: (id: string, templateName: string) => fetchApi(`/api/machines/${id}/parameters/template/${templateName}`, { method: "POST" }),
  previewCsv: (id: string, formData: FormData) => fetch(buildApiUrl(`/api/machines/${id}/import/preview`), { method: "POST", body: formData }).then(res => res.json()),
  confirmCsv: (id: string, formData: FormData) => fetch(buildApiUrl(`/api/machines/${id}/import/confirm`), { method: "POST", body: formData }).then(res => res.json()),
  getActiveAlarms: () => fetchApi("/api/alarms/active"),
  acknowledgeAlarm: (equipmentId: string, parameterKey: string, operatorName: string = "Operator") =>
    fetchApi("/api/alarms/acknowledge", {
      method: "POST",
      body: JSON.stringify({ equipment_id: equipmentId, parameter_key: parameterKey, operator_name: operatorName }),
    }),
  shelveAlarm: (equipmentId: string, parameterKey: string, durationMinutes: number = 60, reason: string = "Maintenance active") =>
    fetchApi("/api/alarms/shelve", {
      method: "POST",
      body: JSON.stringify({ equipment_id: equipmentId, parameter_key: parameterKey, duration_minutes: durationMinutes, reason }),
    }),
  evaluateIso10816: (vibrationRms: number, machineClass: string = "Class II") =>
    fetchApi("/api/analytics/iso10816", {
      method: "POST",
      body: JSON.stringify({ vibration_rms: vibrationRms, machine_class: machineClass }),
    }),
  extractDspFeatures: (samples: number[]) =>
    fetchApi("/api/analytics/dsp/vibration", {
      method: "POST",
      body: JSON.stringify({ samples }),
    }),
  fetchSensorCatalog: (apiKey: string, category?: string) =>
    fetchApi("/api/sensors/catalog/fetch", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey, category: category || "all" }),
    }),
  getSensorCatalogCategories: () => fetchApi("/api/sensors/catalog"),
  getCustomSensors: () => fetchApi("/api/sensors/custom"),
  saveCustomSensor: (sensor: any) =>
    fetchApi("/api/sensors/custom", {
      method: "POST",
      body: JSON.stringify(sensor),
    }),
  deleteCustomSensor: (sensorId: string) =>
    fetchApi(`/api/sensors/custom/${encodeURIComponent(sensorId)}`, {
      method: "DELETE",
    }),
  runDiagnosticHandshake: (payload: {
    equipment_id: string;
    platform: string;
    host?: string;
    port?: number;
    sensors?: string[];
  }) =>
    fetchApi("/api/iot/diagnostic-handshake", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  predictTerminal: (payload: any) =>
    fetchApi("/api/v1/substation/predict-terminal", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  predictTransformer: (payload: any) =>
    fetchApi("/api/v1/substation/predict-transformer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getSubstationPresets: () => fetchApi("/api/v1/substation/presets"),
};

