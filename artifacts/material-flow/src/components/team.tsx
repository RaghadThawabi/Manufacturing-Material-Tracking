import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, UserPlus, Pencil, RefreshCw, Ban, PauseCircle, PlayCircle, History, ChevronDown, ShieldCheck } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useListMembers, useInviteMember, useUpdateMember, useManageMember,
  getListMembersQueryKey, getListCompaniesQueryKey, getListAssigneesQueryKey,
  type Member, type MemberInputRole, type MemberActionAction,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorPanel, AuditTrail } from "@/components/mf-ui";
import { errMsg, isConflict, useCompany } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLES: MemberInputRole[] = ["operator", "supervisor", "manager", "admin"];
type State = "active" | "suspended" | "pending" | "expired" | "revoked";
const STATE: Record<State, { label: string; cls: string }> = {
  active: { label: "Active", cls: "border-good text-good bg-good/10" },
  suspended: { label: "Suspended", cls: "border-waste text-waste bg-waste/10" },
  pending: { label: "Invite pending", cls: "border-reuse text-foreground bg-reuse/15" },
  expired: { label: "Invite expired", cls: "border-border text-muted-foreground bg-muted" },
  revoked: { label: "Invite revoked", cls: "border-border text-muted-foreground bg-muted line-through" },
};
export function memberState(m: Member): State {
  if (m.userId) return m.active === false ? "suspended" : "active";
  if (m.active === false || !m.inviteCode) return "revoked";
  if (m.inviteExpiresAt && new Date(m.inviteExpiresAt).getTime() < Date.now()) return "expired";
  return "pending";
}

type Pending =
  | { kind: "edit"; m: Member }
  | { kind: "action"; m: Member; action: MemberActionAction };

const ACTION_COPY: Record<MemberActionAction, { title: string; body: string; cta: string; danger?: boolean }> = {
  rotateInvite: { title: "Generate a new invitation link", body: "A fresh link and code are created, valid for 7 days. The previous link and code stop working immediately. Anyone you already sent the old link to will need the new one. Nothing is emailed: you copy and share it yourself.", cta: "Generate new link" },
  revokeInvite: { title: "Revoke this invitation", body: "The invite code is deleted and can no longer be used to join. The person is not added to the company. You can generate a new link later if needed.", cta: "Revoke invitation", danger: true },
  suspend: { title: "Suspend access", body: "This person can no longer sign in to this company or record, review or change anything. Their job assignments and full history are kept. You can restore access later.", cta: "Suspend access", danger: true },
  restore: { title: "Restore access", body: "This person regains access with their current role. Existing assignments are unchanged.", cta: "Restore access" },
};

