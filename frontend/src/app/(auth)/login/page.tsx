"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Hexagon, Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2, Sparkles, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [authenticatedUser, setAuthenticatedUser] = useState<{
    name?: string;
    email?: string;
    picture?: string;
    role?: string;
  } | null>(null);

  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    "218445100199-51vcmpcm18quqb2svce2e13jettspsfo.apps.googleusercontent.com";

  const handleAuthSuccess = (userData: any, token: string) => {
    localStorage.setItem("auth_token", token);
    localStorage.setItem("auth_user", JSON.stringify(userData));
    setAuthenticatedUser(userData);
    setIsSuccess(true);
    setTimeout(() => {
      router.push("/dashboard");
    }, 1200);
  };

  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response || !response.credential) {
      setErrorMessage("No Google credential returned");
      return;
    }
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await api.googleLogin(response.credential);
      handleAuthSuccess(res.user, res.access_token);
    } catch (err: any) {
      console.error("Google Auth failed:", err);
      setErrorMessage(err.message || "Google authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleDemoSignIn = async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const res = await api.googleLogin("demo-google-engineer");
      handleAuthSuccess(res.user, res.access_token);
    } catch (err: any) {
      console.error("Google Demo Sign-In error:", err);
      // Fallback local storage login
      handleAuthSuccess(
        {
          name: "Dr. Elena Rostova",
          email: "lead.engineer@plant-apex.io",
          role: "Lead Maintenance Engineer",
          picture: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80",
        },
        "mock-jwt-token-lead-engineer"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize Google Identity Services when script loads
  useEffect(() => {
    const initGsi = () => {
      if (typeof window !== "undefined" && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
          });

          const buttonContainer = document.getElementById("google-signin-btn-container");
          if (buttonContainer) {
            window.google.accounts.id.renderButton(buttonContainer, {
              theme: "filled_black",
              size: "large",
              shape: "rectangular",
              text: "continue_with",
              width: 320,
            });
          }
        } catch (e) {
          console.warn("Failed to initialize Google GSI:", e);
        }
      }
    };

    if (window.google?.accounts?.id) {
      initGsi();
    } else {
      const timer = setInterval(() => {
        if (window.google?.accounts?.id) {
          initGsi();
          clearInterval(timer);
        }
      }, 500);
      return () => clearInterval(timer);
    }
  }, [googleClientId]);

  const handleStandardLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");
    setTimeout(() => {
      setIsLoading(false);
      handleAuthSuccess(
        {
          name: "Plant Operator Alpha",
          email: "operator@plant.co",
          role: "Plant Operations Lead",
        },
        "session-jwt-operator"
      );
    }, 900);
  };

  if (isSuccess) {
    return (
      <div className="glass-panel p-8 rounded-2xl flex flex-col items-center justify-center text-center animate-in zoom-in duration-300 max-w-md w-full border border-[var(--color-primary)]/30 bg-[#0d141e]/90 shadow-[0_0_50px_rgba(0,212,170,0.15)]">
        <div className="w-16 h-16 rounded-full bg-[var(--color-success)]/20 flex items-center justify-center text-[var(--color-success)] mb-5 shadow-[0_0_20px_var(--color-success)] animation-pulse">
          <ShieldCheck className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-bold mb-1 text-white">Identity Verified</h2>
        <p className="text-sm text-[var(--color-primary)] font-mono mb-4">
          {authenticatedUser?.name || "Enterprise Engineer"}
        </p>
        <div className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-4 text-left text-xs font-mono space-y-1">
          <div className="flex justify-between text-slate-400">
            <span>Role:</span>
            <span className="text-emerald-400 font-semibold">{authenticatedUser?.role || "Authorized Specialist"}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Identity Provider:</span>
            <span className="text-cyan-400">Google OAuth 2.0 (SSO)</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] font-mono animate-pulse">
          <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
          <span>Mounting telemetry pipelines & SCADA models...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          if (typeof window !== "undefined" && window.google?.accounts?.id) {
            try {
              window.google.accounts.id.initialize({
                client_id: googleClientId,
                callback: handleGoogleCredentialResponse,
              });
              const buttonContainer = document.getElementById("google-signin-btn-container");
              if (buttonContainer) {
                window.google.accounts.id.renderButton(buttonContainer, {
                  theme: "filled_black",
                  size: "large",
                  shape: "rectangular",
                  text: "continue_with",
                  width: 320,
                });
              }
            } catch (err) {
              console.error("GSI render failed:", err);
            }
          }
        }}
      />

      <div className="glass-panel p-8 rounded-2xl flex flex-col items-center shadow-2xl relative overflow-hidden backdrop-blur-xl max-w-md w-full border border-white/10 bg-[#0d141e]/90">
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <Hexagon className="w-14 h-14 text-[var(--color-primary)] fill-[var(--color-primary)]/20 mb-3 drop-shadow-[0_0_15px_var(--color-primary)]" />
            <Sparkles className="w-4 h-4 text-cyan-400 absolute top-1 right-0 animate-pulse" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-wide text-white">PredictMaint</h1>
          <p className="text-xs text-[var(--color-muted)] mt-1 font-mono uppercase tracking-[0.2em]">
            Enterprise IoT & Diagnostic Matrix
          </p>
        </div>

        {errorMessage && (
          <div className="w-full mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
            {errorMessage}
          </div>
        )}

        {/* Google Authentication Section */}
        <div className="w-full flex flex-col items-center gap-3 mb-6 p-4 rounded-xl bg-gradient-to-b from-white/5 to-white/0 border border-white/10">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
            Google Enterprise Authentication
          </div>

          {/* Official Google GSI Button Container */}
          <div id="google-signin-btn-container" className="flex justify-center min-h-[40px] w-full" />

          {/* Direct 1-Click Google OAuth Demo Verification */}
          <button
            type="button"
            disabled={isLoading}
            onClick={handleGoogleDemoSignIn}
            className="w-full mt-1 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-3 transition-all text-xs shadow-sm hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] font-mono"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Sign In with Google (Lead Diagnostics Engineer)
          </button>
        </div>

        <div className="relative flex items-center justify-center w-full my-2">
          <div className="absolute w-full h-px bg-gradient-to-r from-transparent via-[var(--color-border)] to-transparent" />
          <span className="relative bg-[#0d141e] px-4 text-[10px] font-mono text-[var(--color-muted)] uppercase tracking-widest border border-[var(--color-border)] rounded-full">
            OR ON-PREMISE CREDS
          </span>
        </div>

        <form onSubmit={handleStandardLogin} className="w-full flex flex-col gap-4 mt-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] pl-1">
              Email ID
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
              <input
                type="email"
                defaultValue="operator@plant.co"
                required
                placeholder="operator@plant.co"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[0_0_10px_var(--color-primary)]/20 transition-all font-mono placeholder-[var(--color-border)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] pl-1">
              Authorization Chaff
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
              <input
                type="password"
                defaultValue="••••••••••••••"
                required
                placeholder="••••••••••••••"
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:shadow-[0_0_10px_var(--color-primary)]/20 transition-all font-mono placeholder-[var(--color-border)]"
              />
            </div>
          </div>

          <button
            disabled={isLoading}
            type="submit"
            className={cn(
              "w-full bg-[var(--color-primary)] text-[#0D1117] font-bold py-2.5 rounded-lg mt-1 flex items-center justify-center gap-2 hover:bg-[#00e6b8] transition-colors shadow-[0_0_15px_var(--color-primary)]/30 text-sm",
              isLoading && "opacity-70 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <span className="w-5 h-5 border-2 border-[#0D1117] border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                Initialize Station Console
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </>
  );
}
