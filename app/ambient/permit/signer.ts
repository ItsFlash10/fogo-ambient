import {
  PublicKey,
  Keypair,
  TransactionInstruction,
  Ed25519Program,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import nacl from "tweetnacl";

import { PermitBuilder } from "./builder";
import {
  PermitEnvelopeV1,
  encodePermitEnvelope,
  PermitSignatureField,
  PermitSignatureEncoding,
} from "./types";

export interface SignedPermit {
  envelope: PermitEnvelopeV1;
  signature: Uint8Array;
  publicKey: PublicKey;
  verifyInstruction: TransactionInstruction;
}

export class PermitSigner {
  private builder: PermitBuilder;

  constructor(builder: PermitBuilder) {
    this.builder = builder;
  }

  /**
   * Sign a permit envelope with a keypair
   */
  sign(envelope: PermitEnvelopeV1, keypair: Keypair): SignedPermit {
    // Serialize the envelope to get the message bytes
    const { message, signature } = generatePermitSignature(envelope, keypair);

    // Create the Ed25519 verification instruction
    const verifyInstruction = this.createEd25519Instruction(
      signature,
      keypair.publicKey,
      message
    );

    return {
      envelope,
      signature,
      publicKey: keypair.publicKey,
      verifyInstruction,
    };
  }

  /**
   * Sign a permit with a session key (delegated signing)
   * The session key signs on behalf of the owner
   */
  signWithSession(
    envelope: PermitEnvelopeV1,
    sessionKeypair: Keypair
    // owner: PublicKey,
  ): SignedPermit {
    // Update the envelope to use the session key as authorizer
    const sessionEnvelope = {
      ...envelope,
      authorizer: sessionKeypair.publicKey,
    };

    // Sign with the session key
    return this.sign(sessionEnvelope, sessionKeypair);
  }

  /**
   * Create an Ed25519 verification instruction
   * This instruction will be verified on-chain
   */
  private createEd25519Instruction(
    signature: Uint8Array,
    publicKey: PublicKey,
    message: Uint8Array
  ): TransactionInstruction {
    // The Ed25519 program expects data in a specific format:
    // [num_signatures(1), signature_offset(2), signature_ix_index(2),
    //  pubkey_offset(2), pubkey_ix_index(2), message_offset(2),
    //  message_size(2), message_ix_index(2), ...actual_data]

    const SIGNATURE_OFFSET = 16; // After header
    const PUBKEY_OFFSET = SIGNATURE_OFFSET + 64;
    const MESSAGE_OFFSET = PUBKEY_OFFSET + 32;

    // Build the instruction data
    const instructionData = Buffer.alloc(
      16 + // header
        64 + // signature
        32 + // public key
        message.length // message
    );

    // Header
    instructionData[0] = 1; // num_signatures

    // signature_offset (little-endian)
    instructionData.writeUInt16LE(SIGNATURE_OFFSET, 1);
    // signature_ix_index (0 = same instruction)
    instructionData.writeUInt16LE(0, 3);

    // pubkey_offset (little-endian)
    instructionData.writeUInt16LE(PUBKEY_OFFSET, 5);
    // pubkey_ix_index (0 = same instruction)
    instructionData.writeUInt16LE(0, 7);

    // message_offset (little-endian)
    instructionData.writeUInt16LE(MESSAGE_OFFSET, 9);
    // message_size (little-endian)
    instructionData.writeUInt16LE(message.length, 11);
    // message_ix_index (0 = same instruction)
    instructionData.writeUInt16LE(0, 13);

    // Skip byte 15 (padding)

    // Copy signature
    instructionData.set(signature, SIGNATURE_OFFSET);

    // Copy public key
    instructionData.set(publicKey.toBytes(), PUBKEY_OFFSET);

    // Copy message
    instructionData.set(message, MESSAGE_OFFSET);

    return new TransactionInstruction({
      keys: [],
      programId: Ed25519Program.programId,
      data: instructionData,
    });
  }

  /**
   * Verify a signature locally (for testing)
   */
  verify(signedPermit: SignedPermit): boolean {
    const messageBytes = this.builder.serialize(signedPermit.envelope);
    return nacl.sign.detached.verify(
      messageBytes,
      signedPermit.signature,
      signedPermit.publicKey.toBytes()
    );
  }
}

export interface PermitSignature {
  message: Uint8Array;
  signature: Uint8Array;
  publicKey: PublicKey;
}

export interface PermitSignResult {
  /** Signature value ready to insert into the API request. String for single envelopes, array for batches. */
  signatures: PermitSignatureField;
  /** Serialized permit bytes in the same shape as `signatures` (hex by default). */
  messages: PermitSignatureField;
  /** Signatures coerced to an array, regardless of input size. */
  signatureList: string[];
  /** Permit bytes coerced to an array, regardless of input size. */
  messageList: string[];
  /** Raw detached signatures produced by `tweetnacl`. */
  rawSignatures: Uint8Array[];
  /** Raw serialized permit bytes. */
  rawMessages: Uint8Array[];
}

/**
 * Encode a permit envelope and sign it with the provided keypair.
 * Returns the serialized bytes and signature used by the on-chain verifier.
 */
export function generatePermitSignature(
  envelope: PermitEnvelopeV1,
  keypair: Keypair
): PermitSignature {
  const message = encodePermitEnvelope(envelope);
  const signature = nacl.sign.detached(message, keypair.secretKey);

  return {
    message,
    signature,
    publicKey: keypair.publicKey,
  };
}

/**
 * Sign one or many permit envelopes and return both the API-ready signature value(s)
 * and the underlying serialized permit bytes. For multiple envelopes the return
 * shape mirrors Hyperliquid's batch payload expectations (arrays of signatures/bytes).
 */
export function signPermits(
  envelopes: PermitEnvelopeV1 | PermitEnvelopeV1[],
  keypair: Keypair,
  encoding: PermitSignatureEncoding = "hex"
): PermitSignResult {
  const list = Array.isArray(envelopes) ? envelopes : [envelopes];
  if (list.length === 0) {
    return {
      signatures: [],
      signatureList: [],
      messages: [],
      messageList: [],
      rawSignatures: [],
      rawMessages: [],
    };
  }

  const rawSignatures: Uint8Array[] = [];
  const rawMessages: Uint8Array[] = [];

  for (const envelope of list) {
    const { signature, message } = generatePermitSignature(envelope, keypair);
    rawSignatures.push(signature);
    rawMessages.push(message);
  }

  const signatureList = rawSignatures.map((sig) =>
    Buffer.from(sig).toString(encoding)
  );
  const messageEncoding = encoding === "base64" ? "base64" : "hex";
  const messageList = rawMessages.map((msg) =>
    Buffer.from(msg).toString(messageEncoding)
  );

  return {
    signatures: signatureList.length === 1 ? signatureList[0] : signatureList,
    signatureList,
    messages: messageList.length === 1 ? messageList[0] : messageList,
    messageList,
    rawSignatures,
    rawMessages,
  };
}

export function signPermitsHex(
  envelopes: PermitEnvelopeV1 | PermitEnvelopeV1[],
  keypair: Keypair
): PermitSignResult {
  return signPermits(envelopes, keypair, "hex");
}

export function signPermitsBase64(
  envelopes: PermitEnvelopeV1 | PermitEnvelopeV1[],
  keypair: Keypair
): PermitSignResult {
  return signPermits(envelopes, keypair, "base64");
}
