import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Check, X, Pencil, UserPlus } from "lucide-react";
import {
  useUpdateCompany, useAddSetting, useUpdateSetting, useListMembers, useInviteMember, useUpdateMember,
  getListCompaniesQueryKey, getListMembersQueryKey, type Setting, type SettingKind, type MemberInputRole,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ErrorPanel } from "@/components/mf-ui";
import { errMsg, useCompany } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const KINDS: { kind: SettingKind; label: string }[] = [
  { kind: "material", label: "Materials" }, { kind: "machine", label: "Machines" }, { kind: "product", label: "Products" },
  { kind: "reason", label: "Scrap reasons" }, { kind: "unit", label: "Units" },
];
const ROLES: MemberInputRole[] = ["operator", "supervisor", "manager", "admin"];

function CompanyCard({ admin }: { admin: boolean }) {
  const { company } = useCompany();
  const [name, setName] = useState(company!.name);
  const [tol, setTol] = useState(String(company!.tolerance));
  const m = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const save = () => m.mutate({ companyId: company!.id, data: { name: name.trim(), tolerance: Number(tol) || 0 } }, {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }); toast({ title: "Company updated" }); },
  });
  return (
    <section className="rounded-md border bg-card p-5">
      <h2 className="text-lg font-bold">Company</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_220px]">
        <div><label className="text-sm font-bold uppercase tracking-wide">Name</label><Input data-testid="input-company-rename" disabled={!admin} className="mt-2 h-12" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="text-sm font-bold uppercase tracking-wide">Balance tolerance</label><Input data-testid="input-tolerance" disabled={!admin} inputMode="decimal" className="num mt-2 h-12" value={tol} onChange={(e) => setTol(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Absolute, in the job's unit. 0 = exact balance.</p></div>
      </div>
      <div className="mt-4"><ErrorPanel message={errMsg(m.error)} /></div>
      {admin && <Button className="mt-2 h-11" disabled={m.isPending || !name.trim() || Number.isNaN(Number(tol)) || Number(tol) < 0} onClick={save} data-testid="button-save-company">{m.isPending ? "Saving…" : "Save company"}</Button>}
    </section>
  );
}

function SettingRow({ s, admin }: { s: Setting; admin: boolean }) {
  const { company } = useCompany();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(s.name);
  const m = useUpdateSetting();
  const qc = useQueryClient();
  const run = (data: { name: string; active: boolean }) => m.mutate({ companyId: company!.id, settingId: s.id, data: { kind: s.kind, ...data } }, {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }); setEdit(false); },
  });
  return (
    <li className={cn("flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0", !s.active && "opacity-60")} data-testid={`row-setting-${s.id}`}>
      {edit ? (
        <>
          <Input className="h-10 flex-1" value={name} onChange={(e) => setName(e.target.value)} data-testid={`input-rename-${s.id}`} />
          <Button size="icon" disabled={!name.trim() || m.isPending} onClick={() => run({ name: name.trim(), active: s.active })} data-testid={`button-save-${s.id}`}><Check /></Button>
          <Button size="icon" variant="ghost" onClick={() => { setEdit(false); setName(s.name); }}><X /></Button>
        </>
      ) : (
        <>
          <span className="flex-1 font-medium">{s.name}{!s.active && <span className="ml-2 text-xs uppercase text-muted-foreground">inactive</span>}</span>
          {admin && <Button size="sm" variant="ghost" onClick={() => setEdit(true)} data-testid={`button-rename-${s.id}`}><Pencil className="h-4 w-4" />Rename</Button>}
          <Switch disabled={!admin || m.isPending} checked={s.active} onCheckedChange={(v) => run({ name: s.name, active: v })} data-testid={`switch-active-${s.id}`} />
        </>
      )}
      {m.error && <p className="w-full text-sm text-destructive">{errMsg(m.error)}</p>}
    </li>
  );
}

function SettingsLists({ admin }: { admin: boolean }) {
  const { company } = useCompany();
  const [kind, setKind] = useState<SettingKind>("material");
  const [name, setName] = useState("");
  const add = useAddSetting();
  const qc = useQueryClient();
  const list = company!.settings.filter((s) => s.kind === kind);
  const submit = () => add.mutate({ companyId: company!.id, data: { kind, name: name.trim(), active: true } }, {
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() }); },
  });
  return (
    <section className="rounded-md border bg-card p-5">
      <h2 className="text-lg font-bold">Recording options</h2>
      <p className="text-sm text-muted-foreground">Operators pick from these. Renaming does not change past jobs — each job keeps the name it was recorded with.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setKind(k.kind)} data-testid={`tab-kind-${k.kind}`}
            className={cn("h-10 rounded-md border px-4 text-sm font-semibold", kind === k.kind ? "border-foreground bg-foreground text-background" : "bg-background hover:border-foreground/40")}>
            {k.label}<span className="num ml-2 text-xs opacity-70">{company!.settings.filter((s) => s.kind === k.kind && s.active).length}</span>
          </button>
        ))}
      </div>
      {admin && (
        <div className="mt-4 flex gap-2">
          <Input className="h-11" placeholder={`New ${kind}`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()} data-testid="input-new-setting" />
          <Button className="h-11" disabled={!name.trim() || add.isPending} onClick={submit} data-testid="button-add-setting"><Plus />Add</Button>
        </div>
      )}
      <div className="mt-3"><ErrorPanel message={errMsg(add.error)} /></div>
      <ul className="mt-3 rounded-md border">{list.length ? list.map((s) => <SettingRow key={s.id} s={s} admin={admin} />) : <li className="p-6 text-center text-sm text-muted-foreground">None configured.</li>}</ul>
    </section>
  );
}

