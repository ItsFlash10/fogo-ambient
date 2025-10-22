import * as borsh from "@coral-xyz/borsh";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// Enum discriminants
export enum KeyType {
  Ed25519 = 0,
  Secp256k1 = 1,
}

export enum ClusterType {
  Mainnet = 0,
  Testnet = 1,
  Devnet = 2,
  Localnet = 3,
}

export enum ReplayModeType {
  Sequence = 0,
  Nonce = 1,
  Allowance = 2,
  HlWindow = 3,
}

export enum PermitActionType {
  Place = 0,
  CancelById = 1,
  CancelByClientId = 2,
  CancelAll = 3,
  Modify = 4,
  Withdraw = 5,
  SetLeverage = 6,
  Noop = 7,
  Faucet = 8,
}

export enum TimeInForceCode {
  IOC = 0,
  FOK = 1,
  GTC = 2,
  ALO = 3,
  GTT = 4,
}

export enum HealthMetric {
  Initial = 0,
  Maintenance = 1,
  RatioBps = 2,
}

// Domain structure
export interface PermitDomain {
  programId: PublicKey;
  version: number;
  cluster: ClusterType;
}

// Health floor
export interface HealthFloor {
  metric: HealthMetric;
  min: bigint;
}

// Replay modes
export type ReplayMode =
  | { type: ReplayModeType.Sequence; expected: bigint }
  | { type: ReplayModeType.Nonce; salt: Uint8Array }
  | { type: ReplayModeType.Allowance; id: Uint8Array }
  | { type: ReplayModeType.HlWindow; k: number };

// Time in force variants
export type TimeInForceValue =
  | { type: TimeInForceCode.IOC }
  | { type: TimeInForceCode.FOK }
  | { type: TimeInForceCode.GTC }
  | { type: TimeInForceCode.ALO }
  | { type: TimeInForceCode.GTT; timestamp: bigint };

// Permit actions
export type PermitAction =
  | {
      type: PermitActionType.Place;
      marketId: bigint;
      clientId: bigint;
      side: number; // 0 = Bid, 1 = Ask
      qty: bigint;
      price: bigint | null;
      tif: TimeInForceValue;
      reduceOnly: boolean;
      triggerPrice: bigint | null;
      triggerType: number;
      healthFloor?: HealthFloor;
    }
  | {
      type: PermitActionType.Modify;
      marketId: bigint;
      cancelOrderId: bigint;
      newClientId: bigint;
      side: number;
      qty: bigint;
      price: bigint | null;
      tif: TimeInForceValue;
      reduceOnly: boolean;
      triggerPrice: bigint | null;
      triggerType: number;
      healthFloor?: HealthFloor;
    }
  | {
      type: PermitActionType.CancelById;
      marketId: bigint;
      orderId: bigint;
    }
  | {
      type: PermitActionType.CancelByClientId;
      marketId: bigint;
      clientId: bigint;
    }
  | {
      type: PermitActionType.CancelAll;
      marketId?: bigint;
    }
  | {
      type: PermitActionType.Faucet;
      marketId: bigint;
      amount: bigint;
      recipient: PublicKey;
    }
  | {
      type: PermitActionType.Withdraw;
      amount: bigint;
      toOwner: PublicKey;
      healthFloor?: HealthFloor;
    }
  | {
      type: PermitActionType.SetLeverage;
      marketId: bigint;
      targetLeverageBps: number;
      healthFloor?: HealthFloor;
    }
  | {
      type: PermitActionType.Noop;
    };

// Main permit envelope
export interface PermitEnvelopeV1 {
  domain: PermitDomain;
  authorizer: PublicKey;
  keyType: KeyType;
  action: PermitAction;
  mode: ReplayMode;
  expiresUnix: bigint;
  maxFeeQuote: bigint;
  relayer?: PublicKey;
  nonce: bigint;
}

// Borsh schemas for serialization
export const permitDomainSchema = borsh.struct([
  borsh.publicKey("programId"),
  borsh.u8("cluster"),
  borsh.u8("version"),
]);

