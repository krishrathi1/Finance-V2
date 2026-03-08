"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DocRow } from "@/lib/types";

function DocumentList({ docs }: { docs: DocRow[] }) {
  if (!docs.length) return <p className="py-4 text-sm text-muted">No documents available.</p>;
  return (
    <div className="overflow-auto rounded-xl border border-border/70">
      <table className="w-full text-sm">
        <thead className="bg-bg">
          <tr>
            <th className="border-b border-border p-2 text-left">Title</th>
            <th className="border-b border-border p-2 text-left">Link</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((item, index) => (
            <tr key={index} className="border-b border-border/50 last:border-none">
              <td className="p-2">{item.title}</td>
              <td className="p-2">
                <Link href={item.url} target="_blank" className="text-accent hover:underline">
                  Download
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocumentsSection({
  annualReports,
  investorPresentations,
  creditRatings,
  exchangeFilings
}: {
  annualReports: DocRow[];
  investorPresentations: DocRow[];
  creditRatings: DocRow[];
  exchangeFilings: DocRow[];
}) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Documents</h3>
      <Tabs defaultValue="annual" className="mt-3">
        <TabsList>
          <TabsTrigger value="annual">Annual Reports</TabsTrigger>
          <TabsTrigger value="presentations">Investor Presentations</TabsTrigger>
          <TabsTrigger value="ratings">Credit Ratings</TabsTrigger>
          <TabsTrigger value="filings">Exchange Filings</TabsTrigger>
        </TabsList>
        <TabsContent value="annual">
          <DocumentList docs={annualReports} />
        </TabsContent>
        <TabsContent value="presentations">
          <DocumentList docs={investorPresentations} />
        </TabsContent>
        <TabsContent value="ratings">
          <DocumentList docs={creditRatings} />
        </TabsContent>
        <TabsContent value="filings">
          <DocumentList docs={exchangeFilings} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
