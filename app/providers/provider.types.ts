import type { Session } from "@fogo/sessions-sdk"
import { Connection, PublicKey } from "@solana/web3.js"

export enum StateType {
  Initializing,
  NotEstablished,
  WalletConnecting,
  CheckingStoredSession,
  CreatingAdapter,
  EstablishingSession,
  Established,
  UpdatingLimits,
}

export const SessionState = {
  Initializing: () => ({ type: StateType.Initializing as const }),

  NotEstablished: (establishSession: (requestedLimits?: Map<PublicKey, bigint>) => void) => ({
    type: StateType.NotEstablished as const,
    establishSession,
  }),

  WalletConnecting: () => ({ type: StateType.WalletConnecting as const }),

  CreatingAdapter: () => ({ type: StateType.CreatingAdapter as const }),

  EstablishingSession: () => ({ type: StateType.EstablishingSession as const }),

  CheckingStoredSession: (
    walletPublicKey: PublicKey,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  ) => ({
    type: StateType.CheckingStoredSession as const,
    walletPublicKey,
    signMessage,
  }),

  Established: (
    options: Pick<Session, "walletPublicKey" | "sessionPublicKey" | "sendTransaction" | "payer"> & {
      connection: Connection
      isLimited: boolean
      setLimits: (limits?: Map<PublicKey, bigint>) => void
      endSession: () => void
    },
    updateLimitsError?: unknown,
  ) => ({
    type: StateType.Established as const,
    ...options,
    updateLimitsError,
  }),

  UpdatingLimits: (
    options: Pick<Session, "walletPublicKey" | "sessionPublicKey" | "sendTransaction" | "payer"> & {
      connection: Connection
      isLimited: boolean
      endSession: () => void
    },
  ) => ({ type: StateType.UpdatingLimits as const, ...options }),
}

export type SessionStatesType = {
  [key in keyof typeof SessionState]: ReturnType<(typeof SessionState)[key]>
}
export type SessionStateType = SessionStatesType[keyof SessionStatesType]
