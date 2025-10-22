import Constants from "expo-constants";
import { Keypair, PublicKey } from "@solana/web3.js";
import axios from "axios";

import { ClusterType, PermitEnvelopeV1, signPermits } from "./permit";
import {
  buildPermitEnvelopesFromExchangeRequest,
  createHyperliquidContext,
  HyperliquidExchangeAction,
  HyperliquidExchangeRequest,
  SignedHyperliquidExchangeRequest,
} from "./permit/hyperliquid";

const EXCHANGE_URL =
  process.env.EXPO_PUBLIC_AMBIENT_EXCHANGE_URL ||
  "https://embindexer.net/ember/api/dev/v1/exchange";

let ambientKeypair: Keypair | null = null;

function mapTifForAmbient(
  tif: "Gtc" | "Ioc" | "FrontendMarket"
): "Gtc" | "Ioc" | "Alo" {
  if (tif === "Ioc" || tif === "FrontendMarket") return "Ioc";
  return "Gtc";
}

function normalizeToHexArray(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : Buffer.from(item).toString("hex")
    );
  }
  if (typeof value === "string") {
    return [value];
  }
  return [Buffer.from(value).toString("hex")];
}

function alignEnvelopeExpiry(envelope: PermitEnvelopeV1) {
  const thousand = 1000n;
  const sixty = 60n;
  const nonce = envelope.nonce;
  const baseNonce = nonce - (nonce % thousand);
  const nonceSeconds = baseNonce / thousand;
  envelope.expiresUnix = nonceSeconds + sixty;
}

/**
 * Sign a payload using the Solana keypair (React Native compatible)
 * Based on the SDK's permit envelope signing approach
 */
function signPayloadWithKeypair(
  action: HyperliquidExchangeAction,
  signer: Keypair
) {
  const nonce = Date.now();

  const payload = {
    action,
    nonce,
    pubkey: signer.publicKey.toString(),
  };

  if (!payload?.action) {
    throw new Error("Payload must include 'action'");
  }
  if (payload.nonce == null) {
    payload.nonce = Date.now();
  }

  const markets = [
    {
      index: 0,
      symbol: "BTC-PERP",
      marketId: 64n,
      baseDecimals: 8,
      quoteDecimals: 6,
    },
  ];
  const programId = new PublicKey(
    "6egfvA3boGA8BLTgCzwPfKZMv3W9QS5V61Ewqa6VWq2g"
  );
  const context = createHyperliquidContext(
    markets,
    programId,
    signer.publicKey,
    {
      clusterType: ClusterType.Testnet,
    }
  );

  const envelopes = buildPermitEnvelopesFromExchangeRequest(
    payload as HyperliquidExchangeRequest,
    context
  );
  envelopes.forEach(alignEnvelopeExpiry);

  const signResult = signPermits(envelopes, signer, "hex");
  // Dump the serialized permit bytes ("transaction") as base64 for order actions
  try {
    const permitBytesBase64 = (signResult.rawMessages || []).map((m) =>
      Buffer.from(m).toString("base64")
    );
    if (action.type === "order") {
      console.log("📦 Ambient Order Permit (base64):", permitBytesBase64);
    }
  } catch {
    // best-effort logging only
  }
  const signatureHex = normalizeToHexArray(
    signResult.signatureList ?? signResult.signatures
  );

  const output = JSON.parse(
    JSON.stringify(payload)
  ) as SignedHyperliquidExchangeRequest;
  output.signature = signatureHex;
  output.pubkey =
    payload.pubkey ?? payload.action?.recipient ?? signer.publicKey.toBase58();

  return output;
}

/**
 * Load keypair from devkey.json array format (React Native compatible)
 */
function loadKeypairFromDevkey(): Keypair {
  try {
    const devkeyData = Constants.expoConfig?.extra?.solanaWalletPrivateKey;
    if (!Array.isArray(devkeyData) || devkeyData.length !== 64) {
      throw new Error("Invalid devkey format: expected 64-byte array");
    }
    const secretKey = new Uint8Array(devkeyData);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new Error(`Failed to load keypair from devkey.json: ${error}`);
  }
}

