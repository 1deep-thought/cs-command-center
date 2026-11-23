import type { PovDecision, PovStatus } from "@/types/pov";
import { DECISION_BADGE, DECISION_LABEL, STATUS_BADGE, STATUS_LABEL } from "./labels";
import { BADGE } from "./layout";

/** A decided plan shows its decision (Go / Extend / No-go); every other status is neutral. */
export function StatusBadge({ status, decision }: { status: PovStatus; decision: PovDecision | null }) {
  if (status === "decided" && decision) {
    return (
      <span className={`${BADGE} ${DECISION_BADGE[decision]}`}>
        <span className="sr-only">Decided: </span>
        {DECISION_LABEL[decision]}
      </span>
    );
  }
  return <span className={`${BADGE} ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
}
