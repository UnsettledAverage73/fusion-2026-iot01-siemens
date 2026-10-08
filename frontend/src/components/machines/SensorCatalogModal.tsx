'use client';

import { useState } from 'react';
import { 
  X, Cloud, Key, Check, Search, Filter, ShieldCheck, 
  ExternalLink, Download, Cpu, Sparkles, Loader2, AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export interface CatalogSensor {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  metric: string;
  unit: string;
  interface_type: string;
  i2c_address?: string;
  pin_esp32: string;
  pin_pi: string;
  pin_arduino: string;
  default_value: number;
  normal_min: number;
  normal_max: number;
  warning_threshold: number;
  critical_threshold: number;
  calibration_formula?: string;
  description?: string;
  code_snippet_c?: string;
  code_snippet_py?: string;
}

interface SensorCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSensors: (sensors: CatalogSensor[]) => void;
}

export function SensorCatalogModal({ isOpen, onClose, onImportSensors }: SensorCatalogModalProps) {
  const [apiKey, setApiKey] = useState('IND-CATALOG-KEY-9921X');
  const [isLoading, setIsLoading] = useState(false);
  const [sensors, setSensors] = useState<CatalogSensor[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSensorIds, setSelectedSensorIds] = useState<string[]>([]);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFetchCatalog = async () => {
    if (!apiKey.trim()) {
      setErrorMsg('Please enter an Industrial Catalog API Key.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.fetchSensorCatalog(apiKey, selectedCategory);
      if (res?.sensors) {
        setSensors(res.sensors);
        setAuthStatus(`Authenticated via ${res.authenticated_source} (${res.api_key_masked})`);
        setSelectedSensorIds(res.sensors.map((s: any) => s.id));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify your API Key.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedSensorIds(prev =>
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const handleImportSelected = () => {
    const toImport = sensors.filter(s => selectedSensorIds.includes(s.id));
    if (toImport.length === 0) {
      setErrorMsg('Please select at least one sensor to import.');
      return;
    }
    onImportSensors(toImport);
    onClose();
  };

  const filteredSensors = sensors.filter(s => {
    const matchesCat = selectedCategory === 'all' || s.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.manufacturer.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.metric.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#161B22] p-6 shadow-2xl custom-scrollbar flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Cloud Sensor Catalog & Registry</h3>
              <p className="text-xs text-[var(--color-muted)]">Authenticate via API Key to pull certified factory transducers and driver profiles.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* API Key Authentication Bar */}
        <div className="rounded-2xl border border-white/10 bg-[#0D1117] p-4 mb-5">
          <label className="text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] block mb-1">
            Industrial Sensor Catalog API Key:
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500">
                <Key className="h-4 w-4" />
              </div>
              <input
                type="text"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Enter API Key (e.g. IND-CATALOG-KEY-9921X)"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/10 bg-[#161B22] font-mono text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setApiKey('IND-CATALOG-KEY-9921X')}
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap"
            >
              Use Factory Sandbox Key
            </button>
            <button
              type="button"
              onClick={handleFetchCatalog}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary)] text-xs font-bold text-[#0D1117] shadow-[0_0_15px_rgba(0,212,170,0.3)] hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span>{isLoading ? 'Authenticating...' : 'Authenticate & Sync'}</span>
            </button>
          </div>

          {authStatus && (
            <div className="mt-3 flex items-center gap-2 text-xs font-mono text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              <span>{authStatus}</span>
            </div>
          )}

          {errorMsg && (
            <div className="mt-3 flex items-center gap-2 text-xs font-mono text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Filter Bar (if sensors loaded) */}
        {sensors.length > 0 && (
          <div className="space-y-4 flex-1">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Category Pills */}
              <div className="flex flex-wrap gap-1.5">
                {['all', 'vibration', 'temperature', 'electrical', 'pressure', 'speed', 'acoustic', 'environmental'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-mono capitalize transition-all",
                      selectedCategory === cat
                        ? "bg-[var(--color-primary)] text-black font-bold shadow-[0_0_10px_rgba(0,212,170,0.3)]"
                        : "bg-white/5 text-zinc-400 hover:text-white"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter sensors..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-white/10 bg-[#0D1117] text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
                />
              </div>
            </div>

            {/* Sensor Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {filteredSensors.map(sensor => {
                const isSelected = selectedSensorIds.includes(sensor.id);
                return (
                  <div
                    key={sensor.id}
                    onClick={() => toggleSelect(sensor.id)}
                    className={cn(
                      "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none",
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-[0_0_15px_rgba(0,212,170,0.15)]"
                        : "border-white/8 bg-white/2 hover:border-white/15"
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary)] font-bold">
                            {sensor.manufacturer}
                          </span>
                          <h4 className="text-sm font-bold text-white mt-0.5">{sensor.name}</h4>
                        </div>
                        <span className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md border shrink-0",
                          isSelected
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-black"
                            : "border-white/20 bg-transparent"
                        )}>
                          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--color-muted)] mt-2 leading-relaxed">
                        {sensor.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/6 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-400">
                      <span>Interface: <strong className="text-white uppercase">{sensor.interface_type}</strong></span>
                      <span>Metric: <strong className="text-emerald-400">{sensor.metric} ({sensor.unit})</strong></span>
                      <span>ESP32: <strong className="text-amber-300">{sensor.pin_esp32}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-xs font-mono text-[var(--color-muted)]">
            {sensors.length > 0 ? `${selectedSensorIds.length} of ${sensors.length} sensor(s) selected for import` : 'Click "Authenticate & Sync" to fetch live catalog'}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-[var(--color-muted)] hover:text-white"
            >
              Close
            </button>
            {sensors.length > 0 && (
              <button
                type="button"
                onClick={handleImportSelected}
                className="flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-xs font-bold text-[#0D1117] shadow-[0_0_20px_rgba(0,212,170,0.3)] hover:brightness-110 transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Import Selected to Setup</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
