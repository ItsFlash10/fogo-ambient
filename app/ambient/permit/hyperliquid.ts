import { Keypair, PublicKey } from "@solana/web3.js";
import { Buffer } from "buffer";

import { signPermits, PermitSignResult } from "./signer";
import {
  ClusterType,
  KeyType,
  PermitAction,
  PermitActionType,
  PermitEnvelopeV1,
  ReplayModeType,
  TimeInForceCode,
  TimeInForceValue,
} from "./types";

export interface HyperliquidMarketConfig {
  index: number;
  symbol: string;
  marketId: number | bigint;
  baseDecimals: number;
  quoteDecimals: number;
}

interface MarketMaps {
  bySymbol: Map<string, HyperliquidMarketConfig>;
  byIndex: Map<number, HyperliquidMarketConfig>;
}

export interface HyperliquidPermitContext {
  programId: PublicKey;
  clusterType: ClusterType;
  authorizer: PublicKey;
  relayer?: PublicKey;
  expirySeconds?: number;
  hlWindowK?: number;
  maxFeeQuote?: bigint;
  markets: MarketMaps;
}

export interface HyperliquidOrderType {
  limit: { tif: string };
  trigger?: {
    isMarket: boolean;
    triggerPx: string;
    tpsl: string;
  };
}

export interface HyperliquidOrderRequest {
  a: string | number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: HyperliquidOrderType;
  c?: string;
}

export interface HyperliquidCancelRequest {
  a: string | number;
  o: number | string;
  asset?: string | number;
}

export interface HyperliquidCancelByCloidRequest {
  asset: string | number;
  cloid: string;
}

export interface HyperliquidModifyRequest {
  oid: number | string;
  order: HyperliquidOrderRequest;
}

export interface HyperliquidExchangeAction {
  type: string;
  order?: HyperliquidOrderRequest;
  cancels?: Array<HyperliquidCancelRequest | HyperliquidCancelByCloidRequest>;
  asset?: string | number;
  leverage?: number;
  amount?: string | number;
  marketId?: string | number;
  recipient?: string;
  orders?: HyperliquidOrderRequest[];
  modifies?: HyperliquidModifyRequest[];
  oid?: number | string;
}

export interface HyperliquidExchangeRequest {
  action: HyperliquidExchangeAction;
  nonce: number | bigint;
}

export interface SignedHyperliquidExchangeRequest {
  action: HyperliquidExchangeAction;
  nonce: number | bigint;
  signature: string[];
  pubkey: string;
}

const DEFAULT_EXPIRY = 60;
const DEFAULT_WINDOW_K = 128;
const DEFAULT_MAX_FEE = 1_000_000n;

export interface HyperliquidSignOptions {
  encoding?: "hex" | "base64";
}

export interface HyperliquidSignResult extends PermitSignResult {
  envelopes: PermitEnvelopeV1[];
}

export function createHyperliquidContext(
  markets: HyperliquidMarketConfig[],
  programId: PublicKey,
  authorizer: PublicKey,
  options?: {
    clusterType?: ClusterType;
    relayer?: PublicKey;
    expirySeconds?: number;
    hlWindowK?: number;
    maxFeeQuote?: bigint;
  }
): HyperliquidPermitContext {
  const bySymbol = new Map<string, HyperliquidMarketConfig>();
  const byIndex = new Map<number, HyperliquidMarketConfig>();
  markets.forEach((m) => {
    bySymbol.set(m.symbol, m);
    byIndex.set(m.index, m);
  });

  return {
    programId,
    authorizer,
    clusterType: options?.clusterType ?? ClusterType.Testnet,
    relayer: options?.relayer,
    expirySeconds: options?.expirySeconds ?? DEFAULT_EXPIRY,
    hlWindowK: options?.hlWindowK ?? DEFAULT_WINDOW_K,
    maxFeeQuote: options?.maxFeeQuote ?? DEFAULT_MAX_FEE,
    markets: {
      bySymbol,
      byIndex,
    },
  };
}

function resolveMarket(
  identifier: string | number,
  context: HyperliquidPermitContext
): HyperliquidMarketConfig {
  if (typeof identifier === "number") {
    const market = context.markets.byIndex.get(identifier);
    if (!market) {
      throw new Error(`Unknown market index ${identifier}`);
    }
    return market;
  }

  const market = context.markets.bySymbol.get(identifier);
  if (!market) {
    throw new Error(`Unknown market symbol ${identifier}`);
  }
  return market;
}

