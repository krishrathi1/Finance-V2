import { Card } from "@/components/ui/card";

export function ResearchReportSection({ report }: { report: string }) {
  const safeReport = report?.trim() || "Analysis result is not available yet. Please retry in a few seconds.";
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">AI Research Report</h3>
      <article className="mt-3 max-w-none whitespace-pre-wrap text-sm leading-6 text-text">{safeReport}</article>
    </Card>
  );
}
