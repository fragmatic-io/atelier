// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors

'use client';

/**
 * `CheckoutWizard` — the `/checkout` flow. Three steps, progressive
 * disclosure: Shipping → Payment → Review. The skill
 * `checkout-progressive` calls for the sidebar Wizard variant (Vis-4).
 *
 * Each step is its own form so submitted state remains visible after the
 * step is completed. Review summarises the whole order.
 *
 * Pure client component; nothing here actually charges a card. Submitting
 * the review step just shows a celebratory empty-cart screen — the demo
 * bows out cleanly at the place a real checkout would hand off to a
 * payment processor.
 */

import { useState, type FormEvent, type ReactNode } from 'react';

type StepId = 'shipping' | 'payment' | 'review';

interface ShippingDetails {
  name: string;
  address1: string;
  city: string;
  postal: string;
  country: string;
}

interface PaymentDetails {
  cardNumber: string;
  expiry: string;
  cvc: string;
}

const STEPS: { id: StepId; label: string; description: string }[] = [
  { id: 'shipping', label: 'Shipping', description: 'Where should this go?' },
  { id: 'payment', label: 'Payment', description: 'How are you paying?' },
  { id: 'review', label: 'Review', description: 'Everything in order?' },
];

export function CheckoutWizard(): ReactNode {
  const [active, setActive] = useState<StepId>('shipping');
  const [completed, setCompleted] = useState<ReadonlySet<StepId>>(() => new Set());
  const [shipping, setShipping] = useState<ShippingDetails>({
    name: '',
    address1: '',
    city: '',
    postal: '',
    country: 'United States',
  });
  const [payment, setPayment] = useState<PaymentDetails>({
    cardNumber: '',
    expiry: '',
    cvc: '',
  });
  const [placed, setPlaced] = useState(false);

  const completeStep = (id: StepId, next: StepId | null): void => {
    setCompleted((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
    if (next) setActive(next);
  };

  const handleShipping = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    completeStep('shipping', 'payment');
  };
  const handlePayment = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    completeStep('payment', 'review');
  };
  const handlePlace = (): void => {
    completeStep('review', null);
    setPlaced(true);
  };

  if (placed) {
    return (
      <div
        data-cir-component="CheckoutComplete"
        style={{
          padding: '60px 20px',
          textAlign: 'center',
          background: 'var(--cir-color-bg-card)',
          border: '1px solid var(--cir-color-border-subtle)',
          borderRadius: 'var(--cir-radius-lg)',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }} aria-hidden="true">
          ✓
        </div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--cir-color-fg)',
            marginBottom: 8,
          }}
        >
          Order placed
        </div>
        <div
          style={{
            fontSize: 14,
            color: 'var(--cir-color-fg-muted)',
            marginBottom: 20,
          }}
        >
          Thanks, {shipping.name || 'friend'}. We sent a confirmation to your inbox.
        </div>
        <a
          href="/browse"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 'var(--cir-radius-md)',
            background: 'var(--cir-color-primary)',
            color: 'var(--cir-color-fg-on-primary)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Keep browsing
        </a>
      </div>
    );
  }

  return (
    <div
      data-cir-component="CheckoutWizard"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 220px) 1fr',
        gap: 32,
        alignItems: 'start',
      }}
    >
      <ol
        data-cir-part="sidebar"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'var(--cir-color-bg-card)',
          border: '1px solid var(--cir-color-border-subtle)',
          borderRadius: 'var(--cir-radius-lg)',
        }}
      >
        {STEPS.map((s, i) => {
          const isActive = s.id === active;
          const isDone = completed.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!isDone && !isActive}
                onClick={() => isDone && setActive(s.id)}
                style={{
                  appearance: 'none',
                  border: 0,
                  background: isActive ? 'var(--cir-color-bg-subtle)' : 'transparent',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 'var(--cir-radius-md)',
                  cursor: isDone ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: isDone
                      ? 'var(--cir-color-success)'
                      : isActive
                        ? 'var(--cir-color-primary)'
                        : 'var(--cir-color-bg-muted)',
                    color: isDone || isActive ? '#fff' : 'var(--cir-color-fg-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {isDone ? '✓' : i + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: isActive ? 'var(--cir-color-fg)' : 'var(--cir-color-fg-muted)',
                  }}
                >
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div data-cir-part="step-body">
        {active === 'shipping' ? (
          <form
            onSubmit={handleShipping}
            data-cir-step="shipping"
            style={{
              background: 'var(--cir-color-bg-card)',
              border: '1px solid var(--cir-color-border-subtle)',
              borderRadius: 'var(--cir-radius-lg)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <header style={{ marginBottom: 6 }}>
              <h2
                style={{ fontSize: 18, fontWeight: 700, color: 'var(--cir-color-fg)', margin: 0 }}
              >
                Shipping
              </h2>
              <p style={{ fontSize: 13, color: 'var(--cir-color-fg-muted)', margin: '4px 0 0' }}>
                Where should we send your order?
              </p>
            </header>
            <Field
              label="Full name"
              value={shipping.name}
              onChange={(v) => setShipping((s) => ({ ...s, name: v }))}
              required
            />
            <Field
              label="Address"
              value={shipping.address1}
              onChange={(v) => setShipping((s) => ({ ...s, address1: v }))}
              required
            />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Field
                label="City"
                value={shipping.city}
                onChange={(v) => setShipping((s) => ({ ...s, city: v }))}
                required
              />
              <Field
                label="Postal"
                value={shipping.postal}
                onChange={(v) => setShipping((s) => ({ ...s, postal: v }))}
                required
              />
            </div>
            <Field
              label="Country"
              value={shipping.country}
              onChange={(v) => setShipping((s) => ({ ...s, country: v }))}
            />
            <SubmitButton label="Continue to payment" />
          </form>
        ) : null}

        {active === 'payment' ? (
          <form
            onSubmit={handlePayment}
            data-cir-step="payment"
            style={{
              background: 'var(--cir-color-bg-card)',
              border: '1px solid var(--cir-color-border-subtle)',
              borderRadius: 'var(--cir-radius-lg)',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <header>
              <h2
                style={{ fontSize: 18, fontWeight: 700, color: 'var(--cir-color-fg)', margin: 0 }}
              >
                Payment
              </h2>
              <p style={{ fontSize: 13, color: 'var(--cir-color-fg-muted)', margin: '4px 0 0' }}>
                Card details — demo only, never sent.
              </p>
            </header>
            <Field
              label="Card number"
              value={payment.cardNumber}
              onChange={(v) => setPayment((s) => ({ ...s, cardNumber: v }))}
              placeholder="4242 4242 4242 4242"
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field
                label="Expiry"
                value={payment.expiry}
                onChange={(v) => setPayment((s) => ({ ...s, expiry: v }))}
                placeholder="MM/YY"
              />
              <Field
                label="CVC"
                value={payment.cvc}
                onChange={(v) => setPayment((s) => ({ ...s, cvc: v }))}
                placeholder="123"
              />
            </div>
            <SubmitButton label="Review order" />
          </form>
        ) : null}

        {active === 'review' ? (
          <div
            data-cir-step="review"
            style={{
              background: 'var(--cir-color-bg-card)',
              border: '1px solid var(--cir-color-border-subtle)',
              borderRadius: 'var(--cir-radius-lg)',
              padding: 24,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--cir-color-fg)', margin: 0 }}>
              Review
            </h2>
            <p style={{ fontSize: 13, color: 'var(--cir-color-fg-muted)', margin: '4px 0 14px' }}>
              Take one last look — placing the order is reversible up to dispatch.
            </p>
            <SummaryBlock title="Shipping to">
              <div>{shipping.name || '—'}</div>
              <div>{shipping.address1 || '—'}</div>
              <div>
                {shipping.city || '—'}, {shipping.postal || '—'}
              </div>
              <div>{shipping.country}</div>
            </SummaryBlock>
            <SummaryBlock title="Payment">
              <div className="cir-mono">
                {payment.cardNumber ? `•••• ${payment.cardNumber.slice(-4)}` : '—'}
              </div>
            </SummaryBlock>
            <button
              type="button"
              onClick={handlePlace}
              style={{
                marginTop: 18,
                width: '100%',
                appearance: 'none',
                border: 0,
                background: 'var(--cir-color-primary)',
                color: 'var(--cir-color-fg-on-primary)',
                padding: '12px 18px',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 'var(--cir-radius-md)',
                cursor: 'pointer',
              }}
            >
              Place order
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
CheckoutWizard.displayName = 'CheckoutWizard';

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}): ReactNode {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--cir-color-fg-muted)', fontWeight: 600 }}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{
          padding: '9px 12px',
          fontSize: 13,
          border: '1px solid var(--cir-color-border-default)',
          background: 'var(--cir-color-bg-surface)',
          color: 'var(--cir-color-fg)',
          borderRadius: 'var(--cir-radius-md)',
        }}
      />
    </label>
  );
}

function SubmitButton({ label }: { label: string }): ReactNode {
  return (
    <button
      type="submit"
      style={{
        marginTop: 6,
        appearance: 'none',
        border: 0,
        background: 'var(--cir-color-primary)',
        color: 'var(--cir-color-fg-on-primary)',
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 'var(--cir-radius-md)',
        cursor: 'pointer',
        alignSelf: 'flex-start',
      }}
    >
      {label}
    </button>
  );
}

function SummaryBlock({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section
      style={{
        marginBottom: 14,
        padding: 14,
        background: 'var(--cir-color-bg-subtle)',
        borderRadius: 'var(--cir-radius-md)',
        fontSize: 13,
        color: 'var(--cir-color-fg)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--cir-color-fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}