function ensureClientId(order: HyperliquidOrderRequest): bigint {
  if (!order.c) {
    order.c = Date.now().toString();
  }
  try {
    return BigInt(order.c);
  } catch {
    const hash = BigInt(`0x${Buffer.from(order.c).toString("hex")}`);
    order.c = hash.toString();
    return hash;
  }
}

function isCancelByCloidRequest(
  value: HyperliquidCancelRequest | HyperliquidCancelByCloidRequest
): value is HyperliquidCancelByCloidRequest {
  return (value as HyperliquidCancelByCloidRequest).cloid !== undefined;
}

function decimalToFixed(value: string, decimals: number): bigint {
  const stringValue = String(value);
  const isNegative = stringValue.startsWith("-");
  const unsigned =
    isNegative || stringValue.startsWith("+")
      ? stringValue.slice(1)
      : stringValue;
  const [whole, fraction = ""] = unsigned.split(".");
  const normalizedFraction = (fraction + "0".repeat(decimals)).slice(
    0,
    decimals
  );
  const digits = (whole + normalizedFraction).replace(/^0+/, "");
  const magnitude = BigInt(digits === "" ? "0" : digits);
  return isNegative ? -magnitude : magnitude;
}

function toTimeInForceValue(tif: string): TimeInForceValue {
  switch (tif) {
    case "Gtc":
    case "GTC":
      return { type: TimeInForceCode.GTC };
    case "Ioc":
    case "IOC":
      return { type: TimeInForceCode.IOC };
    case "Alo":
    case "ALO":
      return { type: TimeInForceCode.ALO };
    default:
      throw new Error(`Unsupported time-in-force ${tif}`);
  }
}

function buildPlaceAction(
  order: HyperliquidOrderRequest,
  market: HyperliquidMarketConfig
): PermitAction {
  const clientId = ensureClientId(order);
  const price = decimalToFixed(order.p, market.quoteDecimals);
  const size = decimalToFixed(order.s, market.baseDecimals);
  const tif = toTimeInForceValue(order.t?.limit?.tif ?? "Gtc");

  return {
    type: PermitActionType.Place,
    marketId: BigInt(market.marketId),
    clientId,
    side: order.b ? 0 : 1,
    qty: size,
    price,
    tif,
    reduceOnly: Boolean(order.r),
    triggerPrice: null,
    triggerType: 0,
    healthFloor: undefined,
  };
}

function buildModifyAction(
  modify: HyperliquidModifyRequest,
  market: HyperliquidMarketConfig
): PermitAction {
  const order = modify.order;
  const newClientId = ensureClientId(order);
  const price = decimalToFixed(order.p, market.quoteDecimals);
  const size = decimalToFixed(order.s, market.baseDecimals);
  const tif = toTimeInForceValue(order.t?.limit?.tif ?? "Gtc");

  return {
    type: PermitActionType.Modify,
    marketId: BigInt(market.marketId),
    cancelOrderId: BigInt(modify.oid),
    newClientId,
    side: order.b ? 0 : 1,
    qty: size,
    price,
    tif,
    reduceOnly: Boolean(order.r),
    triggerPrice: null,
    triggerType: 0,
    healthFloor: undefined,
  };
}

interface PermitActionInfo {
  permitAction: PermitEnvelopeV1["action"];
  nonce: bigint;
}

