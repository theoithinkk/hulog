"use client";

import { useFormStatus } from "react-dom";

// A submit button for server actions that wait on PayPal: says it's working, and can't be tapped twice.
export function PendingButton({
  children,
  pendingText,
  className,
}: {
  children: React.ReactNode;
  pendingText: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
