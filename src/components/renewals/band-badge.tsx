import type { HealthBand } from "@/types/renewals";
import { BAND_BADGE, BAND_LABEL } from "./labels";

export function BandBadge({
  band,
  overridden = false,
}: {
  band: HealthBand;
  overridden?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap ${BAND_BADGE[band]}`}
    >
      {BAND_LABEL[band]}
      {overridden ? (
        <>
          <span aria-hidden="true" className="opacity-70">
            *
          </span>
          <span className="sr-only">(overridden by churn intent)</span>
        </>
      ) : null}
    </span>
  );
}
