import { useState } from "react";
import { useLocation } from "wouter";
import { Factory, KeyRound } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Logo } from "@/components/shell";
import { CreateCompanyForm, JoinCompanyForm } from "@/components/company-forms";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const [mode, setMode] = useState<"create" | "join">("join");
  const [, nav] = useLocation();
  const { logout, user } = useAuth();
  return (
    <div className="grid-paper min-h-[100dvh]">
      <div className="hazard h-1.5" />
      <div className="mx-auto flex max-w-xl flex-col px-4 py-8">
        <div className="flex items-center justify-between"><Logo /><button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground" data-testid="button-logout">Log out</button></div>
        <h1 className="rise mt-10 text-4xl font-extrabold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-muted-foreground">Employees: join your existing team. Only create a company if you are setting up a separate business.</p>
        <div className="mt-4 rounded-md border bg-card p-4 text-sm">
          <p className="font-semibold">Signed in as {user?.email || user?.firstName || "your account"}</p>
          <p className="mt-1 text-muted-foreground">Your admin assigns your company role. An invitation does not switch accounts. If this is not your account, log out and sign in with your own account; on a shared device, use a separate browser profile.</p>
        </div>
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
