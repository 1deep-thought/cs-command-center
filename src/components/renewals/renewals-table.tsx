import type { ReactNode } from "react";
import type { AccountRenewalRow } from "@/types/renewals";
import {
  AccountCell,
  ArrCell,
  LastCallCell,
  RenewalCell,
  SeatsCell,
  UsageCell,
} from "./cells";
import { COLUMNS, TableColGroup, TableHead, alignClass, type ColumnKey } from "./columns";
import { HealthCell } from "./health-cell";
import { CELL, ROW, TABLE, TABLE_FRAME } from "./layout";
import { RiskDrivers } from "./risk-drivers";

function renderCell(key: ColumnKey, row: AccountRenewalRow): ReactNode {
  switch (key) {
    case "account":
      return <AccountCell row={row} />;
    case "arr":
      return <ArrCell row={row} />;
    case "renewal":
      return <RenewalCell row={row} />;
    case "health":
      return <HealthCell row={row} />;
    case "seats":
      return <SeatsCell row={row} />;
    case "usage":
      return <UsageCell row={row} />;
    case "call":
      return <LastCallCell row={row} />;
    case "drivers":
      return <RiskDrivers drivers={row.risk_drivers} gaps={row.data_gaps} />;
  }
}

export function RenewalsTableFrame({ children }: { children: ReactNode }) {
  return (
    <div className={TABLE_FRAME}>
      <table className={TABLE}>
        <TableColGroup />
        <TableHead />
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Rows arrive sorted by the API (spec §3.3). Never re-sort here. */
export function RenewalsTable({ accounts }: { accounts: AccountRenewalRow[] }) {
  return (
    <RenewalsTableFrame>
      {accounts.map((row) => (
        <tr
          key={row.account_id}
          className={`${ROW} hover:bg-zinc-50 dark:hover:bg-zinc-900/60`}
        >
          {COLUMNS.map((c) => (
            <td key={c.key} className={`${CELL} ${alignClass(c.align)}`}>
              {renderCell(c.key, row)}
            </td>
          ))}
        </tr>
      ))}
    </RenewalsTableFrame>
  );
}
