import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateCompany, useJoinCompany, getListCompaniesQueryKey, type CompanyInputUnit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorPanel } from "@/components/mf-ui";
import { errMsg, useCompany } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function CreateCompanyForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<CompanyInputUnit>("kg");
  const [samples, setSamples] = useState(true);
  const create = useCreateCompany();
  const qc = useQueryClient();
  const { setCompanyId } = useCompany();
  const { toast } = useToast();
  const submit = () =>
    create.mutate({ data: { name: name.trim(), unit, loadSamples: samples } }, {
      onSuccess: async (c) => {
        await qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        setCompanyId(c.id);
        toast({ title: "Company created", description: `${c.name} is ready. You are the admin.` });
        onDone?.();
      },
    });
  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-bold uppercase tracking-wide">Company name</label>
        <Input data-testid="input-company-name" className="mt-2 h-12 text-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kestrel Board Converters" />
      </div>
      <div>
        <label className="text-sm font-bold uppercase tracking-wide">Primary unit of measure</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["kg", "sheets", "m"] as const).map((u) => (
            <button key={u} type="button" data-testid={`button-unit-${u}`} onClick={() => setUnit(u)}
              className={cn("num h-14 rounded-md border-2 text-lg font-semibold transition-all active:scale-[.97]", unit === u ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40")}>{u}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between gap-4 rounded-md border bg-card p-4">
        <span><span className="block font-semibold">Load sample jobs</span><span className="text-sm text-muted-foreground">IK-202 and IK-203, flagged as sample data.</span></span>
        <Switch data-testid="switch-samples" checked={samples} onCheckedChange={setSamples} />
      </label>
      <ErrorPanel message={errMsg(create.error)} />
      <Button data-testid="button-create-company" size="lg" className="h-14 w-full text-base" disabled={!name.trim() || create.isPending} onClick={submit}>
        {create.isPending ? "Creating…" : "Create company"}
      </Button>
    </div>
  );
}

export function JoinCompanyForm({ onDone }: { onDone?: () => void }) {
  const [code, setCode] = useState("");
  const join = useJoinCompany();
  const qc = useQueryClient();
  const { setCompanyId } = useCompany();
  const { toast } = useToast();
  const submit = () =>
    join.mutate({ data: { code: code.trim() } }, {
      onSuccess: async (c) => {
        await qc.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        setCompanyId(c.id);
        toast({ title: "Joined", description: `You are now a member of ${c.name}.` });
        onDone?.();
      },
    });
  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-bold uppercase tracking-wide">Invite code</label>
        <Input data-testid="input-invite-code" className="num mt-2 h-16 text-center text-2xl tracking-[0.3em] uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" />
        <p className="mt-2 text-sm text-muted-foreground">Your admin shares this code with you directly.</p>
      </div>
      <ErrorPanel message={errMsg(join.error)} />
      <Button data-testid="button-join-company" size="lg" className="h-14 w-full text-base" disabled={!code.trim() || join.isPending} onClick={submit}>
        {join.isPending ? "Joining…" : "Join company"}
      </Button>
    </div>
  );
}
