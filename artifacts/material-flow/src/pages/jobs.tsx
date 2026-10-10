import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Search, X } from "lucide-react";
import { useListJobs, getListJobsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, JobRow, ErrorPanel, SummaryBoard, summarize } from "@/components/mf-ui";
import { errMsg, useCompany } from "@/lib/mf";

const ALL = "__all";

export default function Jobs() {
  const { company } = useCompany();
  const id = company!.id;
  const q = useListJobs(id, { query: { queryKey: getListJobsQueryKey(id) } });
  const [f, setF] = useState({ search: "", from: "", to: "", material: ALL, machine: ALL, product: ALL, status: ALL });
  const jobs = useMemo(() => q.data ?? [], [q.data]);
  const opts = (k: "material" | "machine" | "product") => [...new Set(jobs.map((j) => j[k]).filter(Boolean))].sort();
  const filtered = useMemo(() => jobs.filter((j) =>
    (!f.search || `${j.number} ${j.notes} ${j.instructions}`.toLowerCase().includes(f.search.toLowerCase())) &&
    (!f.from || j.date >= f.from) && (!f.to || j.date <= f.to) &&
    (f.material === ALL || j.material === f.material) && (f.machine === ALL || j.machine === f.machine) &&
    (f.product === ALL || j.product === f.product) && (f.status === ALL || j.status === f.status),
  ).sort((a, b) => b.date.localeCompare(a.date)), [jobs, f]);
  const dirty = JSON.stringify(f) !== JSON.stringify({ search: "", from: "", to: "", material: ALL, machine: ALL, product: ALL, status: ALL });
  const sel = (k: "material" | "machine" | "product" | "status", label: string, list: string[]) => (
    <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}>
      <SelectTrigger className="h-11" data-testid={`select-${k}`}><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>{list.map((o) => <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <>
      <PageHeader eyebrow={company!.name} title="Jobs"><Button asChild size="lg" className="h-12"><Link href="/jobs/new" data-testid="link-new-job"><Plus />Record job</Link></Button></PageHeader>
      <div className="rise mb-6 space-y-3 rounded-md border bg-card p-4">
        <div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input data-testid="input-search" className="h-11 pl-10" placeholder="Search job number or notes" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Input type="date" className="h-11" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} data-testid="input-from" aria-label="From date" />
          <Input type="date" className="h-11" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} data-testid="input-to" aria-label="To date" />
          {sel("material", "Materials", opts("material"))}{sel("machine", "Machines", opts("machine"))}{sel("product", "Products", opts("product"))}
          {sel("status", "Statuses", ["draft", "submitted", "returned", "approved"])}
        </div>
        {dirty && <Button variant="ghost" size="sm" onClick={() => setF({ search: "", from: "", to: "", material: ALL, machine: ALL, product: ALL, status: ALL })} data-testid="button-clear-filters"><X className="h-4 w-4" />Clear filters</Button>}
      </div>
      {q.isLoading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        : q.error ? <ErrorPanel message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : (
          <div className="space-y-8">
            <section className="rounded-md border bg-card">
              <p className="num border-b px-4 py-2.5 text-xs uppercase tracking-wider text-muted-foreground">{filtered.length} of {jobs.length} jobs</p>
              {filtered.length ? filtered.map((j) => <JobRow key={j.id} job={j} href={`/jobs/${j.id}`} />)
                : <div className="p-10 text-center"><p className="font-semibold">No jobs match.</p><p className="text-sm text-muted-foreground">{jobs.length ? "Adjust or clear the filters." : "Record your first job to start the ledger."}</p></div>}
            </section>
            {filtered.length > 0 && <div><h2 className="mb-3 text-lg font-bold">Comparison for current filter</h2><SummaryBoard summary={summarize(filtered)} /></div>}
          </div>
        )}
    </>
  );
}