export const healthFloorSchema = borsh.struct([
  borsh.u8("metric"),
  borsh.i64("min"),
]);

// Helper to create TIF borsh schema
const tifSchema = borsh.rustEnum([
  borsh.struct([], "IOC"),
  borsh.struct([], "FOK"),
  borsh.struct([], "GTC"),
  borsh.struct([], "ALO"),
  borsh.struct([borsh.u64("timestamp")], "GTT"),
]);

// Replay mode schema
export const replayModeSchema = borsh.rustEnum([
  borsh.struct([borsh.u64("expected")], "Sequence"),
  borsh.struct([borsh.array(borsh.u8(), 32, "salt")], "Nonce"),
  borsh.struct([borsh.array(borsh.u8(), 32, "id")], "Allowance"),
  borsh.struct([borsh.u8("k")], "HlWindow"),
]);

// Permit action schema
export const permitActionSchema = borsh.rustEnum([
  borsh.struct(
    [
      borsh.u64("marketId"),
      borsh.u128("clientId"),
      borsh.u8("side"),
      borsh.u64("qty"),
      borsh.option(borsh.u64(), "price"),
      tifSchema.replicate("tif"),
      borsh.bool("reduceOnly"),
      borsh.option(borsh.u64(), "triggerPrice"),
      borsh.u8("triggerType"),
      borsh.option(healthFloorSchema, "healthFloor"),
    ],
    "Place"
  ),
  borsh.struct([borsh.u64("marketId"), borsh.u64("orderId")], "CancelById"),
  borsh.struct(
    [borsh.u64("marketId"), borsh.u128("clientId")],
    "CancelByClientId"
  ),
  borsh.struct([borsh.option(borsh.u64(), "marketId")], "CancelAll"),
  borsh.struct(
    [
      borsh.u64("marketId"),
      borsh.u64("cancelOrderId"),
      borsh.u128("newClientId"),
      borsh.u8("side"),
      borsh.u64("qty"),
      borsh.option(borsh.u64(), "price"),
      tifSchema.replicate("tif"),
      borsh.bool("reduceOnly"),
      borsh.option(borsh.u64(), "triggerPrice"),
      borsh.u8("triggerType"),
      borsh.option(healthFloorSchema, "healthFloor"),
    ],
    "Modify"
  ),
  borsh.struct(
    [
      borsh.u64("amount"),
      borsh.publicKey("toOwner"),
      borsh.option(healthFloorSchema, "healthFloor"),
    ],
    "Withdraw"
  ),
  borsh.struct(
    [
      borsh.u64("marketId"),
      borsh.u16("targetLeverageBps"),
      borsh.option(healthFloorSchema, "healthFloor"),
    ],
    "SetLeverage"
  ),
  borsh.struct([], "Noop"),
  borsh.struct(
    [borsh.u64("marketId"), borsh.u64("amount"), borsh.publicKey("recipient")],
    "Faucet"
  ),
]);

// Complete permit envelope schema
export const permitEnvelopeSchema = borsh.struct([
  permitDomainSchema.replicate("domain"),
  borsh.publicKey("authorizer"),
  borsh.u8("keyType"),
  permitActionSchema.replicate("action"),
  replayModeSchema.replicate("mode"),
  borsh.i64("expiresUnix"),
  borsh.u64("maxFeeQuote"),
  borsh.option(borsh.publicKey(), "relayer"),
  borsh.u64("nonce"),
]);

export type PermitSignatureField = string | string[];
export type PermitSignatureEncoding = "hex" | "base64";

function toBN(value: bigint | number): BN {
  return new BN(value.toString(), 10);
}

function toBorshHealthFloor(floor?: HealthFloor) {
  if (!floor) return null;
  return {
    metric: floor.metric,
    min: toBN(floor.min),
  };
}

function toBorshTif(tif: TimeInForceValue) {
  switch (tif.type) {
    case TimeInForceCode.IOC:
      return { IOC: {} };
    case TimeInForceCode.FOK:
      return { FOK: {} };
    case TimeInForceCode.GTC:
      return { GTC: {} };
    case TimeInForceCode.ALO:
      return { ALO: {} };
    case TimeInForceCode.GTT:
      return { GTT: { timestamp: toBN(tif.timestamp) } };
  }
}

