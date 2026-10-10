import { useState } from "react";
import { useLocation } from "wouter";
import { Factory, KeyRound } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Logo } from "@/components/shell";
import { CreateCompanyForm, JoinCompanyForm } from "@/components/company-forms";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [, nav] = useLocation();
  const { logout } = useAuth();
  return (
    <div className="grid-paper min-h-[100dvh]">
      <div className="hazard h-1.5" />
      <div className="mx-auto flex max-w-xl flex-col px-4 py-8">
        <div className="flex items-center justify-between"><Logo /><button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground" data-testid="button-logout">Log out</button></div>
        <h1 className="rise mt-10 text-4xl font-extrabold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-muted-foreground">Start a new company ledger, or join your team with an invite code.</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {([["create", "Create company", Factory], ["join", "Join with code", KeyRound]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => setMode(k)} data-testid={`button-mode-${k}`}
              className={cn("flex h-24 flex-col items-start justify-between rounded-md border-2 p-4 text-left font-bold transition-all active:scale-[.98]", mode === k ? "border-foreground bg-foreground text-background" : "bg-card hover:border-foreground/40")}>
              <Icon className="h-6 w-6" />{l}
            </button>
          ))}
        </div>
        <div key={mode} className="rise mt-6 rounded-md border bg-card p-6">
          {mode === "create" ? <CreateCompanyForm onDone={() => nav("/")} /> : <JoinCompanyForm onDone={() => nav("/")} />}
        </div>
      </div>
    </div>
  );
}
