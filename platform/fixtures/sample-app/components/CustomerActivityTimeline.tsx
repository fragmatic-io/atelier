interface CustomerActivityTimelineProps {
  customerId: string;
}
export function CustomerActivityTimeline({ customerId }: CustomerActivityTimelineProps) {
  return (
    <section className="divide-y divide-slate-100">
      <h2 className="py-3 font-medium">Recent activity</h2>
      <p className="py-3 text-sm">Activity for {customerId}</p>
    </section>
  );
}
