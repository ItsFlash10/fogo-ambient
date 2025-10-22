import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  // SYSVAR_RENT_PUBKEY,
  // Keypair,
} from "@solana/web3.js";

import { SignedPermit } from "./signer";

// Instruction discriminants (should match the on-chain program)
export enum PermitInstructionType {
  ConsumePermit = 50, // Adjust based on actual discriminant
  DelegateSession = 51,
  RevokeSession = 52,
  CreateAllowance = 53,
  RevokeAllowance = 54,
}

// Session scope flags
export enum SessionScope {
  Place = 1 << 0,
  Cancel = 1 << 1,
  Withdraw = 1 << 2,
  SetLeverage = 1 << 3,
  Faucet = 1 << 4,
  All = 0xffffffff,
}

/**
 * Create a ConsumePermit instruction
 */
export function createConsumePermitInstruction(
  programId: PublicKey,
  signedPermit: SignedPermit,
  accounts: {
    submitter: PublicKey;
    global: PublicKey;
    cma: PublicKey;
    market: PublicKey;
    perOrderPda: PublicKey;
    marketOrderLog: PublicKey;
    rentPayer: PublicKey;
    // Additional accounts based on action and replay mode
    sessionPda?: PublicKey;
    nonceWindowPda?: PublicKey;
    allowancePda?: PublicKey;
    usedNoncePda?: PublicKey;
  }
): TransactionInstruction[] {
  const instructions: TransactionInstruction[] = [];

  // Add the Ed25519 verification instruction first
  instructions.push(signedPermit.verifyInstruction);

  // Build the consume permit instruction
  const keys = [
    { pubkey: accounts.submitter, isSigner: true, isWritable: false },
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: accounts.global, isSigner: false, isWritable: true },
    { pubkey: accounts.cma, isSigner: false, isWritable: true },
    { pubkey: accounts.market, isSigner: false, isWritable: true },
    { pubkey: accounts.perOrderPda, isSigner: false, isWritable: true },
    { pubkey: accounts.marketOrderLog, isSigner: false, isWritable: true },
    { pubkey: accounts.rentPayer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Add optional accounts
  if (accounts.sessionPda) {
    keys.push({
      pubkey: accounts.sessionPda,
      isSigner: false,
      isWritable: false,
    });
  }
  if (accounts.nonceWindowPda) {
    keys.push({
      pubkey: accounts.nonceWindowPda,
      isSigner: false,
      isWritable: true,
    });
  }
  if (accounts.allowancePda) {
    keys.push({
      pubkey: accounts.allowancePda,
      isSigner: false,
      isWritable: true,
    });
  }
  if (accounts.usedNoncePda) {
    keys.push({
      pubkey: accounts.usedNoncePda,
      isSigner: false,
      isWritable: true,
    });
  }

  // Serialize the permit bytes
  const permitBytes = Buffer.from(signedPermit.signature);

  // Create instruction data
  const instructionData = Buffer.concat([
    Buffer.from([PermitInstructionType.ConsumePermit]),
    Buffer.from([0]), // verify_ix_index (Ed25519 instruction is at index 0)
    permitBytes,
  ]);

  instructions.push(
    new TransactionInstruction({
      keys,
      programId,
      data: instructionData,
    })
  );

  return instructions;
}

/**
 * Create a DelegateSession instruction
 */
export function createDelegateSessionInstruction(
  programId: PublicKey,
  owner: PublicKey,
  session: PublicKey,
  expiresUnix: bigint,
  scopes: SessionScope,
  accounts: {
    sessionPda: PublicKey;
    rentPayer: PublicKey;
  }
): TransactionInstruction {
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: accounts.sessionPda, isSigner: false, isWritable: true },
    { pubkey: accounts.rentPayer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Create instruction data
  const instructionData = Buffer.alloc(1 + 32 + 8 + 4);
  let offset = 0;

  // Discriminant
  instructionData[offset] = PermitInstructionType.DelegateSession;
  offset += 1;

  // Session pubkey
  instructionData.set(session.toBytes(), offset);
  offset += 32;

  // Expires unix timestamp
  instructionData.writeBigInt64LE(expiresUnix, offset);
  offset += 8;

  // Scopes bitmap
  instructionData.writeUInt32LE(scopes, offset);

  return new TransactionInstruction({
    keys,
    programId,
    data: instructionData,
  });
}

/**
 * Create a RevokeSession instruction
 */
export function createRevokeSessionInstruction(
  programId: PublicKey,
  owner: PublicKey,
  session: PublicKey,
  sessionPda: PublicKey
): TransactionInstruction {
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: sessionPda, isSigner: false, isWritable: true },
  ];

  // Create instruction data
  const instructionData = Buffer.alloc(1 + 32);
  instructionData[0] = PermitInstructionType.RevokeSession;
  instructionData.set(session.toBytes(), 1);

  return new TransactionInstruction({
    keys,
    programId,
    data: instructionData,
  });
}

/**
 * Create an Allowance instruction
 */
export function createAllowanceInstruction(
  programId: PublicKey,
  owner: PublicKey,
  authorizer: PublicKey,
  id: bigint,
  maxUses: number,
  accounts: {
    allowancePda: PublicKey;
    rentPayer: PublicKey;
  }
): TransactionInstruction {
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: accounts.allowancePda, isSigner: false, isWritable: true },
    { pubkey: accounts.rentPayer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // Create instruction data
  const instructionData = Buffer.alloc(1 + 32 + 8 + 2);
  let offset = 0;

  // Discriminant
  instructionData[offset] = PermitInstructionType.CreateAllowance;
  offset += 1;

  // Authorizer pubkey
  instructionData.set(authorizer.toBytes(), offset);
  offset += 32;

  // Allowance ID
  instructionData.writeBigInt64LE(id, offset);
  offset += 8;

  // Max uses
  instructionData.writeUInt16LE(maxUses, offset);

  return new TransactionInstruction({
    keys,
    programId,
    data: instructionData,
  });
}

/**
 * Derive PDA addresses
 */
export class PermitPdas {
  static sessionPda(
    programId: PublicKey,
    owner: PublicKey,
    session: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("session_v1.0"), owner.toBuffer(), session.toBuffer()],
      programId
    );
  }

  static nonceWindowPda(
    programId: PublicKey,
    signer: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("nonce_window_v1.0"), signer.toBuffer()],
      programId
    );
  }

  static allowancePda(
    programId: PublicKey,
    owner: PublicKey,
    authorizer: PublicKey,
    id: bigint
  ): [PublicKey, number] {
    const idBuffer = Buffer.alloc(8);
    idBuffer.writeBigUInt64LE(id);

    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("allowance_v1.0"),
        owner.toBuffer(),
        authorizer.toBuffer(),
        idBuffer,
      ],
      programId
    );
  }

  static usedNoncePda(
    programId: PublicKey,
    owner: PublicKey,
    salt: Uint8Array
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("used_nonce_v1.0"), owner.toBuffer(), salt],
      programId
    );
  }

  static perOrderPda(
    programId: PublicKey,
    marketId: bigint,
    user: PublicKey,
    orderId: bigint
  ): [PublicKey, number] {
    const marketBuffer = Buffer.alloc(8);
    marketBuffer.writeBigUInt64LE(marketId);

    const orderBuffer = Buffer.alloc(8);
    orderBuffer.writeBigUInt64LE(orderId);

    return PublicKey.findProgramAddressSync(
      [Buffer.from("order_v1.0"), marketBuffer, user.toBuffer(), orderBuffer],
      programId
    );
  }
}
