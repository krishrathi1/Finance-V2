"use client";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionRow } from "@/lib/types";

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[320px] overflow-auto rounded-xl border border-border/70">{children}</div>;
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `₹ ${value.toFixed(2).replace(/\.00$/, "")}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(2).replace(/\.00$/, "")} %`;
}

function BoardMeetingTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Meeting Date</th>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Agenda</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.agenda || row.orderType || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function ActionTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[720px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Date</th>
            <th className="border-b border-border p-2 text-left">Client</th>
            <th className="border-b border-border p-2 text-left">Order Type</th>
            <th className="border-b border-border p-2 text-left">Quantity</th>
            <th className="border-b border-border p-2 text-left">Average Price</th>
            <th className="border-b border-border p-2 text-left">Exchange</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.client}</td>
              <td className="p-2">{row.orderType}</td>
              <td className="p-2">{row.quantity}</td>
              <td className="p-2">{row.price}</td>
              <td className="p-2">{row.exchange}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function mergeDealRows(actions: Record<string, ActionRow[]>) {
  const explicitDeals = actions.deals || [];
  if (explicitDeals.length) {
    return explicitDeals;
  }

  const merged = [
    ...(actions.bulkDeals || []).map((row) => ({ ...row, dealType: row.dealType || "Bulk" })),
    ...(actions.blockDeals || []).map((row) => ({ ...row, dealType: row.dealType || "Block" }))
  ];

  const seen = new Set<string>();
  return merged
    .filter((row) => {
      const key = [
        row.date,
        row.client,
        row.quantity,
        row.price,
        row.exchange,
        row.dealType,
        row.orderType
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.date || "") || 0;
      const bTime = Date.parse(b.date || "") || 0;
      return bTime - aTime;
    });
}

function DealsTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[820px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Date</th>
            <th className="border-b border-border p-2 text-left">Client</th>
            <th className="border-b border-border p-2 text-left">Deal Type</th>
            <th className="border-b border-border p-2 text-left">Order Type</th>
            <th className="border-b border-border p-2 text-left">Quantity</th>
            <th className="border-b border-border p-2 text-left">Average Price</th>
            <th className="border-b border-border p-2 text-left">Exchange</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.date}</td>
              <td className="p-2">{row.client}</td>
              <td className="p-2">{row.dealType || "-"}</td>
              <td className="p-2">{row.orderType}</td>
              <td className="p-2">{row.quantity}</td>
              <td className="p-2">{row.price}</td>
              <td className="p-2">{row.exchange}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function DividendsTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[860px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Type</th>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Ex-Date</th>
            <th className="border-b border-border p-2 text-left">Record Date</th>
            <th className="border-b border-border p-2 text-left">Dividend(₹)</th>
            <th className="border-b border-border p-2 text-left">Dividend(%)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.type || "Dividend"}</td>
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.exDate || row.date || "-"}</td>
              <td className="p-2">{row.recordDate || "-"}</td>
              <td className="p-2">{formatMoney(row.dividendAmount)}</td>
              <td className="p-2">{formatPercent(row.dividendPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function BonusTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Ex-Date</th>
            <th className="border-b border-border p-2 text-left">Record Date</th>
            <th className="border-b border-border p-2 text-left">Bonus Ratio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.exDate || row.date || "-"}</td>
              <td className="p-2">{row.recordDate || "-"}</td>
              <td className="p-2">{row.bonusRatio || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function SplitTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[820px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Ex-Date</th>
            <th className="border-b border-border p-2 text-left">Record Date</th>
            <th className="border-b border-border p-2 text-left">Split Ratio</th>
            <th className="border-b border-border p-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.exDate || row.date || "-"}</td>
              <td className="p-2">{row.recordDate || "-"}</td>
              <td className="p-2">{row.splitRatio || "-"}</td>
              <td className="p-2">{row.details || row.orderType || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function RightsTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[820px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Ex-Date</th>
            <th className="border-b border-border p-2 text-left">Record Date</th>
            <th className="border-b border-border p-2 text-left">Rights Ratio</th>
            <th className="border-b border-border p-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.exDate || row.date || "-"}</td>
              <td className="p-2">{row.recordDate || "-"}</td>
              <td className="p-2">{row.rightsRatio || "-"}</td>
              <td className="p-2">{row.details || row.orderType || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function AgmEgmTable({ rows }: { rows: ActionRow[] }) {
  if (!rows.length) return <p className="py-4 text-sm text-muted">No records available.</p>;
  return (
    <TableShell>
      <table className="w-full min-w-[760px] text-sm">
        <thead className="sticky top-0 z-10 bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Date</th>
            <th className="border-b border-border p-2 text-left">Announcement Date</th>
            <th className="border-b border-border p-2 text-left">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-b border-border/50 last:border-none">
              <td className="p-2">{row.exDate || row.date || "-"}</td>
              <td className="p-2">{row.announcementDate || "-"}</td>
              <td className="p-2">{row.details || row.orderType || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

export function CorporateActionsSection({ actions }: { actions: Record<string, ActionRow[]> }) {
  const dealRows = mergeDealRows(actions);

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Corporate Actions and Deals</h3>
      <Tabs defaultValue="boardMeetings" className="mt-3">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="boardMeetings">Board Meetings</TabsTrigger>
          <TabsTrigger value="dividends">Dividends</TabsTrigger>
          <TabsTrigger value="bonusIssues">Bonus Issues</TabsTrigger>
          <TabsTrigger value="stockSplits">Stock Splits</TabsTrigger>
          <TabsTrigger value="rightsIssues">Rights Issues</TabsTrigger>
          <TabsTrigger value="agmEgm">AGM / EGM</TabsTrigger>
          <TabsTrigger value="deals">Deals</TabsTrigger>
          <TabsTrigger value="insiderTrades">Insider Trades</TabsTrigger>
        </TabsList>

        <TabsContent value="boardMeetings">
          <BoardMeetingTable rows={actions.boardMeetings || []} />
        </TabsContent>
        <TabsContent value="dividends">
          <DividendsTable rows={actions.dividends || []} />
        </TabsContent>
        <TabsContent value="bonusIssues">
          <BonusTable rows={actions.bonusIssues || []} />
        </TabsContent>
        <TabsContent value="stockSplits">
          <SplitTable rows={actions.stockSplits || []} />
        </TabsContent>
        <TabsContent value="rightsIssues">
          <RightsTable rows={actions.rightsIssues || []} />
        </TabsContent>
        <TabsContent value="agmEgm">
          <AgmEgmTable rows={actions.agmEgm || []} />
        </TabsContent>
        <TabsContent value="deals">
          <DealsTable rows={dealRows} />
        </TabsContent>
        <TabsContent value="insiderTrades">
          <ActionTable rows={actions.insiderTrades || []} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