function PermissionGuide() {
  const rows: [string, string][] = [
    ["Operator", "Records jobs and edits only jobs assigned to them, while draft or returned."],
    ["Supervisor", "Reviews: approves, returns and reopens jobs; manages any job and assignment."],
    ["Manager", "Same job review and management access as Admin."],
    ["Admin", "Everything above, plus company settings, recording options and this team page. Admin alone."],
  ];
  return (
    <div className="rounded-md border bg-background">
      <p className="flex items-center gap-2 border-b px-4 py-2.5 text-xs font-bold uppercase tracking-wider"><ShieldCheck className="h-4 w-4" />Who can do what</p>
      <dl className="divide-y text-sm">
        {rows.map(([r, d]) => <div key={r} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[110px_1fr]"><dt className="font-semibold">{r}</dt><dd className="text-muted-foreground">{d}</dd></div>)}
      </dl>
      <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Pending invites must be accepted before the person can be assigned jobs. Invitations are not emailed: copy and share the link privately.</p>
    </div>
  );
}

export function Team() {
  const { company } = useCompany();
  const { user } = useAuth();
  const cid = company!.id;
  const q = useListMembers(cid, { query: { queryKey: getListMembersQueryKey(cid), refetchInterval: 15000 } });
  const invite = useInviteMember();
  const upd = useUpdateMember();
  const manage = useManageMember();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberInputRole>("operator");
  const [code, setCode] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Pending | null>(null);
  const [form, setForm] = useState({ name: "", role: "operator" as MemberInputRole, comment: "" });
  const [dlgErr, setDlgErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListMembersQueryKey(cid) });
    qc.invalidateQueries({ queryKey: getListAssigneesQueryKey(cid) });
    qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
  };
  const onErr = (e: unknown) => {
    if (isConflict(e)) { qc.invalidateQueries({ queryKey: getListMembersQueryKey(cid) }); setDlgErr("Someone else changed this member just now. The latest details have been loaded. Close this, review them, and try again."); }
    else setDlgErr(errMsg(e));
  };
  const submitInvite = () => invite.mutate({ companyId: cid, data: { name: name.trim(), role } }, {
    onSuccess: (m) => { setCode(m.inviteCode); setName(""); refresh(); },
  });
  const copy = async (c: string, link = false) => {
    const url = new URL(`${import.meta.env.BASE_URL}onboarding`, window.location.origin);
    url.searchParams.set("invite", c);
    try {
      await navigator.clipboard.writeText(link ? url.toString() : c);
      toast({ title: link ? "Invitation link copied" : "Code copied", description: "Share privately with the intended employee. They must use their own account." });
    } catch { toast({ title: "Could not copy", description: "Select and copy the displayed code manually.", variant: "destructive" }); }
  };
  const openEdit = (m: Member) => { setDlgErr(""); setForm({ name: m.name, role: m.role as MemberInputRole, comment: "" }); setDlg({ kind: "edit", m }); };
  const openAction = (m: Member, action: MemberActionAction) => { setDlgErr(""); setForm((f) => ({ ...f, comment: "" })); setDlg({ kind: "action", m, action }); };
  const confirm = () => {
    if (!dlg) return;
    const comment = form.comment.trim();
    if (!comment) { setDlgErr("A reason is required. It is saved in the member history."); return; }
    const version = dlg.m.version ?? 0;
    if (dlg.kind === "edit") {
      upd.mutate({ companyId: cid, memberId: dlg.m.id, data: { name: form.name.trim(), role: form.role, version, comment } }, {
        onSuccess: () => { refresh(); setDlg(null); toast({ title: "Member updated" }); }, onError: onErr,
      });
    } else {
      const action = dlg.action;
      manage.mutate({ companyId: cid, memberId: dlg.m.id, data: { action, version, comment } }, {
        onSuccess: (m) => { refresh(); setDlg(null); if (action === "rotateInvite" && m.inviteCode) setCode(m.inviteCode); toast({ title: ACTION_COPY[action].cta.replace(/^\w/, (c) => c.toUpperCase()) + " done" }); },
        onError: onErr,
      });
    }
  };

  const members = q.data ?? [];
  const isSelf = (m: Member) => !!m.userId && m.userId === user?.id;
  const busy = upd.isPending || manage.isPending;
  const editM = dlg?.kind === "edit" ? dlg.m : null;
  const selfAdminDemote = editM && isSelf(editM) && editM.role === "admin";
  const unchanged = editM && form.name.trim() === editM.name && form.role === editM.role;

  return (
    <section className="space-y-5 rounded-md border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="text-lg font-bold">Team access</h2><p className="text-sm text-muted-foreground">Invite, change roles, and suspend or restore access. Every change needs a reason and is kept in history.</p></div>
        <span className="num text-xs text-muted-foreground">{q.isFetching ? "Refreshing…" : "Refreshes every 15s"}</span>
      </div>
      <PermissionGuide />

      <div className="rounded-md bg-muted/60 p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><UserPlus className="h-4 w-4" />Invite member</p>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <Input className="h-11" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-invite-name" />
          <div className="flex flex-wrap gap-1">{ROLES.map((r) => <button key={r} onClick={() => setRole(r)} data-testid={`button-role-${r}`} className={cn("h-11 rounded-md border px-3 text-sm font-semibold capitalize", role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{r}</button>)}</div>
          <Button className="h-11" disabled={!name.trim() || invite.isPending} onClick={submitInvite} data-testid="button-invite">Create invite</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Links are valid for 7 days and use the app address currently open. A development-preview link may not be reachable by staff.</p>
        {code && (
          <div className="rise mt-4 flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed border-primary bg-card p-4">
            <span className="text-sm">New invite code, share it manually:</span>
            <span className="num break-all text-sm font-semibold" data-testid="text-invite-code">{code}</span>
            <Button variant="outline" size="sm" onClick={() => copy(code)} data-testid="button-copy-code"><Copy className="h-4 w-4" />Copy code</Button>
            <Button variant="outline" size="sm" onClick={() => copy(code, true)} data-testid="button-copy-link"><Copy className="h-4 w-4" />Copy invitation link</Button>
          </div>
        )}
        <div className="mt-3"><ErrorPanel message={errMsg(invite.error)} /></div>
      </div>

      {q.isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        : q.error && !members.length ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : (
          <>
            {q.error && <ErrorPanel title="Could not refresh" message={`${errMsg(q.error)} Showing the last loaded list.`} onRetry={() => q.refetch()} />}
            <ul className="rounded-md border">
              {members.map((m) => {
                const st = memberState(m);
                const self = isSelf(m);
                const joined = !!m.userId;
                const hist = m.history ?? [];
                return (
                  <li key={m.id} className={cn("border-b last:border-0", (st === "suspended" || st === "revoked") && "bg-muted/30")} data-testid={`row-member-${m.id}`}>
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className={cn("grid h-10 w-10 place-items-center rounded-sm text-xs font-bold", joined && st === "active" ? "bg-foreground text-background" : "border-2 border-dashed border-foreground/30 text-muted-foreground")}>{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">{m.name}{self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">{m.role}</span>
                          <span className={cn("rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", STATE[st].cls)} data-testid={`status-member-${m.id}`}>{STATE[st].label}</span>
                        </p>
                        <p className="num text-xs text-muted-foreground">
                          {joined ? (st === "suspended" ? "Sign-in blocked · assignments and history kept" : "Joined")
                            : st === "revoked" ? "Code deleted · cannot be used"
                            : m.inviteExpiresAt ? `${st === "expired" ? "Expired" : "Expires"} ${new Date(m.inviteExpiresAt).toLocaleString()}` : "No expiry recorded"}
                          {m.version != null && ` · v${m.version}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {st === "pending" && m.inviteCode && <Button size="sm" variant="outline" onClick={() => copy(m.inviteCode!, true)} data-testid={`button-copy-${m.id}`}><Copy className="h-4 w-4" />Copy link</Button>}
                        <Button size="sm" variant="outline" onClick={() => openEdit(m)} data-testid={`button-edit-member-${m.id}`}><Pencil className="h-4 w-4" />Name / role</Button>
                        {!joined && <Button size="sm" variant="outline" onClick={() => openAction(m, "rotateInvite")} data-testid={`button-rotate-${m.id}`}><RefreshCw className="h-4 w-4" />{st === "pending" ? "New link" : "Reissue link"}</Button>}
                        {!joined && st !== "revoked" && <Button size="sm" variant="outline" className="text-waste" onClick={() => openAction(m, "revokeInvite")} data-testid={`button-revoke-${m.id}`}><Ban className="h-4 w-4" />Revoke</Button>}
                        {joined && st === "active" && <Button size="sm" variant="outline" className="text-waste" disabled={self} title={self ? "You cannot suspend yourself" : undefined} onClick={() => openAction(m, "suspend")} data-testid={`button-suspend-${m.id}`}><PauseCircle className="h-4 w-4" />Suspend</Button>}
                        {joined && st === "suspended" && <Button size="sm" variant="outline" className="text-good" onClick={() => openAction(m, "restore")} data-testid={`button-restore-${m.id}`}><PlayCircle className="h-4 w-4" />Restore</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setOpen(open === m.id ? null : m.id)} data-testid={`button-history-${m.id}`}><History className="h-4 w-4" /><span className="num">{hist.length}</span><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open === m.id && "rotate-180")} /></Button>
                      </div>
                    </div>
                    {open === m.id && <div className="rise border-t bg-background px-6 py-4"><AuditTrail audit={hist} /></div>}
                  </li>
                );
              })}
              {!members.length && <li className="p-8 text-center text-sm text-muted-foreground">No members yet. Create the first invite above.</li>}
            </ul>
          </>
        )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          {dlg && (
            <>
              <DialogHeader>
                <DialogTitle>{dlg.kind === "edit" ? `Change ${dlg.m.name}` : `${ACTION_COPY[dlg.action].title}: ${dlg.m.name}`}</DialogTitle>
                <DialogDescription>{dlg.kind === "edit" ? "Role changes take effect immediately and are recorded with your reason." : ACTION_COPY[dlg.action].body}</DialogDescription>
              </DialogHeader>
              {dlg.kind === "edit" && (
                <div className="space-y-3">
                  <div><label className="text-xs font-bold uppercase tracking-wider">Name</label><Input className="mt-1 h-11" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-member-name" /></div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider">Role</label>
                    <div className="mt-1 flex flex-wrap gap-1">{ROLES.map((r) => (
                      <button key={r} disabled={!!selfAdminDemote && r !== "admin"} onClick={() => setForm({ ...form, role: r })} data-testid={`button-member-role-${r}`}
                        className={cn("h-10 rounded-md border px-3 text-sm font-semibold capitalize disabled:opacity-40", form.role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{r}</button>
                    ))}</div>
                    {selfAdminDemote && <p className="mt-1 text-xs text-muted-foreground">You cannot remove your own admin role.</p>}
                    {editM && form.role !== editM.role && <p className="mt-2 rounded-sm bg-reuse/15 px-3 py-2 text-sm">Role will change from <strong className="capitalize">{editM.role}</strong> to <strong className="capitalize">{form.role}</strong>.</p>}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Reason <span className="text-destructive">*</span></label>
                <Textarea className="mt-1" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Why is this change being made?" data-testid="input-member-reason" />
              </div>
              <ErrorPanel message={dlgErr} />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDlg(null)} data-testid="button-cancel-member">Cancel</Button>
                <Button onClick={confirm} disabled={busy || !form.comment.trim() || (dlg.kind === "edit" && (!form.name.trim() || !!unchanged))}
                  className={cn(dlg.kind === "action" && ACTION_COPY[dlg.action].danger && "bg-waste text-white hover:bg-waste/90")} data-testid="button-confirm-member">
                  {busy ? "Saving…" : dlg.kind === "edit" ? "Save change" : ACTION_COPY[dlg.action].cta}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
