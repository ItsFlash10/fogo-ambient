import { PublicKey } from "@solana/web3.js";

import {
  PermitEnvelopeV1,
  PermitAction,
  PermitActionType,
  ReplayMode,
  ReplayModeType,
  KeyType,
  ClusterType,
  TimeInForceCode,
  TimeInForceValue,
  HealthFloor,
  encodePermitEnvelope,
} from "./types";

export interface PermitBuilderConfig {
  programId: PublicKey;
  cluster?: ClusterType;
  defaultExpiry?: number; // seconds
  defaultMaxFee?: bigint;
}

interface EnvelopeParams {
  authorizer: PublicKey;
  action: PermitAction;
  nonce?: bigint;
  expiresIn?: number;
  relayer?: PublicKey;
  replayMode?: ReplayMode;
}

export class PermitBuilder {
  private readonly config: Required<PermitBuilderConfig>;

  constructor(config: PermitBuilderConfig) {
    this.config = {
      programId: config.programId,
      cluster: config.cluster ?? ClusterType.Testnet,
      defaultExpiry: config.defaultExpiry ?? 60,
      defaultMaxFee: config.defaultMaxFee ?? BigInt(1_000_000),
    };
  }

  generateNonce(): bigint {
    return BigInt(Date.now());
  }

  placeOrder(params: {
    authorizer: PublicKey;
    marketId: bigint;
    clientId: bigint | number;
    side: "bid" | "ask";
    qty: bigint;
    price?: bigint;
    tif?: TimeInForceValue;
    reduceOnly?: boolean;
    triggerPrice?: bigint;
    triggerType?: number;
    healthFloor?: HealthFloor;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.Place,
      marketId: params.marketId,
      clientId: BigInt(params.clientId),
      side: params.side === "bid" ? 0 : 1,
      qty: params.qty,
      price: params.price ?? null,
      tif: params.tif ?? { type: TimeInForceCode.GTC },
      reduceOnly: params.reduceOnly ?? false,
      triggerPrice: params.triggerPrice ?? null,
      triggerType: params.triggerType ?? 0,
      healthFloor: params.healthFloor,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  modify(params: {
    authorizer: PublicKey;
    marketId: bigint;
    cancelOrderId: bigint;
    newClientId: bigint | number;
    side: "bid" | "ask";
    qty: bigint;
    price?: bigint;
    tif?: TimeInForceValue;
    reduceOnly?: boolean;
    triggerPrice?: bigint;
    triggerType?: number;
    healthFloor?: HealthFloor;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.Modify,
      marketId: params.marketId,
      cancelOrderId: params.cancelOrderId,
      newClientId: BigInt(params.newClientId),
      side: params.side === "bid" ? 0 : 1,
      qty: params.qty,
      price: params.price ?? null,
      tif: params.tif ?? { type: TimeInForceCode.GTC },
      reduceOnly: params.reduceOnly ?? false,
      triggerPrice: params.triggerPrice ?? null,
      triggerType: params.triggerType ?? 0,
      healthFloor: params.healthFloor,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  cancelById(params: {
    authorizer: PublicKey;
    marketId: bigint;
    orderId: bigint;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.CancelById,
      marketId: params.marketId,
      orderId: params.orderId,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  cancelByClientId(params: {
    authorizer: PublicKey;
    marketId: bigint;
    clientId: bigint | number;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.CancelByClientId,
      marketId: params.marketId,
      clientId: BigInt(params.clientId),
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  cancelAll(params: {
    authorizer: PublicKey;
    marketId?: bigint;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.CancelAll,
      marketId: params.marketId,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  withdraw(params: {
    authorizer: PublicKey;
    amount: bigint;
    toOwner: PublicKey;
    healthFloor?: HealthFloor;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.Withdraw,
      amount: params.amount,
      toOwner: params.toOwner,
      healthFloor: params.healthFloor,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  setLeverage(params: {
    authorizer: PublicKey;
    marketId: bigint;
    targetLeverageBps: number;
    healthFloor?: HealthFloor;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.SetLeverage,
      marketId: params.marketId,
      targetLeverageBps: params.targetLeverageBps,
      healthFloor: params.healthFloor,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  faucet(params: {
    authorizer: PublicKey;
    marketId: bigint;
    amount: bigint;
    recipient: PublicKey;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = {
      type: PermitActionType.Faucet,
      marketId: params.marketId,
      amount: params.amount,
      recipient: params.recipient,
    };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  noop(params: {
    authorizer: PublicKey;
    nonce?: bigint;
    expiresIn?: number;
    relayer?: PublicKey;
  }): PermitEnvelopeV1 {
    const action: PermitAction = { type: PermitActionType.Noop };

    return this.buildEnvelope({
      authorizer: params.authorizer,
      action,
      nonce: params.nonce,
      expiresIn: params.expiresIn,
      relayer: params.relayer,
    });
  }

  serialize(envelope: PermitEnvelopeV1): Uint8Array {
    return encodePermitEnvelope(envelope);
  }

  private buildEnvelope(params: EnvelopeParams): PermitEnvelopeV1 {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = params.expiresIn ?? this.config.defaultExpiry;

    return {
      domain: {
        programId: this.config.programId,
        version: 1,
        cluster: this.config.cluster,
      },
      authorizer: params.authorizer,
      keyType: KeyType.Ed25519,
      action: params.action,
      mode: params.replayMode ?? {
        type: ReplayModeType.HlWindow,
        k: 128,
      },
      expiresUnix: BigInt(now + expiresIn),
      maxFeeQuote: this.config.defaultMaxFee,
      relayer: params.relayer,
      nonce: params.nonce ?? this.generateNonce(),
    };
  }
}
