"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ButtonsOptions = {
  style?: { label?: string };
  createSubscription: (
    data: unknown,
    actions: { subscription: { create: (o: { plan_id: string }) => Promise<string> } },
  ) => Promise<string>;
  onApprove: (data: { subscriptionID?: string | null }) => void;
  onError: (err: unknown) => void;
};

declare global {
  interface Window {
    paypal?: { Buttons: (o: ButtonsOptions) => { render: (el: HTMLElement) => Promise<void> } };
  }
}

export function SubscribeButton(props: { clientId: string; planId: string; currency: string }) {
  const { clientId, planId, currency } = props;
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!ready || !el || !window.paypal) return;
    el.innerHTML = "";
    window.paypal
      .Buttons({
        style: { label: "subscribe" },
        createSubscription: (_data, actions) => actions.subscription.create({ plan_id: planId }),
        onApprove: (data) => {
          if (data.subscriptionID) router.push(`/buyer/${data.subscriptionID}`);
        },
        onError: (err) => {
          console.error(err);
          setError("PayPal couldn't start the subscription. Please try again.");
        },
      })
      .render(el)
      .catch(() => setError("Couldn't load the PayPal button."));
  }, [ready, planId, router]);

  const src =
    `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}` +
    `&vault=true&intent=subscription&currency=${encodeURIComponent(currency)}`;

  return (
    <>
      <Script src={src} onReady={() => setReady(true)} />
      <div ref={ref} className="min-h-12" />
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </>
  );
}
