import Link from "next/link";

import { Card } from "@/components/ui/card";

export function CompanyOverview({
  description,
  incorporationYear,
  headquarters,
  website,
  chairman,
  previousName
}: {
  description: string;
  incorporationYear: number;
  headquarters: string;
  website: string;
  chairman: string;
  previousName: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card className="flex h-[230px] flex-col p-4 lg:col-span-2">
        <h3 className="text-lg font-semibold">Company Overview</h3>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          <p className="text-sm leading-6 text-muted">{description}</p>
        </div>
      </Card>
      <Card className="h-[230px] p-4">
        <h3 className="text-lg font-semibold">Profile</h3>
        <div className="mt-2 space-y-2 text-sm">
          <p>
            <span className="text-muted">Incorporation:</span> {incorporationYear}
          </p>
          <p>
            <span className="text-muted">Headquarters:</span> {headquarters}
          </p>
          <p>
            <span className="text-muted">Chairman:</span> {chairman}
          </p>
          <p>
            <span className="text-muted">Previous Name:</span> {previousName}
          </p>
          <p>
            <span className="text-muted">Website:</span>{" "}
            <Link href={website} className="text-accent hover:underline">
              {website}
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
