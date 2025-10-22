import {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useContext,
  ComponentProps,
} from "react";
import { Platform } from "react-native";
import {
  createSolanaWalletAdapter,
  SessionAdapter,
  establishSession as establishSessionImpl,
  replaceSession,
  reestablishSession,
  SessionResultType,
  AuthorizedTokens,
  Session,
} from "@fogo/sessions-sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import {
  AuthorizeAPI,
  AuthorizationResult,
  Account as AuthorizedAccount,
  AuthToken,
  Base64EncodedAddress,
} from "@solana-mobile/mobile-wallet-adapter-protocol";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toUint8Array } from "js-base64";

import { PhantomWalletAdapter } from "./phantomWalletAdapter";
import { setAmbientKeypair } from "../ambient/clients";
import { ed25519PrivateKey64 } from "../crypto";

import { SessionState, SessionStateType, StateType } from "./provider.types";

const SESSION_DURATION = 1 * 24 * 60 * 60 * 1000; // 1 day in milliseconds
const AUTHORIZATION_STORAGE_KEY = "authorization-cache";

// Types for mobile wallet integration
export type Account = Readonly<{
  address: Base64EncodedAddress;
  label?: string;
  publicKey: PublicKey;
}>;

type WalletAuthorization = Readonly<{
  accounts: Account[];
  authToken: AuthToken;
  selectedAccount: Account;
}>;

type ConstrainedOmit<T, K> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [P in keyof T as Exclude<P, K & keyof any>]: T[P];
};

function getPublicKeyFromAddress(address: Base64EncodedAddress): PublicKey {
  const publicKeyByteArray = toUint8Array(address);
  return new PublicKey(publicKeyByteArray);
}

function getAccountFromAuthorizedAccount(account: AuthorizedAccount): Account {
  return {
    ...account,
    publicKey: getPublicKeyFromAddress(account.address),
  };
}

function getAuthorizationFromAuthorizationResult(
  authorizationResult: AuthorizationResult,
  previouslySelectedAccount?: Account
): WalletAuthorization {
  let selectedAccount: Account;
  if (
    previouslySelectedAccount == null ||
    !authorizationResult.accounts.some(
      ({ address }) => address === previouslySelectedAccount.address
    )
  ) {
    const firstAccount = authorizationResult.accounts[0];
    selectedAccount = getAccountFromAuthorizedAccount(firstAccount);
  } else {
    selectedAccount = previouslySelectedAccount;
  }
  return {
    accounts: authorizationResult.accounts.map(getAccountFromAuthorizedAccount),
    authToken: authorizationResult.auth_token,
    selectedAccount,
  };
}

function cacheReviver(key: string, value: any) {
  if (key === "publicKey") {
    return new PublicKey(value);
  }
  return value;
}

// Storage functions
async function fetchAuthorization(): Promise<WalletAuthorization | null> {
  const cacheFetchResult = await AsyncStorage.getItem(
    AUTHORIZATION_STORAGE_KEY
  );
  if (!cacheFetchResult) {
    return null;
  }
  return JSON.parse(cacheFetchResult, cacheReviver);
}

async function persistAuthorization(
  auth: WalletAuthorization | null
): Promise<void> {
  await AsyncStorage.setItem(AUTHORIZATION_STORAGE_KEY, JSON.stringify(auth));
}

// Session storage functions are now imported from sessionStorage.ts

