"use client";

import { FinancialBarChart } from "@/components/charts/financial-bar-chart";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";

function DataTable({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) return <p className="text-sm text-muted">No data available.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-bg">
          <tr>
            {columns.map((col) => (
              <th key={col} className="border-b border-border p-2 text-left capitalize">
                {col.replaceAll("_", " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-border/50 last:border-none">
              {columns.map((col) => (
                <td key={col} className="p-2">
                  {typeof row[col] === "number" ? formatNumber(row[col] as number) : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialsSection({
  quarterly,
  yearly,
  incomeStatement,
  balanceSheet,
  cashFlow
}: {
  quarterly: Array<{ period: string; revenue: number; profit: number }>;
  yearly: Array<{ period: string; revenue: number; profit: number; assets: number; cashFlow: number }>;
  incomeStatement: Array<Record<string, string | number>>;
  balanceSheet: Array<Record<string, string | number>>;
  cashFlow: Array<Record<string, string | number>>;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Financial Statements</h3>
      <Tabs defaultValue="income" className="mt-3">
        <TabsList>
          <TabsTrigger value="income">Income Statement</TabsTrigger>
          <TabsTrigger value="balance">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="income" className="space-y-3">
          <FinancialBarChart data={quarterly} firstKey="revenue" secondKey="profit" />
          <DataTable rows={incomeStatement.length ? incomeStatement : quarterly} />
        </TabsContent>

        <TabsContent value="balance" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="assets" secondKey="profit" />
          <DataTable rows={balanceSheet.length ? balanceSheet : yearly} />
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <FinancialBarChart data={yearly} firstKey="cashFlow" secondKey="profit" />
          <DataTable rows={cashFlow.length ? cashFlow : yearly} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