function toBorshAction(action: PermitAction) {
  switch (action.type) {
    case PermitActionType.Place:
      return {
        Place: {
          marketId: toBN(action.marketId),
          clientId: toBN(action.clientId),
          side: action.side,
          qty: toBN(action.qty),
          price: action.price !== null ? toBN(action.price) : null,
          tif: toBorshTif(action.tif),
          reduceOnly: action.reduceOnly,
          triggerPrice:
            action.triggerPrice !== null ? toBN(action.triggerPrice) : null,
          triggerType: action.triggerType,
          healthFloor: toBorshHealthFloor(action.healthFloor),
        },
      };
    case PermitActionType.CancelById:
      return {
        CancelById: {
          marketId: toBN(action.marketId),
          orderId: toBN(action.orderId),
        },
      };
    case PermitActionType.CancelByClientId:
      return {
        CancelByClientId: {
          marketId: toBN(action.marketId),
          clientId: toBN(action.clientId),
        },
      };
    case PermitActionType.CancelAll:
      return {
        CancelAll: {
          marketId:
            action.marketId !== undefined ? toBN(action.marketId) : null,
        },
      };
    case PermitActionType.Modify:
      return {
        Modify: {
          marketId: toBN(action.marketId),
          cancelOrderId: toBN(action.cancelOrderId),
          newClientId: toBN(action.newClientId),
          side: action.side,
          qty: toBN(action.qty),
          price: action.price !== null ? toBN(action.price) : null,
          tif: toBorshTif(action.tif),
          reduceOnly: action.reduceOnly,
          triggerPrice:
            action.triggerPrice !== null ? toBN(action.triggerPrice) : null,
          triggerType: action.triggerType,
          healthFloor: toBorshHealthFloor(action.healthFloor),
        },
      };
    case PermitActionType.Withdraw:
      return {
        Withdraw: {
          amount: toBN(action.amount),
          toOwner: action.toOwner,
          healthFloor: toBorshHealthFloor(action.healthFloor),
        },
      };
    case PermitActionType.Faucet:
      return {
        Faucet: {
          marketId: toBN(action.marketId),
          amount: toBN(action.amount),
          recipient: action.recipient,
        },
      };
    case PermitActionType.SetLeverage:
      return {
        SetLeverage: {
          marketId: toBN(action.marketId),
          targetLeverageBps: action.targetLeverageBps,
          healthFloor: toBorshHealthFloor(action.healthFloor),
        },
      };
    case PermitActionType.Noop:
      return { Noop: {} };
  }
}

function toBorshReplayMode(mode: ReplayMode) {
  switch (mode.type) {
    case ReplayModeType.Sequence:
      return { Sequence: { expected: toBN(mode.expected) } };
    case ReplayModeType.Nonce:
      return { Nonce: { salt: mode.salt } };
    case ReplayModeType.Allowance:
      return { Allowance: { id: mode.id } };
    case ReplayModeType.HlWindow:
      return { HlWindow: { k: mode.k } };
  }
}

export function encodePermitEnvelope(envelope: PermitEnvelopeV1): Uint8Array {
  const serializable = {
    domain: {
      programId: envelope.domain.programId,
      cluster: envelope.domain.cluster,
      version: envelope.domain.version,
    },
    authorizer: envelope.authorizer,
    keyType: envelope.keyType,
    action: toBorshAction(envelope.action),
    mode: toBorshReplayMode(envelope.mode),
    expiresUnix: toBN(envelope.expiresUnix),
    maxFeeQuote: toBN(envelope.maxFeeQuote),
    relayer: envelope.relayer ?? null,
    nonce: toBN(envelope.nonce),
  };

  const buffer = Buffer.alloc(512);
  const length = permitEnvelopeSchema.encode(serializable, buffer);
  return buffer.slice(0, length);
}
