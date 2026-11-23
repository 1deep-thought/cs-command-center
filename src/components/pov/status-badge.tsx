import type { PovDecision, PovStatus } from "@/types/pov";
import { DECISION_LABEL, DECISION_TEXT, STATUS_BADGE, STATUS_LABEL } from "./labels";
import { BADGE } from "./layout";

export function StatusBadge({ status, decision }: { status: PovStatus; decision: PovDecision | null }) {
  return (
    <span className={`${BADGE} ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
      {status === "decided" && decision ? (
        <span className={DECISION_TEXT[decision]}>· {DECISION_LABEL[decision]}</span>
      ) : null}
    </span>
  );
}