// Mobile wallet hook
function useMobileWallet() {
  const queryClient = useQueryClient();

  const { data: authorization, isLoading } = useQuery({
    queryKey: ["wallet-authorization"],
    queryFn: () => fetchAuthorization(),
  });

  const { mutateAsync: setAuthorization } = useMutation({
    mutationFn: persistAuthorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wallet-authorization"] });
    },
  });

  const handleAuthorizationResult = useCallback(
    async (
      authorizationResult: AuthorizationResult
    ): Promise<WalletAuthorization> => {
      const nextAuthorization = getAuthorizationFromAuthorizationResult(
        authorizationResult,
        authorization?.selectedAccount
      );
      await setAuthorization(nextAuthorization);
      return nextAuthorization;
    },
    [authorization, setAuthorization]
  );

  const authorizeSession = useCallback(
    async (wallet: AuthorizeAPI) => {
      const authorizationResult = await wallet.authorize({
        identity: { name: "Hikari App", uri: "https://fakedomain.com" },
        chain: "solana:devnet",
        auth_token: undefined,
      });
      return (await handleAuthorizationResult(authorizationResult))
        .selectedAccount;
    },
    [handleAuthorizationResult]
  );

  // const authorizeSessionWithSignIn = useCallback(
  //   async (wallet: AuthorizeAPI, signInPayload: SignInPayload) => {
  //     console.log("authorizeSessionWithSignIn:::", {
  //       auth_token: undefined,
  //       chain: CHAIN_IDENTIFIER,
  //       identity: APP_IDENTITY,
  //       sign_in_payload: signInPayload,
  //     })

  //     const authorizationResult = await wallet.authorize({
  //       auth_token: undefined,
  //       chain: "solana:devnet",
  //       identity: { name: "Solana Mobile Expo Template", uri: "https://fakedomain.com" },
  //       sign_in_payload: {
  //         domain: "yourdomain.com",
  //         statement: "Sign into Expo Template App",
  //         uri: "https://yourdomain.com",
  //       },
  //     })
  //     return (await handleAuthorizationResult(authorizationResult)).selectedAccount
  //   },
  //   [handleAuthorizationResult],
  // )

  // Keep an internal deauthorize helper if needed in the future; currently disconnect is silent

  // const deauthorizeSession = useCallback(
  //   async (wallet: DeauthorizeAPI) => {
  //     if (authorization?.authToken == null) {
  //       return
  //     }
  //     await wallet.deauthorize({ auth_token: authorization.authToken })
  //     await setAuthorization(null)
  //   },
  //   [authorization, setAuthorization],
  // )

  const connect = useCallback(async (): Promise<Account> => {
    return await transact(async (wallet) => {
      return await authorizeSession(wallet);
    });
  }, [authorizeSession]);

  // this is not being used
  // const signIn = useCallback(
  //   async (signInPayload: SignInPayload): Promise<Account> => {
  //     console.log({ signInPayload })

  //     return await transact(async (wallet) => {
  //       console.log({ wallet })

  //       return await authorizeSessionWithSignIn(wallet, signInPayload)
  //     })
  //   },
  //   [authorizeSessionWithSignIn],
  // )

  const disconnect = useCallback(async (): Promise<void> => {
    await setAuthorization(null);
  }, [setAuthorization]);

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      return await transact(async (wallet) => {
        const authResult = await authorizeSession(wallet);
        const signedMessages = await wallet.signMessages({
          addresses: [authResult.address],
          payloads: [message],
        });
        return signedMessages[0];
      });
    },
    [authorizeSession]
  );

  return {
    authorization,
    isLoading,
    connect,
    // signIn,
    disconnect,
    signMessage,
  };
}

// Session adapter hook
const connection = new Connection("https://testnet.fogo.io", "confirmed");

export const useSessionAdapter = (
  options: ConstrainedOmit<
    Parameters<typeof createSolanaWalletAdapter>[0],
    "connection"
  >
) => {
  const adapter = useRef<undefined | SessionAdapter>(undefined);
  console.log("options in session adapter", { options });

  return useCallback(async () => {
    if (adapter.current === undefined) {
      try {
        adapter.current = await createSolanaWalletAdapter({
          // ...options,
          domain: options?.domain,
          paymaster: undefined,
          // sponsor: new PublicKey(options?.sponsor),
          connection: connection,
        });
        return adapter.current;
      } catch (error) {
        console.log("Creating adapter failed", error);
        throw error;
      }
    } else {
      return adapter.current;
    }
  }, [options]);
};

