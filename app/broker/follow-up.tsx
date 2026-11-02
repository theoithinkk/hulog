"use client";

import { useRef, useState, useTransition } from "react";
// Type-only: a value import would ship the Anthropic SDK to the browser.
import type { Draft } from "@/lib/followup";
import type { Lang } from "@/lib/explain";
import { draftBuyerFollowUp, resumePlan } from "./actions";

const outline =
  "min-h-11 rounded-lg border-2 border-aubergine bg-panel px-4 py-2 font-semibold text-aubergine transition-colors hover:bg-aubergine/5 disabled:cursor-wait disabled:opacity-60";
const solid =
  "min-h-11 rounded-lg bg-aubergine px-4 py-2 font-semibold text-shell-ink transition-colors hover:bg-aubergine-raised disabled:cursor-wait disabled:opacity-60";

// Sits inside a row whose name link covers the whole row, so it has to sit above that link.
export function FollowUp({
  subscriptionId,
  name,
  suspended,
  locked,
}: {
  subscriptionId: string;
  name: string;
  suspended: boolean;
  locked: boolean;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [error, setError] = useState("");
  const [drafting, startDraft] = useTransition();
  const [resuming, startResume] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);

  function write(lang: Lang) {
    setError("");
    setCopied(false);
    startDraft(async () => {
      try {
        const d = await draftBuyerFollowUp(subscriptionId, lang);
        setDraft(d);
        setText(d.text);
      } catch {
        setError("Couldn't draft a message just now. Please try again.");
      }
    });
  }

  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Some browsers and in-app web views refuse the clipboard API; selecting the text works in more of them.
      box.current?.select();
      if (document.execCommand("copy")) setCopied(true);
      else setError("Couldn't copy automatically. The text is selected, so copy it yourself.");
    }
  }

  function resume() {
    setError("");
    startResume(async () => {
      try {
        await resumePlan(subscriptionId);
        setResumed(true);
      } catch {
        setError("PayPal couldn't resume this plan. Please try again.");
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <div className="relative z-10 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => write("en")} disabled={drafting} className={solid}>
          {drafting ? "Drafting…" : "Draft follow-up"}
        </button>
        <button type="button" onClick={() => write("fil")} disabled={drafting} className={outline}>
          In Filipino
        </button>
        {suspended && !locked && !resumed && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className={outline}>
            Resume plan
          </button>
        )}
      </div>

      {suspended && locked && <p className="text-[0.9375rem] text-ink-soft">Prepared example, so Resume plan is off here.</p>}

      {confirming && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-ground p-3">
          <p>Restart PayPal charges on this plan? The buyer stays marked as behind until a payment comes through.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={resume} disabled={resuming} className={solid}>
              {resuming ? "Updating PayPal…" : "Yes, resume"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={resuming} className={outline}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {resumed && <p role="status">Plan resumed. Hulog will clear this once the next payment comes through.</p>}

      {draft && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`draft-${subscriptionId}`} className="font-semibold">
            Message to {name}
          </label>
          <textarea
            id={`draft-${subscriptionId}`}
            ref={box}
            rows={10}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            className="rounded-lg border-2 border-line bg-panel px-3 py-2 focus:border-aubergine"
          />
          <p className="text-[0.9375rem] text-ink-soft">
            {draft.source === "ai" ? "Written by AI; its numbers were checked against the buyer's records." : "Standard message."} Review
            it and send it through your usual channel. Hulog doesn&apos;t send anything.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} disabled={!text.trim()} className={outline}>
              Copy message
            </button>
            {copied && <span role="status">Copied</span>}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-magenta-deep">
          {error}
        </p>
      )}
    </div>
  );
}
