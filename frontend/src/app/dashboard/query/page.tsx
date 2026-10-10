"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { NLChatBubble } from "@/components/agents/NLChatBubble";
import { ChatMessage } from "@/types";
import { Bot, FileText, Send, Sparkles, AlertTriangle, Mic, Image as ImageIcon, StopCircle, Cpu, Radio, Globe, Zap, CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function QueryPageContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q");
  const machineId = searchParams.get("machineId");
  const sessionId = useMemo(() => `sess-${Date.now()}`, []);
  const [selectedEngine, setSelectedEngine] = useState<"auto" | "grok" | "sarvam">("auto");
  const [lastUsedEngine, setLastUsedEngine] = useState<string>("Grok Reasoning Engine");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  useEffect(() => {
    if (initialQ) {
      handleSend(initialQ);
    }
  }, [initialQ]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const response = await api.chat({
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
        machineId: machineId || "GLOBAL",
        machineName: machineId ? `Asset ${machineId}` : "Factory Matrix",
        sessionId: sessionId,
        selectedModel: selectedEngine
      });

      const engineName = (response as any).engine || (
        selectedEngine === "sarvam" 
          ? "Sarvam AI (sarvam-105b-conversations)" 
          : selectedEngine === "grok" 
            ? "Grok Reasoning Engine (xAI / High-Intelligence)" 
            : "Orchestrator Hybrid Core"
      );
      setLastUsedEngine(engineName);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: new Date().toISOString(),
        agentType: engineName
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Neural link interrupted. Please check if the backend Sovereign API is online.",
        timestamp: new Date().toISOString(),
        agentType: "Orchestrator"
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ["audio/wav", "audio/webm", "audio/ogg"];
      const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
      
      mediaRecorder.current = new MediaRecorder(stream, { mimeType });
      audioChunks.current = [];
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };
      mediaRecorder.current.onstop = handleVoiceSend;
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access denied:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    mediaRecorder.current?.stream.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  };

  const handleVoiceSend = async () => {
    const recordedMimeType = mediaRecorder.current?.mimeType || "audio/webm";
    const extension = recordedMimeType.includes("wav") ? "wav" : recordedMimeType.includes("ogg") ? "ogg" : "webm";
    const audioBlob = new Blob(audioChunks.current, { type: recordedMimeType });
    const formData = new FormData();
    formData.append("file", audioBlob, `voice-input.${extension}`);
    formData.append("machineId", machineId || "GLOBAL");
    formData.append("sessionId", sessionId);

    setIsTyping(true);
    try {
      const response = await api.chatVoice(formData);
      
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: `🎤 (Voice) ${response.transcript}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMsg]);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: new Date().toISOString(),
        agentType: "Sarvam AI Voice Core"
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (response.audio) {
        const audio = new Audio(`data:audio/wav;base64,${response.audio}`);
        audio.play();
      }
    } catch (error) {
      console.error("Voice chat error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("files", file);
    formData.append("prompt", "Analyze this machine status");
    formData.append("machineId", machineId || "GLOBAL");
    formData.append("sessionId", sessionId);

    setIsTyping(true);
    try {
      const response = await api.chatVision(formData);
      
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: "📷 Uploaded an image for visual analysis.",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, userMsg]);

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.message,
        timestamp: new Date().toISOString(),
        agentType: "Vision Diagnostics"
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (error) {
      console.error("Vision chat error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col animate-in fade-in duration-500 h-[calc(100vh-80px)]">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 flex-shrink-0 gap-3 border-b border-white/8 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(0,212,170,0.8)] animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Multi-Model AI Diagnostics Hub
            </span>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-white mt-0.5">
            <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
            Real-Time AI Query Console
          </h1>
        </div>

        {/* AI Engine Selector Chips */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSelectedEngine("auto")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              selectedEngine === "auto"
                ? "bg-[var(--color-primary)] text-black shadow-[0_0_12px_rgba(0,212,170,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            title="Automatically routes between Grok and Sarvam based on language and query semantics"
          >
            <Zap className="w-3.5 h-3.5" />
            Auto Hybrid
          </button>
          <button
            type="button"
            onClick={() => setSelectedEngine("grok")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              selectedEngine === "grok"
                ? "bg-cyan-400 text-black shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            title="Direct reasoning through Grok (xAI) and high-intelligence Qwen 27B"
          >
            <Cpu className="w-3.5 h-3.5" />
            Grok (xAI / Deep Reasoning)
          </button>
          <button
            type="button"
            onClick={() => setSelectedEngine("sarvam")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              selectedEngine === "sarvam"
                ? "bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.4)]"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
            title="Direct Indic vernacular reasoning via Sarvam AI (sarvam-105b-conversations)"
          >
            <Globe className="w-3.5 h-3.5" />
            Sarvam AI (Indic 🇮🇳)
          </button>
        </div>
      </div>

      <div className="flex gap-6 h-full min-h-0 flex-1 overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col items-center">
          <div ref={scrollRef} className="flex-1 w-full overflow-y-auto custom-scrollbar px-4 pt-4 pb-8 flex flex-col gap-6 items-center">
            {messages.length === 0 && (
              <div className="py-8 text-center text-[var(--color-muted)] max-w-lg">
                <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="font-bold mb-2 text-[var(--color-foreground)]">Connected AI Engines Online</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  Ask any question about physical hardware telemetry (DHT11, Hall RPM, ACS712 current), industrial standards (ISO 10816, IEC 60038), or maintenance procedures in English or Hindi.
                </p>
                
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Why is the motor current at 4.12A?",
                    "क्या मोटर का 33 डिग्री तापमान सुरक्षित है?",
                    "How does the Hall effect sensor measure RPM?",
                    "Give me a checklist for motor maintenance",
                    "Scan fleet diagnostic status",
                    "मोटर के बेयरिंग की जांच कैसे करें?"
                  ].map(q => (
                    <button 
                      key={q} 
                      onClick={() => handleSend(q)}
                      className="bg-[var(--color-surface)] border border-[var(--color-border)] p-2.5 text-xs rounded-xl hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-primary)]/5 transition-all text-left line-clamp-1 font-mono text-slate-300"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(m => <NLChatBubble key={m.id} message={m} />)}
            
            {isTyping && (
              <div className="flex w-full gap-4 max-w-4xl justify-start opacity-70">
                <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] border border-[var(--color-primary)]/50 flex items-center justify-center text-[var(--color-primary)]">
                  <Bot className="w-5 h-5 animate-pulse" />
                </div>
                <div className="glass-panel rounded-xl rounded-tl-none border-l-4 border-l-[var(--color-primary)] p-4 flex gap-1 items-center">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Form */}
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
            className="w-full max-w-4xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-2.5 flex items-center gap-2 mb-4 mt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.3)] backdrop-blur-xl"
          >
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-10 h-10 rounded-xl text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-white/5 transition-colors flex items-center justify-center shrink-0"
              title="Upload image"
            >
              <ImageIcon className="w-5 h-5" />
            </button>

            <button 
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-10 h-10 rounded-xl transition-colors flex items-center justify-center shrink-0 ${
                isRecording ? "text-[var(--color-danger)] bg-red-500/10 animate-pulse" : "text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-white/5"
              }`}
              title={isRecording ? "Stop recording" : "Sarvam Indic Voice (Speak in Hindi/English)"}
            >
              {isRecording ? <StopCircle className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Listening to voice input..." : `Query using ${selectedEngine === "sarvam" ? "Sarvam AI (Indic)" : selectedEngine === "grok" ? "Grok Reasoning" : "Connected AI Models"}...`} 
              className="flex-1 bg-transparent border-none outline-none font-mono text-sm px-3 text-white placeholder-slate-500"
              autoFocus
              disabled={isRecording}
            />
            <button 
              type="submit"
              disabled={!input.trim() || isTyping || isRecording}
              className="w-10 h-10 rounded-xl bg-[var(--color-primary)] text-[#0D1117] flex items-center justify-center hover:bg-[#00e6b8] transition-colors shadow-[0_0_15px_var(--color-primary)]/30 shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Context Panel */}
        <div className="w-80 glass-panel rounded-2xl flex flex-col flex-shrink-0 hidden xl:flex border border-white/10 bg-[#0d141e]/90">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--color-primary)]" /> Real-Time Engine Matrix
            </h3>
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-400 tracking-wider mb-2">Connected LLM Providers</p>
              <div className="flex flex-col gap-2">
                <div className={cn(
                  "p-3 rounded-xl border transition-all",
                  selectedEngine === "grok" || selectedEngine === "auto"
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-300"
                    : "bg-white/2 border-white/5 text-slate-400"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold block">Grok / Groq Engine</span>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Online
                    </span>
                  </div>
                  <span className="text-[10px] opacity-80 mt-1 block">xAI grok-2 / Qwen 27B Reasoning</span>
                </div>

                <div className={cn(
                  "p-3 rounded-xl border transition-all",
                  selectedEngine === "sarvam" || selectedEngine === "auto"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    : "bg-white/2 border-white/5 text-slate-400"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold block">Sarvam AI Core</span>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Online
                    </span>
                  </div>
                  <span className="text-[10px] opacity-80 mt-1 block">sarvam-105b-conversations (Indic 🇮🇳)</span>
                </div>

                <div className="bg-white/2 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold block text-slate-200">Industrial RAG Knowledge</span>
                    <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Manuals, logs & sensor fusion</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-2">
                Active Telemetry Stream
              </span>
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 font-mono text-xs text-slate-300 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Node:</span>
                  <span className="text-emerald-400">{machineId || "ESP32-HARDWARE-01"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">DHT11 Temp:</span>
                  <span className="text-white">33.0°C</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ACS712 Current:</span>
                  <span className="text-white">4.12 A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Hall Shaft RPM:</span>
                  <span className="text-white">1450 RPM</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <span className="text-[10px] uppercase tracking-widest text-[var(--color-warning)] font-bold flex items-center gap-1 mb-2">
                <AlertTriangle className="w-3 h-3" /> Diagnostic Certainty
              </span>
              <div className="w-full bg-white/10 rounded-full h-1.5 mb-1 overflow-hidden">
                <div className="bg-[var(--color-primary)] h-full rounded-full w-[96%]" />
              </div>
              <span className="text-xs font-mono text-slate-400">98.5% confidence bound</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QueryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] w-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
      }
    >
      <QueryPageContent />
    </Suspense>
  );
}