// Main session state context hook
export const useSessionStateContext = (
  adapterArgs: Parameters<typeof useSessionAdapter>[0]
) => {
  const [state, setState] = useState<SessionStateType>(
    SessionState.Initializing()
  );
  const mobileWallet = useMobileWallet();
  const phantomAdapter = useRef<PhantomWalletAdapter>(
    new PhantomWalletAdapter("testnet")
  );
  console.log("ADAPTER ARGS,", adapterArgs);

  const getAdapter = useSessionAdapter(adapterArgs);
  const requestedLimits = useRef<undefined | Map<PublicKey, bigint>>(undefined);
  const isUserConnectingRef = useRef<boolean>(false);

  const disconnectWallet = useCallback(() => {
    mobileWallet.disconnect().catch((error: unknown) => {
      console.error("An error occurred while disconnecting the wallet", error);
    });
  }, [mobileWallet]);

  const endSession = useCallback(
    (walletPublicKey: PublicKey) => {
      // Clear stored session from AsyncStorage
      // clearStoredSession(walletPublicKey).catch((error: unknown) => {
      //   console.error("Failed to clear stored session", error);
      // });

      disconnectWallet();
    },
    [disconnectWallet]
  );

  const setSessionState = useCallback(
    async (
      adapter: SessionAdapter,
      session: Session,
      signMessage: (message: Uint8Array) => Promise<Uint8Array>
    ) => {
      try {
        const pvKey = await ed25519PrivateKey64(
          session.sessionKey.privateKey,
          session.sessionKey.publicKey
        );

        const sessionKeypair = Keypair.fromSecretKey(pvKey);
        setAmbientKeypair(sessionKeypair);
        // console.log("✅ Session key material:", {
        //   walletPublicKey: session.walletPublicKey.toBase58(),
        //   sessionPublicKeyFromSDK: session.sessionPublicKey.toBase58(),
        //   derivedSessionPublicKey: sessionKeypair.publicKey.toBase58(),
        //   matchesSessionPublicKey: sessionKeypair.publicKey.equals(session.sessionPublicKey),
        // })
      } catch (error) {
        console.error("Failed to export private key", error);
      }

      const commonStateArgs: Parameters<typeof SessionState.UpdatingLimits>[0] =
        {
          endSession: () => {
            endSession(session.walletPublicKey);
          },
          payer: session.payer,
          sendTransaction: async (instructions) => {
            const result = await session.sendTransaction(instructions);
            return result;
          },
          sessionPublicKey: session.sessionPublicKey,
          isLimited:
            session.sessionInfo.authorizedTokens === AuthorizedTokens.Specific,
          walletPublicKey: session.walletPublicKey,
          connection: adapter.connection,
        };

      const setLimits = (limits?: Map<PublicKey, bigint>) => {
        setState(SessionState.UpdatingLimits(commonStateArgs));
        replaceSession({
          expires: new Date(Date.now() + SESSION_DURATION),
          adapter,
          signMessage,
          session,
          ...(limits === undefined ? { unlimited: true } : { limits }),
        })
          .then((result) => {
            switch (result.type) {
              case SessionResultType.Success: {
                setSessionState(adapter, result.session, signMessage);
                return;
              }
              case SessionResultType.Failed: {
                setState(
                  SessionState.Established(
                    {
                      ...commonStateArgs,
                      setLimits,
                    },
                    result.error
                  )
                );
                return;
              }
            }
          })
          .catch((error: unknown) => {
            console.error("Failed to replace session", error);
            setState(
              SessionState.Established({ ...commonStateArgs, setLimits }, error)
            );
          });
      };
      setState(SessionState.Established({ ...commonStateArgs, setLimits }));
    },
    [endSession]
  );

  const establishSession = useCallback(
    async (newLimits?: Map<PublicKey, bigint>) => {
      requestedLimits.current = newLimits;
      isUserConnectingRef.current = true;

      try {
        setState(SessionState.CreatingAdapter());
        const adapter = await getAdapter();
        const storedSessions: any[] = [];
        if (storedSessions.length > 0) {
          const stored = storedSessions[0];

          try {
            // this block will not execute atm, will need to figure the if block
            await reestablishSession(
              adapter,
              new PublicKey(stored.walletPublicKey),
              stored.sessionKey
            );

            // if (session === undefined) {
            //   endSession(stored.walletPublicKey)
            // } else {
            //   setSessionState(adapter, session, signMessage)
            // }
          } catch (restoreError) {
            console.error(
              "Stored session reestablish failed; falling back to wallet connect",
              restoreError
            );
          }
        }

        // No valid stored session found; proceed with wallet connection and new establishment
        setState(SessionState.WalletConnecting());

        let account: { publicKey: PublicKey };
        let signMessage: (message: Uint8Array) => Promise<Uint8Array>;

        if (Platform.OS === "ios") {
          const result = await phantomAdapter.current.connect();
          account = { publicKey: result.publicKey };
          signMessage = async (message: Uint8Array) => {
            const signResult = await phantomAdapter.current.signMessage(
              message
            );
            return signResult.signature;
          };
        } else {
          account = await mobileWallet.connect();
          signMessage = mobileWallet.signMessage;
        }

        // const storedSession = await getStoredSession(account.publicKey);
        const storedSession: any = undefined;
        if (storedSession) {
          setState(
            SessionState.CheckingStoredSession(account.publicKey, signMessage)
          );
          return;
        }
        setState(SessionState.EstablishingSession());
        const result = await establishSessionImpl({
          expires: new Date(Date.now() + SESSION_DURATION),
          adapter,
          unlimited: true,
          signMessage,
          walletPublicKey: account.publicKey,
          createUnsafeExtractableSessionKey: true,
        });
        switch (result.type) {
          case SessionResultType.Success: {
            setSessionState(adapter, result.session, signMessage);
            return;
          }
          case SessionResultType.Failed: {
            console.error("Connection failed", result.error);
            endSession(account.publicKey);
            return;
          }
        }
      } catch (error: unknown) {
        console.error("Failed to establish session", error);
        setState(SessionState.NotEstablished(establishSession));
      } finally {
        isUserConnectingRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mobileWallet, getAdapter, endSession]
  );

  const checkStoredSession = useCallback(
    async (
      walletPublicKey: PublicKey,
      signMessage: (message: Uint8Array) => Promise<Uint8Array>
    ) => {
      setState(SessionState.CreatingAdapter());
      const adapter = await getAdapter();
      // const storedSession = await getStoredSession(walletPublicKey);
      const storedSession: any = undefined;

      console.log("storedSession::::C:::", { storedSession });

      if (storedSession === undefined) {
        try {
          setState(SessionState.EstablishingSession());
          const result = await establishSessionImpl({
            expires: new Date(Date.now() + SESSION_DURATION),
            adapter,
            unlimited: true,
            signMessage,
            walletPublicKey,
          });
          switch (result.type) {
            case SessionResultType.Success: {
              setSessionState(adapter, result.session, signMessage);
              return;
            }
            case SessionResultType.Failed: {
              console.error("Connection failed", result.error);
              endSession(walletPublicKey);
              return;
            }
          }
        } catch (error: unknown) {
          console.error("Failed to establish session", error);
          endSession(walletPublicKey);
        }
      } else {
        try {
          const keyPair = storedSession.sessionKey;

          const isValidKeyPair =
            keyPair &&
            typeof keyPair === "object" &&
            keyPair.privateKey &&
            keyPair.publicKey;

          if (!isValidKeyPair) {
            // await clearStoredSession(walletPublicKey);
            endSession(walletPublicKey);
            return;
          }

          const session = await reestablishSession(
            adapter,
            new PublicKey(storedSession.walletPublicKey),
            keyPair
          );

          if (session === undefined) {
            endSession(walletPublicKey);
          } else {
            setSessionState(adapter, session, signMessage);
          }
        } catch (reErr) {
          console.error("Reestablish threw; clearing stored session", reErr);
          // await clearStoredSession(walletPublicKey);
          endSession(walletPublicKey);
        }
      }
    },
    [getAdapter, setSessionState, endSession]
  );

  const onSessionLimitsOpenChange = useCallback(
    (isOpen: boolean) => {
      // Mobile doesn't need session limits UI, so this is simplified
      if (!isOpen) {
        disconnectWallet();
      }
    },
    [disconnectWallet]
  );

  // Attempt to auto-restore a stored session on app start without triggering a wallet prompt
  useEffect(() => {
    let cancelled = false;

    const tryAutoRestore = async () => {
      try {
        // const storedSessions = await getAllStoredSessions();
        const storedSessions: any[] = [];

        if (!cancelled && storedSessions.length > 0) {
          const stored = storedSessions[0];

          try {
            const deferredSignMessage = async (message: Uint8Array) => {
              if (Platform.OS === "ios") {
                const signResult = await phantomAdapter.current.signMessage(
                  message
                );
                return signResult.signature;
              } else {
                return await mobileWallet.signMessage(message);
              }
            };

            setState(
              SessionState.CheckingStoredSession(
                new PublicKey(stored.walletPublicKey),
                deferredSignMessage
              )
            );
            return;
          } catch (restoreError) {
            console.error(
              "Auto-restore of stored session failed; falling back to normal flow",
              restoreError
            );
          }
        }
      } catch (error) {
        console.error("Auto-restore preflight failed", error);
      }

      if (cancelled) return;

      if (isUserConnectingRef.current) return;
      if (Platform.OS === "ios") {
        setState(
          SessionState.NotEstablished(async () => {
            await establishSession();
          })
        );
      } else {
        if (mobileWallet.authorization?.selectedAccount) {
          const account = mobileWallet.authorization.selectedAccount;
          // getStoredSession(account.publicKey).then((storedSession) => {
          //   if (storedSession) {
          //     setState(
          //       SessionState.CheckingStoredSession(
          //         account.publicKey,
          //         mobileWallet.signMessage
          //       )
          //     );
          //   }
          // });
        } else {
          setState(
            SessionState.NotEstablished(async () => {
              await establishSession();
            })
          );
        }
      }
    };

    tryAutoRestore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileWallet.isLoading, mobileWallet.authorization]);

  // Handle session checking
  useEffect(() => {
    console.log({ state });

    if (state.type === StateType.CheckingStoredSession) {
      checkStoredSession(state.walletPublicKey, state.signMessage).catch(
        (error: unknown) => {
          console.error("Failed to check stored session", error);
          disconnectWallet();
        }
      );
    }
  }, [state, checkStoredSession, disconnectWallet]);

  return {
    state,
    onSessionLimitsOpenChange,
    requestedLimits: requestedLimits.current,
  };
};

const SessionContext = createContext<SessionStateType | undefined>(undefined);

type FogoSessionProviderProps = ConstrainedOmit<
  ComponentProps<typeof SessionProvider>,
  "sponsor" | "tokens" | "defaultRequestedLimits"
> & {
  endpoint?: string;
  tokens?: (PublicKey | string)[] | undefined;
  defaultRequestedLimits?:
    | Map<PublicKey, bigint>
    | Record<string, bigint>
    | undefined;
  enableUnlimited?: boolean | undefined;
  sponsor?: PublicKey | string | undefined;
};

// Main provider component
export const FogoSessionProvider = ({
  endpoint,
  tokens,
  defaultRequestedLimits,
  ...props
}: FogoSessionProviderProps) => {
  console.log({ endpoint, tokens, defaultRequestedLimits });

  return <SessionProvider {...props} />;
};

const SessionProvider = ({
  children,
  defaultRequestedLimits,
  enableUnlimited,
  ...args
}: Parameters<typeof useSessionStateContext>[0] & {
  children: ReactNode;
  defaultRequestedLimits?: Map<PublicKey, bigint> | undefined;
  enableUnlimited?: boolean | undefined;
}) => {
  console.log({ defaultRequestedLimits, enableUnlimited });

  const { state } = useSessionStateContext(args);

  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
};

// Hook to use session state
export const useSession = () => {
  const value = useContext(SessionContext);
  if (value === undefined) {
    throw new Error(
      "This component must be contained within a <FogoSessionProvider>"
    );
  }
  return value;
};

// Export StateType for use in components
export { StateType } from "./provider.types";
