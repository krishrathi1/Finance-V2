import { Card } from "@/components/ui/card";

function ScoreArc({ score, color }: { score: number; color: string }) {
  const normalized = Math.max(0, Math.min(5, score));
  const circumference = 283;
  const progress = (normalized / 5) * circumference;
  return (
    <svg viewBox="0 0 120 120" className="h-40 w-40">
      <circle cx="60" cy="60" r="45" fill="none" stroke="rgba(130,148,179,0.25)" strokeWidth="10" strokeLinecap="round" />
      <circle
        cx="60"
        cy="60"
        r="45"
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={`${progress} ${circumference}`}
        strokeLinecap="round"
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" className="fill-current text-2xl font-semibold">
        {score.toFixed(1)}
      </text>
    </svg>
  );
}

export function SmartScore({
  score,
  dimensions,
  explanation
}: {
  score: number;
  dimensions: Record<string, number>;
  explanation: string;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold">Smart Score</h3>
      <div className="mt-2 flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-3">
          <ScoreArc score={score} color="#a764ff" />
          <div className="space-y-2 text-sm">
            {Object.entries(dimensions).map(([name, value]) => (
              <p key={name}>
                <span className="capitalize text-muted">{name}: </span>
                <span className="font-semibold">{value.toFixed(2)}</span>
              </p>
            ))}
          </div>
        </div>
        <p className="max-w-sm text-sm text-muted">{explanation}</p>
      </div>
    </Card>
  );
}