function Team({ admin }: { admin: boolean }) {
  const { company } = useCompany();
  const cid = company!.id;
  const q = useListMembers(cid, { query: { queryKey: getListMembersQueryKey(cid) } });
  const invite = useInviteMember();
  const upd = useUpdateMember();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState<MemberInputRole>("operator");
  const [code, setCode] = useState<string | null>(null);
  const submit = () => invite.mutate({ companyId: cid, data: { name: name.trim(), role } }, {
    onSuccess: (m) => { setCode(m.inviteCode); setName(""); qc.invalidateQueries({ queryKey: getListMembersQueryKey(cid) }); },
  });
  const copy = async (c: string, link = false) => {
    const url = new URL(`${import.meta.env.BASE_URL}onboarding`, window.location.origin);
    url.searchParams.set("invite", c);
    try {
      await navigator.clipboard.writeText(link ? url.toString() : c);
      toast({ title: link ? "Invitation link copied" : "Code copied", description: "Share privately with the intended employee. They must use their own account." });
    } catch { toast({ title: "Could not copy", description: "Select and copy the displayed code manually.", variant: "destructive" }); }
  };
  return (
    <section className="rounded-md border bg-card p-5">
      <h2 className="text-lg font-bold">Team</h2>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <p><strong>Operator:</strong> records jobs and submits their own drafts. <strong>Supervisor:</strong> reviews production records, approves or returns jobs.</p>
        <p><strong>Manager:</strong> has the same job and reporting access as Admin. <strong>Admin:</strong> additionally manages company settings, users and roles.</p>
        <p>Create an invitation, share the link or code privately, and ask the employee to sign in with their own account. No email is sent automatically. Anyone holding an unused code can claim it, so treat it as confidential.</p>
        <p>Links use the app address currently open. A development-preview link may not be accessible to staff; use the published app for sharing outside development.</p>
      </div>
      {admin && (
        <div className="mt-4 rounded-md bg-muted/60 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide"><UserPlus className="h-4 w-4" />Invite member</p>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <Input className="h-11" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-invite-name" />
            <div className="flex flex-wrap gap-1">{ROLES.map((r) => <button key={r} onClick={() => setRole(r)} data-testid={`button-role-${r}`} className={cn("h-11 rounded-md border px-3 text-sm font-semibold capitalize", role === r ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>{r}</button>)}</div>
            <Button className="h-11" disabled={!name.trim() || invite.isPending} onClick={submit} data-testid="button-invite">Create invite</Button>
          </div>
          {code && (
            <div className="rise mt-4 flex flex-wrap items-center gap-3 rounded-md border-2 border-dashed border-primary bg-card p-4">
              <span className="text-sm">Invite code — share it manually:</span>
              <span className="num break-all text-sm font-semibold" data-testid="text-invite-code">{code}</span>
              <Button variant="outline" size="sm" onClick={() => copy(code)}><Copy className="h-4 w-4" />Copy</Button>
              <Button variant="outline" size="sm" onClick={() => copy(code, true)}><Copy className="h-4 w-4" />Copy invitation link</Button>
            </div>
          )}
          <div className="mt-3"><ErrorPanel message={errMsg(invite.error)} /></div>
        </div>
      )}
      <ErrorPanel message={errMsg(upd.error)} />
      {q.isLoading ? <div className="mt-4 space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        : q.error ? <div className="mt-4"><ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} /></div>
        : (
          <ul className="mt-4 rounded-md border">
            {(q.data ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0" data-testid={`row-member-${m.id}`}>
                <span className="grid h-9 w-9 place-items-center rounded-sm bg-foreground text-xs font-bold text-background">{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
                <span className="flex-1"><span className="block font-semibold">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.userId ? "Joined" : <>Pending · <button className="underline" onClick={() => m.inviteCode && copy(m.inviteCode, true)}>Copy invitation link</button></>}</span></span>
                {admin ? (
                  <Select value={m.role} onValueChange={(r) => upd.mutate({ companyId: cid, memberId: m.id, data: { name: m.name, role: r as MemberInputRole } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListMembersQueryKey(cid) }) })}>
                    <SelectTrigger className="h-10 w-36 capitalize" data-testid={`select-role-${m.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="text-sm capitalize">{m.role}</span>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

export default function Settings() {
  const { company } = useCompany();
  const admin = company!.role === "admin";
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Settings" />
      {!admin && <p className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">You are viewing as {company!.role}. Only admins can change configuration.</p>}
      <Tabs defaultValue="config">
        <TabsList className="mb-4 h-11"><TabsTrigger value="config" className="h-9 px-5" data-testid="tab-config">Configuration</TabsTrigger><TabsTrigger value="team" className="h-9 px-5" data-testid="tab-team">Team</TabsTrigger></TabsList>
        <TabsContent value="config" className="space-y-6"><CompanyCard key={company!.id} admin={admin} /><SettingsLists admin={admin} /></TabsContent>
        <TabsContent value="team">{admin ? <Team admin={admin} /> : <p className="p-4 text-muted-foreground">Team membership and invitations are managed by your company administrator.</p>}</TabsContent>
      </Tabs>
    </>
  );
}