export const exchClient = {
  async order(request: {
    grouping: "na";
    orders: {
      a: number;
      b: boolean;
      p: string;
      r: boolean;
      s: string;
      t: {
        limit?: { tif: "Gtc" | "Ioc" | "FrontendMarket" };
        trigger?: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" };
      };
      c?: number | string;
    }[];
  }): Promise<{
    response: {
      type: "order";
      data: {
        statuses: (
          | { resting: { oid: string } }
          | { filled: { oid: string } }
          | { error: string }
        )[];
      };
    };
  }> {
    const [first] = request.orders;
    if (!first) {
      return {
        response: {
          type: "order",
          data: { statuses: [{ error: "No orders provided" }] },
        },
      };
    }

    const cloid = first.c ? String(first.c) : String(Date.now()); // Use provided cloid or generate one
    const isLimit = Boolean(first.t?.limit);

    const action = {
      type: "order",
      a: first.a,
      b: first.b,
      p: String(first.p),
      s: String(first.s),
      r: first.r,
      c: cloid,
      t: isLimit
        ? { limit: { tif: mapTifForAmbient(first.t.limit!.tif) } }
        : {
            trigger: {
              isMarket: first.t.trigger!.isMarket,
              triggerPx: String(first.t.trigger!.triggerPx),
              tpsl: first.t.trigger!.tpsl,
            },
          },
    };

    // Sign via explicit override or injected signer only
    let signed: SignedHyperliquidExchangeRequest | null = null;
    console.log("this is loaded:::::", ambientKeypair);

    if (ambientKeypair) {
      signed = signPayloadWithKeypair(action, ambientKeypair);
    } else {
      try {
        const keypair = loadKeypairFromDevkey();
        signed = signPayloadWithKeypair(action, keypair);
      } catch (keypairError) {
        console.error({ keypairError });
      }
    }

    try {
      const body: Record<string, unknown> = {
        action,
        nonce: signed!.nonce,
        signature: signed!.signature,
        pubkey: signed!.pubkey,
      };

      console.log("🚀 Ambient Order Request:", {
        action: action.type,
        asset: action.a,
        side: action.b ? "BUY" : "SELL",
        price: action.p,
        size: action.s,
        nonce: signed!.nonce,
        pubkey: signed!.pubkey,
        signature: signed!.signature[0]?.substring(0, 20) + "...",
      });

      const { data } = await axios.post(EXCHANGE_URL, body, {
        headers: { "Content-Type": "application/json" },
      });

      console.log("✅ Ambient Order Response:", data);

      // Map Ambient response into HL-style statuses for UI compatibility
      if (data?.status === "ok" && data?.response?.data) {
        const responseData = data.response.data;
        const oid = String(responseData.oid || responseData.cloid || cloid);
        const status = { resting: { oid } };
        return { response: { type: "order", data: { statuses: [status] } } };
      } else {
        const error = data?.response?.error || data?.error || "Unknown error";
        return { response: { type: "order", data: { statuses: [{ error }] } } };
      }
    } catch (err) {
      console.error("❌ Ambient Order Error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: { type: "order", data: { statuses: [{ error: message }] } },
      };
    }
  },

  // Add cancel method for completeness
  async cancel(request: {
    cancels: {
      a: number; // asset index
      o: number | string; // order id
    }[];
  }): Promise<{
    response: {
      type: "cancel";
      data: {
        statuses: ({ success: { oid: string } } | { error: string })[];
      };
    };
  }> {
    const action = { type: "cancel", cancels: request.cancels };

    let signed: SignedHyperliquidExchangeRequest | null = null;

    if (ambientKeypair) {
      signed = signPayloadWithKeypair(action, ambientKeypair);
    } else {
      try {
        const keypair = loadKeypairFromDevkey();
        signed = signPayloadWithKeypair(action, keypair);
      } catch (keypairError) {
        return {
          response: {
            type: "cancel",
            data: {
              statuses: [
                { error: `No signing method available. ${keypairError}` },
              ],
            },
          },
        };
      }
    }

    try {
      const body: Record<string, unknown> = {
        action,
        nonce: signed!.nonce,
        signature: signed!.signature,
        pubkey: signed!.pubkey,
      };
      // if (signed!.permitBytes) body.permitBytes = signed!.permitBytes
      console.log("🚀 Ambient Cancel Request:", {
        action: action.type,
        cancels: action.cancels,
        nonce: signed!.nonce,
        pubkey: signed!.pubkey,
        signature: signed!.signature[0]?.substring(0, 20) + "...",
      });

      const { data } = await axios.post(EXCHANGE_URL, body, {
        headers: { "Content-Type": "application/json" },
      });

      console.log("✅ Ambient Cancel Response:", data);

      // Map response for UI compatibility
      if (data?.status === "ok") {
        const cancelled = data?.response?.data?.cancelled || [];
        const statuses = cancelled.map((item: any) => ({
          success: { oid: String(item.oid || item.cloid) },
        }));
        return { response: { type: "cancel", data: { statuses } } };
      } else {
        const error = data?.response?.error || data?.error || "Cancel failed";
        return {
          response: { type: "cancel", data: { statuses: [{ error }] } },
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: { type: "cancel", data: { statuses: [{ error: message }] } },
      };
    }
  },
};

// No automatic signer initialization; must be set via setAmbientKeypair()

// Allow runtime injection of a signer keypair (e.g., session key)
export function setAmbientKeypair(kp: Keypair) {
  ambientKeypair = kp;
}

// Export utility functions for external use
export { loadKeypairFromDevkey, signPayloadWithKeypair };

// Expose URL for debugging/curl generation
export const EXCHANGE_API_URL = EXCHANGE_URL;

// Helper that performs the same order flow but also returns the exact request body and raw response
export async function orderWithDebug(request: {
  grouping: "na";
  orders: {
    a: number;
    b: boolean;
    p: string;
    r: boolean;
    s: string;
    t: {
      limit?: { tif: "Gtc" | "Ioc" | "FrontendMarket" };
      trigger?: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" };
    };
    c?: number | string;
  }[];
}): Promise<{
  url: string;
  requestBody: Record<string, unknown>;
  mapped: Awaited<ReturnType<typeof exchClient.order>>;
  rawResponse?: unknown;
  error?: string;
}> {
  try {
    const [first] = request.orders;
    const cloid = first.c ? String(first.c) : String(Date.now());
    const isLimit = Boolean(first.t?.limit);

    const action = {
      type: "order",
      a: first.a,
      b: first.b,
      p: String(first.p),
      s: String(first.s),
      r: first.r,
      c: cloid,
      t: isLimit
        ? { limit: { tif: mapTifForAmbient(first.t.limit!.tif) } }
        : {
            trigger: {
              isMarket: first.t.trigger!.isMarket,
              triggerPx: String(first.t.trigger!.triggerPx),
              tpsl: first.t.trigger!.tpsl,
            },
          },
    };

    let signed: SignedHyperliquidExchangeRequest | null = null;
    if (ambientKeypair) {
      signed = signPayloadWithKeypair(action, ambientKeypair);
    } else {
      const keypair = loadKeypairFromDevkey();
      signed = signPayloadWithKeypair(action, keypair);
    }

    const body: Record<string, unknown> = {
      action,
      nonce: signed!.nonce,
      signature: signed!.signature,
      pubkey: signed!.pubkey,
    };

    const { data } = await axios.post(EXCHANGE_URL, body, {
      headers: { "Content-Type": "application/json" },
    });

    let mapped = await exchClient.order(request);
    return { url: EXCHANGE_URL, requestBody: body, mapped, rawResponse: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      url: EXCHANGE_URL,
      requestBody: {},
      mapped: {
        response: { type: "order", data: { statuses: [{ error: message }] } },
      },
      error: message,
    } as any;
  }
}
