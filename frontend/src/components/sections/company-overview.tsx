import Link from "next/link";
import { Building2, Calendar, ExternalLink, Globe, User, History, Users, Briefcase } from "lucide-react";

import { Card } from "@/components/ui/card";

export function CompanyOverview({
  description,
  incorporationYear,
  headquarters,
  website,
  chairman,
  previousName,
  ceo,
  employees,
  ipoDate,
  country,
}: {
  description: string;
  incorporationYear: number;
  headquarters: string;
  website: string;
  chairman: string;
  previousName: string;
  ceo?: string;
  employees?: number | string;
  ipoDate?: string;
  country?: string;
}) {
  const profileItems = [
    ...(ceo ? [{ icon: <Briefcase className="h-3.5 w-3.5" />, label: "CEO", value: ceo }] : []),
    { icon: <Calendar className="h-3.5 w-3.5" />, label: "Incorporation", value: incorporationYear ? String(incorporationYear) : "N/A" },
    ...(ipoDate ? [{ icon: <Calendar className="h-3.5 w-3.5" />, label: "IPO Date", value: ipoDate }] : []),
    { icon: <Building2 className="h-3.5 w-3.5" />, label: "Headquarters", value: (headquarters || country) ? `${headquarters || ""}${headquarters && country ? ", " : ""}${country || ""}` : "N/A" },
    ...(employees ? [{ icon: <Users className="h-3.5 w-3.5" />, label: "Employees", value: Number(employees).toLocaleString("en-IN") }] : []),
    { icon: <User className="h-3.5 w-3.5" />, label: "Chairman", value: chairman || "N/A" },
    { icon: <History className="h-3.5 w-3.5" />, label: "Previous Name", value: previousName || "N/A" },
  ];

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card className="flex h-[230px] flex-col p-4 xl:col-span-2">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-accent to-amber-400" />
          <h3 className="text-lg font-semibold">Company Overview</h3>
        </div>
        <div className="company-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-sm leading-7 text-muted">{description}</p>
        </div>
      </Card>
      <Card className="flex h-[230px] flex-col p-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-gradient-to-b from-blue-500 to-cyan-400" />
          <h3 className="text-lg font-semibold">Profile</h3>
        </div>
        <div className="company-scroll mt-3 space-y-3 overflow-y-auto pr-1 text-sm">
          {profileItems.map((item) => (
            <div key={item.label} className="flex items-start gap-2.5">
              <span className="mt-0.5 text-muted">{item.icon}</span>
              <div>
                <p className="text-[11px] text-muted">{item.label}</p>
                <p className="font-medium">{item.value}</p>
              </div>
            </div>
          ))}
          {website ? (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 text-muted"><Globe className="h-3.5 w-3.5" /></span>
              <div>
                <p className="text-[11px] text-muted">Website</p>
                <Link href={website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  <span className="break-all text-sm font-medium">{website.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
