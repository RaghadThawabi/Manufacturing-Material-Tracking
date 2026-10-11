import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutGrid, ClipboardList, PlusSquare, ShieldCheck, Settings2, LogOut, ChevronsUpDown, Check, Plus, Menu, X, LogIn, GitCompareArrows } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreateCompanyForm } from "@/components/company-forms";
import { useCompany, canReview } from "@/lib/mf";
import { cn } from "@/lib/utils";

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-sm bg-accent">
        <div className="absolute bottom-0 left-0 h-2 w-full bg-[hsl(var(--good))]" />
        <div className="absolute bottom-2 left-0 h-1.5 w-2/3 bg-[hsl(var(--waste))]" />
        <span className="relative text-sm font-black text-foreground">MF</span>
      </div>
      <span className={cn("text-lg font-extrabold tracking-tight", light ? "text-sidebar-accent-foreground" : "")}>MaterialFlow</span>
    </div>
  );
}

function WorkspaceSelector() {
  const { companies, company, setCompanyId } = useCompany();
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="button-workspace" className="flex w-full items-center gap-3 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-left hover:border-sidebar-primary/60">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-sidebar-accent-foreground">{company?.name ?? "No company"}</p>
              <p className="text-xs capitalize text-sidebar-foreground/60">{company?.role ?? "—"}</p>
            </div>
            <ChevronsUpDown className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {companies.map((c) => (
            <DropdownMenuItem key={c.id} data-testid={`item-company-${c.id}`} onClick={() => setCompanyId(c.id)} className="py-2.5">
              <span className="flex-1">{c.name}<span className="ml-2 text-xs capitalize text-muted-foreground">{c.role}</span></span>
              {c.id === company?.id && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="button-new-company" onClick={() => setOpen(true)} className="py-2.5"><Plus className="h-4 w-4" />Create new company</DropdownMenuItem>
          <DropdownMenuItem asChild className="py-2.5"><Link href="/onboarding">Join with invite code</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>New company workspace</DialogTitle></DialogHeader><CreateCompanyForm onDone={() => setOpen(false)} /></DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const { user, logout, isAuthenticated, login } = useAuth();
  const { company } = useCompany();
  const [mobile, setMobile] = useState(false);
  if (!isAuthenticated || !company) return <>{children}</>;
  const nav = [
    { href: "/", label: "Overview", Icon: LayoutGrid },
    { href: "/jobs", label: "Jobs", Icon: ClipboardList },
    { href: "/jobs/new", label: "Record job", Icon: PlusSquare },
    ...(canReview(company.role) ? [{ href: "/review", label: "Review queue", Icon: ShieldCheck }, { href: "/compare", label: "Compare jobs", Icon: GitCompareArrows }] : []),
    { href: "/settings", label: "Settings", Icon: Settings2 },
  ];
  const active = (h: string) => (h === "/" ? loc === "/" : h === "/jobs" ? loc === "/jobs" || (loc.startsWith("/jobs/") && loc !== "/jobs/new") : loc.startsWith(h));
  const side = (
    <div className="flex h-full flex-col">
      <div className="hazard h-1.5" />
      <div className="p-5"><Logo light /></div>
      <div className="px-4"><WorkspaceSelector /></div>
      <nav className="mt-6 flex-1 space-y-1 px-3">
        {nav.map(({ href, label, Icon }) => (
          <Link key={href} href={href} onClick={() => setMobile(false)} data-testid={`link-${label.toLowerCase().replace(/ /g, "-")}`}
            className={cn("group flex h-12 items-center gap-3 rounded-md px-3 font-semibold transition-colors", active(href) ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent")}>
            <Icon className="h-5 w-5" />{label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Signed in"}</p>
        <p className="break-all text-xs text-sidebar-foreground/70">{user?.email}</p>
        <p className="mt-1 text-xs capitalize text-sidebar-foreground/70">Role: {company.role}</p>
        <button data-testid="button-logout" onClick={isAuthenticated ? logout : login} className="mt-2 flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-primary">
          {isAuthenticated ? <><LogOut className="h-4 w-4" />Log out</> : <><LogIn className="h-4 w-4" />Log in</>}
        </button>
      </div>
    </div>
  );
  return (
    <div className="min-h-[100dvh] bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar lg:block">{side}</aside>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-sidebar px-4 py-3 lg:hidden">
        <Logo light />
        <Button variant="ghost" size="icon" className="text-sidebar-foreground" onClick={() => setMobile(true)} data-testid="button-menu"><Menu /></Button>
      </header>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/50" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-sidebar">
            <button className="absolute right-3 top-4 text-sidebar-foreground" onClick={() => setMobile(false)}><X /></button>{side}
          </aside>
        </div>
      )}
      <main className="lg:pl-64"><div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div></main>
    </div>
  );
}
