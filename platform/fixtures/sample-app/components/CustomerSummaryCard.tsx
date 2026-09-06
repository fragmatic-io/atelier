interface CustomerSummaryCardProps {
  customer: {
    id: string;
    name: string;
    status: 'healthy' | 'at_risk' | 'escalated';
    riskScore: number;
    plan: string;
  };
}

export function CustomerSummaryCard({ customer }: CustomerSummaryCardProps) {
  return (
    <section className="border-b border-slate-200 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.plan}</p>
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {customer.status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div>
          <dt>Risk</dt>
          <dd>{customer.riskScore}</dd>
        </div>
      </dl>
    </section>
  );
}
