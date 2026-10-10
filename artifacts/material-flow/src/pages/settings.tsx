import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X, Pencil } from "lucide-react";
import {
  useUpdateCompany, useAddSetting, useUpdateSetting,
  getListCompaniesQueryKey, type Setting, type SettingKind,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Team } from "@/components/team";
import { PageHeader, ErrorPanel } from "@/components/mf-ui";
import { errMsg, useCompany } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const KINDS: { kind: SettingKind; label: string }[] = [
  { kind: "material", label: "Materials" }, { kind: "machine", label: "Machines" }, { kind: "product", label: "Products" },
  { kind: "reason", label: "Scrap reasons" }, { kind: "unit", label: "Units" },
];

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

export default function Settings() {
  const { company } = useCompany();
  const admin = company!.role === "admin";
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Settings" />
      {!admin && <p className="mb-4 rounded-md border border-dashed p-3 text-sm text-muted-foreground">You are viewing as {company!.role}. Only admins can change configuration.</p>}
      <Tabs defaultValue="config">
        <TabsList className="mb-4 h-11"><TabsTrigger value="config" className="h-9 px-5" data-testid="tab-config">Configuration</TabsTrigger><TabsTrigger value="team" className="h-9 px-5" data-testid="tab-team">Team access</TabsTrigger></TabsList>
        <TabsContent value="config" className="space-y-6"><CompanyCard key={company!.id} admin={admin} /><SettingsLists admin={admin} /></TabsContent>
        <TabsContent value="team">{admin ? <Team /> : <p className="p-4 text-muted-foreground">Team membership and invitations are managed by your company administrator.</p>}</TabsContent>
      </Tabs>
    </>
  );
}
