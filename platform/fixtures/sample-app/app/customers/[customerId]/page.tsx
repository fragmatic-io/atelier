import { CustomerSummaryCard } from '../../../components/CustomerSummaryCard';
import { CustomerActivityTimeline } from '../../../components/CustomerActivityTimeline';
import { AtelierSlot } from '@atelier/react';

interface CustomerPageProps {
  params: Promise<{ customerId: string }>;
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { customerId } = await params;
  const customer = await fetch(`/api/customers/${customerId}`).then((r) => r.json());
  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <CustomerSummaryCard customer={customer} />
        <CustomerActivityTimeline customerId={customerId} />
      </div>
      <aside>
        <AtelierSlot
          id="customer.detail.right-rail"
          context={{ entity: { type: 'Customer', id: customerId }, role: 'support_manager' }}
          maxAdaptationLevel={2}
          allowWriteActions
        />
      </aside>
    </main>
  );
}