function buildPermitActions(
  payload: HyperliquidExchangeRequest,
  context: HyperliquidPermitContext
): PermitActionInfo[] {
  const { action, nonce } = payload;
  const baseNonce = BigInt(nonce);
  const actions: PermitActionInfo[] = [];

  const add = (permitAction: PermitEnvelopeV1["action"], offset = 0) => {
    actions.push({ permitAction, nonce: baseNonce + BigInt(offset) });
  };

  switch (action.type) {
    case "order": {
      const order =
        action.order ?? (action as unknown as HyperliquidOrderRequest) ?? null;
      if (!order || order.a === undefined) break;
      const market = resolveMarket(order.a, context);
      add(buildPlaceAction(order, market));
      break;
    }
    case "cancel": {
      (action.cancels ?? []).forEach((cancel, idx) => {
        const request = cancel as HyperliquidCancelRequest;
        const market = resolveMarket(request.a, context);
        add(
          {
            type: PermitActionType.CancelById,
            marketId: BigInt(market.marketId),
            orderId: BigInt(request.o),
          },
          idx
        );
      });
      break;
    }
    case "cancelByCloid": {
      (action.cancels ?? []).forEach((cancel, idx) => {
        if (!isCancelByCloidRequest(cancel)) {
          throw new Error("cancelByCloid requires asset and cloid fields");
        }
        const request = cancel;
        const market = resolveMarket(request.asset, context);
        add(
          {
            type: PermitActionType.CancelByClientId,
            marketId: BigInt(market.marketId),
            clientId: BigInt(request.cloid),
          },
          idx
        );
      });
      break;
    }
    case "batchOrder": {
      (action.orders ?? []).forEach((order, idx) => {
        const market = resolveMarket(order.a, context);
        add(buildPlaceAction(order, market), idx);
      });
      break;
    }
    case "updateLeverage": {
      if (action.asset === undefined) break;
      const market = resolveMarket(action.asset, context);
      const leverageBps = Math.min(Number(action.leverage ?? 0) * 100, 65_535);
      add({
        type: PermitActionType.SetLeverage,
        marketId: BigInt(market.marketId),
        targetLeverageBps: leverageBps,
        healthFloor: undefined,
      });
      break;
    }
    case "faucet": {
      const marketId =
        action.marketId !== undefined ? BigInt(action.marketId) : 64n;
      try {
        const amount = decimalToFixed(String(action.amount ?? "0"), 6);
        const recipientStr =
          action.recipient !== undefined ? String(action.recipient) : null;
        const recipient = recipientStr
          ? new PublicKey(recipientStr)
          : context.authorizer;
        add({
          type: PermitActionType.Faucet,
          marketId,
          amount,
          recipient,
        });
      } catch (err) {
        throw new Error(
          `Invalid faucet request: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      break;
    }
    case "withdraw": {
      if (action.amount === undefined || action.amount === null) break;
      const amountFixed = decimalToFixed(String(action.amount), 6);
      add({
        type: PermitActionType.Withdraw,
        amount: amountFixed,
        toOwner: context.authorizer,
        healthFloor: undefined,
      });
      break;
    }
    case "noop": {
      add({ type: PermitActionType.Noop });
      break;
    }
    case "modify": {
      if (!action.order) break;
      const market = resolveMarket(action.order.a, context);
      add(
        buildModifyAction({ oid: action.oid ?? 0, order: action.order }, market)
      );
      break;
    }
    case "modifyBatch": {
      (action.modifies ?? []).forEach((modify, idx) => {
        const market = resolveMarket(modify.order.a, context);
        add(buildModifyAction(modify, market), idx);
      });
      break;
    }
    default:
      break;
  }

  return actions;
}

export function buildPermitEnvelopesFromExchangeRequest(
  request: HyperliquidExchangeRequest,
  context: HyperliquidPermitContext
): PermitEnvelopeV1[] {
  return buildPermitActions(request, context).map((info) => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    return {
      domain: {
        programId: context.programId,
        version: 1,
        cluster: context.clusterType,
      },
      authorizer: context.authorizer,
      keyType: KeyType.Ed25519,
      action: info.permitAction,
      mode: {
        type: ReplayModeType.HlWindow,
        k: context.hlWindowK ?? DEFAULT_WINDOW_K,
      },
      expiresUnix: BigInt(
        nowSeconds + (context.expirySeconds ?? DEFAULT_EXPIRY)
      ),
      maxFeeQuote: context.maxFeeQuote ?? DEFAULT_MAX_FEE,
      relayer: context.relayer,
      nonce: info.nonce,
    };
  });
}

export function signHyperliquidRequest(
  request: HyperliquidExchangeRequest,
  context: HyperliquidPermitContext,
  keypair: Keypair,
  options?: HyperliquidSignOptions
): HyperliquidSignResult {
  const envelopes = buildPermitEnvelopesFromExchangeRequest(request, context);
  const signatureResult = signPermits(
    envelopes,
    keypair,
    options?.encoding ?? "hex"
  );

  return {
    ...signatureResult,
    envelopes,
  };
}

// Legacy helper for backwards compatibility
export function buildPermitAction(
  payload: HyperliquidExchangeRequest,
  context: HyperliquidPermitContext
) {
  const envelopes = buildPermitEnvelopesFromExchangeRequest(payload, context);
  return envelopes.length > 0
    ? {
        permitAction: envelopes[0].action,
        nonce: envelopes[0].nonce,
      }
    : null;
}
