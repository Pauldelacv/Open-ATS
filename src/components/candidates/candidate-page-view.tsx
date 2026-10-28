"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StageKind } from "@/lib/db/schema";
import { CandidatePanel } from "./candidate-panel";
import { EmailComposer } from "./email-composer";
import type { Recipient, TemplateOption } from "./email-fields";
import { RejectDialog } from "./reject-dialog";

/** Full-page version of the candidate panel, for one of the candidate's applications. */
export function CandidatePageView({
  applicationId,
  stages,
  recipient,
  templates,
  companyName,
  recruiterName,
  permissions,
  meId,
}: {
  applicationId: string;
  stages: Array<{ id: string; name: string; kind: StageKind }>;
  recipient: Recipient;
  templates: TemplateOption[];
  companyName: string;
  recruiterName: string;
  permissions: { move: boolean; reject: boolean; email: boolean; tag: boolean; note: boolean; evaluate: boolean; export: boolean; delete: boolean };
  meId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"reject" | "email" | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <>
      <CandidatePanel
        key={`${applicationId}-${version}`}
        mode="page"
        applicationId={applicationId}
        orderedIds={[applicationId]}
        stages={stages}
        onNavigate={() => {}}
        onClose={() => {}}
        onChanged={() => router.refresh()}
        onReject={() => setDialog("reject")}
        onEmail={() => setDialog("email")}
        permissions={permissions}
        meId={meId}
      />
      {dialog === "reject" ? (
        <RejectDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          recipients={[recipient]}
          templates={templates}
          companyName={companyName}
          recruiterName={recruiterName}
          onRejected={() => {
            setVersion((v) => v + 1);
            router.refresh();
          }}
        />
      ) : null}
      {dialog === "email" ? (
        <EmailComposer
          open
          onOpenChange={(o) => !o && setDialog(null)}
          recipients={[recipient]}
          templates={templates}
          companyName={companyName}
          recruiterName={recruiterName}
          onSent={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </>
  );
}
