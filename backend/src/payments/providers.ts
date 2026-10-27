import type { Config } from '../config.js';
import { mpesaPhone } from '../lib/phone.js';

export interface CollectRequest {
  paymentId: number;
  provider: 'mpesa' | 'flutterwave';
  amount: number; // whole KES
  phone: string; // E.164
  name: string;
  email?: string | null;
  description: string;
}

export interface CollectResult {
  checkoutRef: string;
  /** Flutterwave hosted checkout page. M-Pesa uses a prompt on the phone instead. */
  checkoutUrl?: string;
}

export interface PayoutRequest {
  payoutId: number;
  amount: number;
  phone: string;
  remarks: string;
}

export interface VerifiedCharge {
  txRef: string;
  providerRef: string;
  amount: number;
  currency: string;
  successful: boolean;
}

export interface Payments {
  readonly isFake: boolean;
  collect(req: CollectRequest): Promise<CollectResult>;
  /** Re-checks a Flutterwave transaction with Flutterwave, never trusting the webhook body alone. */
  verifyFlutterwave(transactionId: string): Promise<VerifiedCharge>;
  /** Sends money out. Returns 'processing' when the provider confirms later by callback. */
  payout(req: PayoutRequest): Promise<{ status: 'sent' | 'processing'; providerRef: string }>;
}

export function createPayments(config: Config): Payments {
  if (config.PAYMENTS_DRIVER === 'fake') return fakePayments();
  return livePayments(config);
}

function fakePayments(): Payments {
  return {
    isFake: true,
    async collect(req) {
      return { checkoutRef: `fake-${req.provider}-${req.paymentId}`, checkoutUrl: req.provider === 'flutterwave' ? `https://example.test/pay/${req.paymentId}` : undefined };
    },
    async verifyFlutterwave(id) {
      return { txRef: '', providerRef: id, amount: 0, currency: 'KES', successful: false };
    },
    async payout(req) {
      return { status: 'sent', providerRef: `FAKE${req.payoutId}` };
    },
  };
}

/** Nairobi time as YYYYMMDDHHmmss, the timestamp format Daraja expects. */
function darajaTimestamp(now = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 3600 * 1000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

function livePayments(config: Config): Payments {
  const mpesaBase = config.MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  const callbackBase = `${config.PUBLIC_BASE_URL}/webhooks/mpesa`;
  let token: { value: string; expires: number } | null = null;

  async function mpesaToken(): Promise<string> {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const basic = Buffer.from(`${config.MPESA_CONSUMER_KEY}:${config.MPESA_CONSUMER_SECRET}`).toString('base64');
    const res = await fetch(`${mpesaBase}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${basic}` } });
    if (!res.ok) throw new Error(`M-Pesa auth failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: string };
    token = { value: body.access_token, expires: Date.now() + Number(body.expires_in) * 1000 };
    return token.value;
  }

  async function mpesaPost<T>(path: string, payload: unknown): Promise<T> {
    const res = await fetch(`${mpesaBase}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await mpesaToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as T & { errorMessage?: string };
    if (!res.ok) throw new Error(`M-Pesa ${path} failed: ${res.status} ${body.errorMessage ?? ''}`);
    return body;
  }

  async function flw<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://api.flutterwave.com/v3${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.FLW_SECRET_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) throw new Error(`Flutterwave ${path} failed: ${res.status} ${body.message ?? ''}`);
    return body;
  }

  return {
    isFake: false,

    async collect(req) {
      if (req.provider === 'mpesa') {
        const timestamp = darajaTimestamp();
        const password = Buffer.from(`${config.MPESA_SHORTCODE}${config.MPESA_PASSKEY}${timestamp}`).toString('base64');
        const body = await mpesaPost<{ CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>(
          '/mpesa/stkpush/v1/processrequest',
          {
            BusinessShortCode: config.MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: req.amount,
            PartyA: mpesaPhone(req.phone),
            PartyB: config.MPESA_SHORTCODE,
            PhoneNumber: mpesaPhone(req.phone),
            CallBackURL: `${callbackBase}/stk/${config.MPESA_CALLBACK_TOKEN}`,
            AccountReference: `FC${req.paymentId}`.slice(0, 12),
            TransactionDesc: req.description.slice(0, 13),
          },
        );
        if (body.ResponseCode !== '0') throw new Error(`M-Pesa rejected the request: ${body.ResponseDescription}`);
        return { checkoutRef: body.CheckoutRequestID };
      }
      const txRef = `fc-pay-${req.paymentId}`;
      const body = await flw<{ data: { link: string } }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          tx_ref: txRef,
          amount: req.amount,
          currency: 'KES',
          redirect_url: `${config.PUBLIC_BASE_URL}/payments/return`,
          customer: { phone_number: req.phone, email: req.email ?? `${mpesaPhone(req.phone)}@users.fitcircle.co`, name: req.name },
          customizations: { title: 'FitCircle', description: req.description },
        }),
      });
      return { checkoutRef: txRef, checkoutUrl: body.data.link };
    },

    async verifyFlutterwave(transactionId) {
      const body = await flw<{ data: { id: number; tx_ref: string; amount: number; currency: string; status: string } }>(
        `/transactions/${encodeURIComponent(transactionId)}/verify`,
      );
      const d = body.data;
      return { txRef: d.tx_ref, providerRef: String(d.id), amount: d.amount, currency: d.currency, successful: d.status === 'successful' };
    },

    async payout(req) {
      if (!config.MPESA_B2C_SHORTCODE || !config.MPESA_B2C_INITIATOR || !config.MPESA_B2C_SECURITY_CREDENTIAL) {
        throw new Error('M-Pesa B2C payouts are not configured (MPESA_B2C_* settings)');
      }
      const originator = `fcpo-${req.payoutId}`;
      await mpesaPost('/mpesa/b2c/v3/paymentrequest', {
        OriginatorConversationID: originator,
        InitiatorName: config.MPESA_B2C_INITIATOR,
        SecurityCredential: config.MPESA_B2C_SECURITY_CREDENTIAL,
        CommandID: 'BusinessPayment',
        Amount: req.amount,
        PartyA: config.MPESA_B2C_SHORTCODE,
        PartyB: mpesaPhone(req.phone),
        Remarks: req.remarks.slice(0, 100),
        QueueTimeOutURL: `${callbackBase}/b2c-timeout/${config.MPESA_CALLBACK_TOKEN}`,
        ResultURL: `${callbackBase}/b2c/${config.MPESA_CALLBACK_TOKEN}`,
        Occasion: 'FitCircle payout',
      });
      return { status: 'processing', providerRef: originator };
    },
  };
}
