// api/stars.ts — Telegram Stars "pay then run" orchestration for gated owner
// actions (deploy 1★, cloud-agent 10★). Keeps the Telegram SDK coupling out of
// the pure API client.
//
// Flow:
//   1. mint an invoice. If charging is off (payment_required=false), just run().
//   2. open it via Telegram.WebApp.openInvoice and await the outcome.
//   3. on 'paid', poll the intent until the backend records the payment (the
//      manager-bot feed lands successful_payment a few seconds later), then run
//      the action — which atomically consumes the paid intent.

import { openInvoice } from '../telegram';
import {
  createCloudAgentInvoice,
  getStarPayment,
  type StarInvoice,
} from './client';

// 'ok' — action ran (paid or free). 'cancelled' — user closed the sheet.
// 'failed' — payment failed. 'unconfirmed' — paid but the backend didn't record
// it in time (rare; the paid intent persists, so the next tap runs it free).
export type PayResult = 'ok' | 'cancelled' | 'failed' | 'unconfirmed';

// Display price (mirrors the backend default). The authoritative amount is
// always shown in Telegram's native payment sheet; this is just for the button
// label. Only cloud-agent assignment is charged — deploy is free.
export const STAR_COST = { cloudAgent: 10 } as const;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Poll the intent until it is paid/consumed (the gate can spend it), bounded.
async function waitPaid(paymentId: string, timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const p = await getStarPayment(paymentId);
      if (p.status === 'paid' || p.status === 'consumed') return true;
    } catch {
      /* transient (incl. rate-limit backoff) — keep polling */
    }
    await sleep(1500);
  }
  return false;
}

async function payAndRun(invoice: StarInvoice, run: () => Promise<void>): Promise<PayResult> {
  // Feature off → no payment step.
  if (!invoice.payment_required) {
    await run();
    return 'ok';
  }
  if (!invoice.invoice_link || !invoice.payment_id) {
    throw new Error('invoice response missing link/id');
  }

  const status = await openInvoice(invoice.invoice_link);
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';

  // 'paid' (or 'pending', which resolves shortly): wait for the backend to
  // record it, then run the gated action.
  const paid = await waitPaid(invoice.payment_id);
  if (!paid) return 'unconfirmed';
  await run();
  return 'ok';
}

// Pay 10★ then assign the cloud agent.
export function payAndAssignCloudAgent(projectId: string, run: () => Promise<void>): Promise<PayResult> {
  return createCloudAgentInvoice(projectId).then((inv) => payAndRun(inv, run));
}
