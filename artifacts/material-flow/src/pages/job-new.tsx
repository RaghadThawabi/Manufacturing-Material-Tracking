import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { useListAssignees, getListAssigneesQueryKey, useCreateJob, useTransitionJob, getListJobsQueryKey, getGetSummaryQueryKey, type JobInput } from "@workspace/api-client-react";
import { PageHeader } from "@/components/mf-ui";
import { JobWizard } from "@/components/job-wizard";
import { canReview, emptyJob, errMsg, useCompany } from "@/lib/mf";
import { useToast } from "@/hooks/use-toast";

export default function JobNew() {
  const { company } = useCompany();
  const [, nav] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const create = useCreateJob();
  const transition = useTransitionJob();
  const [err, setErr] = useState("");
  const id = company!.id;
  const { user } = useAuth();
  const as = useListAssignees(id, { query: { queryKey: getListAssigneesQueryKey(id) } });
  const reviewer = canReview(company!.role);
  const assignees = (as.data ?? []).filter((a) => reviewer || a.userId === user?.id);
  const save = async (j: JobInput, submit: boolean) => {
    setErr("");
    try {
      const { version: _v, ...data } = j;
      void _v;
      let job = await create.mutateAsync({ companyId: id, data });
      if (submit) job = await transition.mutateAsync({ companyId: id, jobId: job.id, data: { action: "submit", version: job.version } });
      qc.invalidateQueries({ queryKey: getListJobsQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetSummaryQueryKey(id) });
      toast({ title: submit ? "Submitted for review" : "Draft saved", description: `Job ${job.number}` });
      nav(`/jobs/${job.id}`);
    } catch (e) { setErr(errMsg(e)); }
  };
  return (
    <>
      <PageHeader eyebrow="New record" title="Record a job" />
      {as.isLoading || !user ? <div className="h-64 animate-pulse rounded-md bg-muted" /> : <JobWizard key={`${id}:${user.id}`} company={company!} recordingVersion={2} assignees={assignees} assignMode={reviewer ? "any" : "self"}
        initial={{ ...emptyJob(company), assignedTo: reviewer ? null : user?.id ?? null }} pending={create.isPending || transition.isPending} error={err} onSave={save} onCancel={() => nav("/jobs")} />}
    </>
  );
}
