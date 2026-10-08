'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  PauseCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

export interface IsaAlarmRecord {
  equipment_id: string;
  parameter_key: string;
  state: 'NORMAL' | 'ACTIVE_UNACK' | 'ACTIVE_ACK' | 'SHELVED' | 'CLEARED_UNACK';
  current_level: 'NORMAL' | 'WARNING' | 'CRITICAL';
  last_value: number;
  consecutive_breaches: number;
  triggered_at?: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
  shelved_until?: string;
  shelved_reason?: string;
}

interface IsaAlarmConsoleProps {
  className?: string;
  compact?: boolean;
}

export function IsaAlarmConsole({ className, compact = false }: IsaAlarmConsoleProps) {
  const [alarms, setAlarms] = useState<IsaAlarmRecord[]>([]);
  const [filterState, setFilterState] = useState<'all' | 'ACTIVE_UNACK' | 'ACTIVE_ACK' | 'SHELVED'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [operatorName, setOperatorName] = useState('Senior Tech');
  const [shelveModalAlarm, setShelveModalAlarm] = useState<IsaAlarmRecord | null>(null);
  const [shelveDuration, setShelveDuration] = useState(60);
  const [shelveReason, setShelveReason] = useState('Scheduled maintenance shift');
  const [isMuted, setIsMuted] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchAlarms = async () => {
    try {
      const data = await api.getActiveAlarms();
      setAlarms(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load active alarms', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleAcknowledge = async (eqId: string, paramKey: string) => {
    try {
      await api.acknowledgeAlarm(eqId, paramKey, operatorName);
      setActionMessage(`Alarm acknowledged for ${eqId}:${paramKey}`);
      setTimeout(() => setActionMessage(null), 3500);
      fetchAlarms();
    } catch (e) {
      console.error('Failed to acknowledge alarm', e);
    }
  };

  const handleShelve = async () => {
    if (!shelveModalAlarm) return;
    try {
      await api.shelveAlarm(
        shelveModalAlarm.equipment_id,
        shelveModalAlarm.parameter_key,
        shelveDuration,
        shelveReason
      );
      setShelveModalAlarm(null);
      setActionMessage(`Alarm shelved for ${shelveDuration}m on ${shelveModalAlarm.equipment_id}`);
      setTimeout(() => setActionMessage(null), 3500);
      fetchAlarms();
    } catch (e) {
      console.error('Failed to shelve alarm', e);
    }
  };

  const unackCount = alarms.filter(a => a.state === 'ACTIVE_UNACK').length;
  const ackCount = alarms.filter(a => a.state === 'ACTIVE_ACK').length;
  const shelvedCount = alarms.filter(a => a.state === 'SHELVED').length;

  const filteredAlarms = alarms.filter(a => {
    if (filterState !== 'all' && a.state !== filterState) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return a.equipment_id.toLowerCase().includes(q) || a.parameter_key.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className={cn("rounded-2xl border border-white/8 bg-[#161B22]/90 shadow-2xl backdrop-blur-xl", className)}>
      {/* Console Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 p-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.18)]">
            <ShieldAlert className="h-5 w-5" />
            {unackCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-lg animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-wide">ISA-18.2 Alarm Rationalization Hub</h2>
              <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-[var(--color-primary)]">
                IEC 62682 Certified
              </span>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Real-time alarm deadband hysteresis, debouncing & operator acknowledgement
            </p>
          </div>
        </div>

        {/* Action Message / Mute Toggle / Refresh */}
        <div className="flex items-center gap-2">
          {actionMessage && (
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 animate-fade-in">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}

          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? "Unmute Alarm Horn" : "Mute Alarm Horn"}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border transition-all",
              isMuted
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-white/10 bg-white/5 text-[var(--color-muted)] hover:text-white"
            )}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            onClick={fetchAlarms}
            title="Refresh Alarms"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[var(--color-muted)] hover:text-white transition-all"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin text-[var(--color-primary)]")} />
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 gap-3 border-b border-white/6 p-4 sm:grid-cols-4">
        <button
          onClick={() => setFilterState('all')}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all",
            filterState === 'all'
              ? "border-white/20 bg-white/8 shadow-md"
              : "border-white/5 bg-white/2 hover:border-white/10"
          )}
        >
          <span className="text-[11px] font-mono text-[var(--color-muted)] uppercase tracking-wider">Total Active</span>
          <span className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">{alarms.length}</span>
        </button>

        <button
          onClick={() => setFilterState('ACTIVE_UNACK')}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all",
            filterState === 'ACTIVE_UNACK'
              ? "border-rose-500/40 bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
              : "border-rose-500/20 bg-rose-500/5 hover:border-rose-500/30"
          )}
        >
          <span className="text-[11px] font-mono text-rose-400 uppercase tracking-wider flex items-center justify-between">
            <span>Unacknowledged</span>
            {unackCount > 0 && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
          </span>
          <span className="mt-1 font-mono text-2xl font-bold text-rose-400 tabular-nums">{unackCount}</span>
        </button>

        <button
          onClick={() => setFilterState('ACTIVE_ACK')}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all",
            filterState === 'ACTIVE_ACK'
              ? "border-amber-500/40 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
              : "border-amber-500/20 bg-amber-500/5 hover:border-amber-500/30"
          )}
        >
          <span className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">Acknowledged</span>
          <span className="mt-1 font-mono text-2xl font-bold text-amber-400 tabular-nums">{ackCount}</span>
        </button>

        <button
          onClick={() => setFilterState('SHELVED')}
          className={cn(
            "flex flex-col rounded-xl border p-3 text-left transition-all",
            filterState === 'SHELVED'
              ? "border-purple-500/40 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
              : "border-purple-500/20 bg-purple-500/5 hover:border-purple-500/30"
          )}
        >
          <span className="text-[11px] font-mono text-purple-400 uppercase tracking-wider">Shelved (Muted)</span>
          <span className="mt-1 font-mono text-2xl font-bold text-purple-400 tabular-nums">{shelvedCount}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            placeholder="Search by Machine ID or Parameter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#0D1117] py-1.5 pl-9 pr-3 text-xs font-mono text-white placeholder-[var(--color-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-muted)]">Operator:</span>
          <input
            type="text"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Operator name"
            className="rounded-lg border border-white/10 bg-[#0D1117] px-2.5 py-1 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
          />
        </div>
      </div>

      {/* Alarms List */}
      <div className="divide-y divide-white/6 px-4 pb-4">
        {filteredAlarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h4 className="mt-3 text-sm font-semibold text-white">No Active Alarms in Selected View</h4>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              All plant operational parameters are within normal deadbands.
            </p>
          </div>
        ) : (
          filteredAlarms.map((alarm, idx) => {
            const isUnack = alarm.state === 'ACTIVE_UNACK';
            const isAck = alarm.state === 'ACTIVE_ACK';
            const isShelved = alarm.state === 'SHELVED';

            return (
              <div
                key={`${alarm.equipment_id}-${alarm.parameter_key}-${idx}`}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-4 py-3.5 transition-all rounded-xl px-3 my-1",
                  isUnack && "bg-rose-500/8 border border-rose-500/20 shadow-[inset_0_0_12px_rgba(244,63,94,0.08)]",
                  isAck && "bg-amber-500/5 border border-amber-500/15",
                  isShelved && "bg-purple-500/5 border border-purple-500/15 opacity-80"
                )}
              >
                {/* Left: Machine, Parameter, and State Tag */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                    isUnack && "border-rose-500/40 bg-rose-500/20 text-rose-400 animate-pulse",
                    isAck && "border-amber-500/40 bg-amber-500/20 text-amber-400",
                    isShelved && "border-purple-500/40 bg-purple-500/20 text-purple-400"
                  )}>
                    {isShelved ? <PauseCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/machines/${alarm.equipment_id}`}
                        className="font-mono text-xs font-bold text-white hover:text-[var(--color-primary)] transition-colors underline-offset-2 hover:underline"
                      >
                        {alarm.equipment_id}
                      </Link>
                      <span className="font-mono text-xs text-[var(--color-muted)]">&bull;</span>
                      <span className="text-xs font-medium text-white">{alarm.parameter_key}</span>
                      
                      {/* State Chip */}
                      <span className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider border",
                        isUnack && "border-rose-500/40 bg-rose-500/20 text-rose-400",
                        isAck && "border-amber-500/40 bg-amber-500/20 text-amber-400",
                        isShelved && "border-purple-500/40 bg-purple-500/20 text-purple-400"
                      )}>
                        {alarm.state}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-[11px] text-[var(--color-muted)]">
                      <span>Value: <span className="text-white font-bold">{alarm.last_value}</span></span>
                      <span>&bull;</span>
                      <span>Persistence: {alarm.consecutive_breaches} samples</span>
                      {alarm.acknowledged_by && (
                        <>
                          <span>&bull;</span>
                          <span className="text-amber-400">Ack by {alarm.acknowledged_by}</span>
                        </>
                      )}
                      {alarm.shelved_until && (
                        <>
                          <span>&bull;</span>
                          <span className="text-purple-400">Shelved until {new Date(alarm.shelved_until).toLocaleTimeString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Operational Actions */}
                <div className="flex items-center gap-2">
                  {isUnack && (
                    <button
                      onClick={() => handleAcknowledge(alarm.equipment_id, alarm.parameter_key)}
                      className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-all shadow-sm"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Acknowledge</span>
                    </button>
                  )}

                  <button
                    onClick={() => setShelveModalAlarm(alarm)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:text-white hover:border-white/20 transition-all"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Shelve</span>
                  </button>

                  <Link
                    href={`/dashboard/machines/${alarm.equipment_id}`}
                    className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:text-white transition-all"
                  >
                    <span>View Cockpit</span>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Shelve Modal */}
      {shelveModalAlarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#161B22] p-6 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-400" />
                Shelve Alarm (ISA-18.2 Temporary Suppression)
              </h3>
              <button
                onClick={() => setShelveModalAlarm(null)}
                className="text-[var(--color-muted)] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <span className="text-[var(--color-muted)]">Machine / Parameter:</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-white">
                  {shelveModalAlarm.equipment_id} &bull; {shelveModalAlarm.parameter_key}
                </p>
              </div>

              <div>
                <label className="text-[var(--color-muted)] block mb-1">Shelve Duration:</label>
                <select
                  value={shelveDuration}
                  onChange={(e) => setShelveDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs font-mono text-white focus:border-[var(--color-primary)] focus:outline-none"
                >
                  <option value={15}>15 Minutes (Fast Calibration)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour (Standard Work Order)</option>
                  <option value={240}>4 Hours (Half Shift)</option>
                  <option value={480}>8 Hours (Full Shift)</option>
                </select>
              </div>

              <div>
                <label className="text-[var(--color-muted)] block mb-1">Mandatory Reason (for Audit Log):</label>
                <textarea
                  value={shelveReason}
                  onChange={(e) => setShelveReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/10 bg-[#0D1117] p-2 text-xs text-white focus:border-[var(--color-primary)] focus:outline-none"
                  placeholder="State operational rationale..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShelveModalAlarm(null)}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleShelve}
                className="rounded-lg border border-purple-500/40 bg-purple-500/20 px-4 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/30"
              >
                Confirm Shelve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
