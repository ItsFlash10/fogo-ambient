import * as Linking from "expo-linking";
import { PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";
import nacl from "tweetnacl";

export interface PhantomWalletState {
  isConnected: boolean;
  publicKey?: PublicKey;
  session?: string;
  sharedSecret?: Uint8Array;
}

export class PhantomWalletAdapter {
  private dappKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array };
  private sharedSecret?: Uint8Array;
  private session?: string;
  private phantomWalletPublicKey?: PublicKey;
  private useUniversalLinks = false; // Set to true for production
  private cluster = "mainnet-beta";

  // Deep link handlers
  private onConnectRedirectLink = Linking.createURL("onConnect");
  private onDisconnectRedirectLink = Linking.createURL("onDisconnect");
  private onSignAndSendTransactionRedirectLink = Linking.createURL(
    "onSignAndSendTransaction"
  );
  private onSignMessageRedirectLink = Linking.createURL("onSignMessage");

  constructor(cluster: "mainnet-beta" | "devnet" | "testnet" = "mainnet-beta") {
    this.dappKeyPair = nacl.box.keyPair();
    this.cluster = cluster;
    console.log("Cluster::::", cluster);
  }

  private buildUrl(path: string, params: URLSearchParams): string {
    return `${
      this.useUniversalLinks ? "https://phantom.app/ul/" : "phantom://"
    }v1/${path}?${params.toString()}`;
  }

  private decryptPayload(
    data: string,
    nonce: string,
    sharedSecret?: Uint8Array
  ) {
    if (!sharedSecret) throw new Error("missing shared secret");

    const decryptedData = nacl.box.open.after(
      bs58.decode(data),
      bs58.decode(nonce),
      sharedSecret
    );
    if (!decryptedData) {
      throw new Error("Unable to decrypt data");
    }
    return JSON.parse(Buffer.from(decryptedData).toString("utf8"));
  }

  private encryptPayload(
    payload: any,
    sharedSecret?: Uint8Array
  ): [Uint8Array, Uint8Array] {
    if (!sharedSecret) throw new Error("missing shared secret");

    const nonce = nacl.randomBytes(24);
    const encryptedPayload = nacl.box.after(
      Buffer.from(JSON.stringify(payload)),
      nonce,
      sharedSecret
    );

    return [nonce, encryptedPayload];
  }

  public async connect(): Promise<{ publicKey: PublicKey; session: string }> {
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        cluster: this.cluster,
        app_url: "https://phantom.app",
        redirect_link: this.onConnectRedirectLink,
      });

      const url = this.buildUrl("connect", params);

      // Set up a one-time listener for the connection response
      const subscription = Linking.addEventListener(
        "url",
        ({ url: responseUrl }) => {
          try {
            const parsedUrl = new URL(responseUrl, "https://dummy.com"); // Provide base URL for React Native
            const responseParams = parsedUrl.searchParams;

            if (responseParams.get("errorCode")) {
              subscription.remove();
              reject(
                new Error(
                  responseParams.get("errorMessage") || "Connection failed"
                )
              );
              return;
            }

            if (/onConnect/.test(parsedUrl.pathname || parsedUrl.host)) {
              const phantomPublicKey = responseParams.get(
                "phantom_encryption_public_key"
              );
              const data = responseParams.get("data");
              const nonce = responseParams.get("nonce");

              if (!phantomPublicKey || !data || !nonce) {
                subscription.remove();
                reject(new Error("Missing required connection data"));
                return;
              }

              const sharedSecretDapp = nacl.box.before(
                bs58.decode(phantomPublicKey),
                this.dappKeyPair.secretKey
              );

              const connectData = this.decryptPayload(
                data,
                nonce,
                sharedSecretDapp
              );

              this.sharedSecret = sharedSecretDapp;
              this.session = connectData.session;
              this.phantomWalletPublicKey = new PublicKey(
                connectData.public_key
              );

              subscription.remove();
              resolve({
                publicKey: this.phantomWalletPublicKey,
                session: connectData.session, // Use the original value to avoid TS inference issue
              });
            }
          } catch (error) {
            subscription.remove();
            reject(error);
          }
        }
      );

      Linking.openURL(url);
    });
  }

  public async disconnect(): Promise<void> {
    if (!this.session || !this.sharedSecret) {
      throw new Error("Wallet not connected");
    }

    return new Promise((resolve, _reject) => {
      const payload = { session: this.session };
      const [nonce, encryptedPayload] = this.encryptPayload(
        payload,
        this.sharedSecret
      );

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: this.onDisconnectRedirectLink,
        payload: bs58.encode(encryptedPayload),
      });

      const url = this.buildUrl("disconnect", params);

      const subscription = Linking.addEventListener(
        "url",
        ({ url: responseUrl }) => {
          const parsedUrl = new URL(responseUrl, "https://dummy.com"); // Provide base URL for React Native
          if (/onDisconnect/.test(parsedUrl.pathname || parsedUrl.host)) {
            this.sharedSecret = undefined;
            this.session = undefined;
            this.phantomWalletPublicKey = undefined;
            subscription.remove();
            resolve();
          }
        }
      );

      Linking.openURL(url);
    });
  }

  public async signAndSendTransaction(
    transaction: Transaction
  ): Promise<{ signature: string }> {
    if (!this.session || !this.sharedSecret) {
      throw new Error("Wallet not connected");
    }

    return new Promise((resolve, reject) => {
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
      });

      const payload = {
        session: this.session,
        transaction: bs58.encode(serializedTransaction),
      };
      const [nonce, encryptedPayload] = this.encryptPayload(
        payload,
        this.sharedSecret
      );

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: this.onSignAndSendTransactionRedirectLink,
        payload: bs58.encode(encryptedPayload),
      });

      const url = this.buildUrl("signAndSendTransaction", params);

      const subscription = Linking.addEventListener(
        "url",
        ({ url: responseUrl }) => {
          try {
            const parsedUrl = new URL(responseUrl, "https://dummy.com"); // Provide base URL for React Native
            const responseParams = parsedUrl.searchParams;

            if (responseParams.get("errorCode")) {
              subscription.remove();
              reject(
                new Error(
                  responseParams.get("errorMessage") || "Transaction failed"
                )
              );
              return;
            }

            if (
              /onSignAndSendTransaction/.test(
                parsedUrl.pathname || parsedUrl.host
              )
            ) {
              const data = responseParams.get("data");
              const nonce = responseParams.get("nonce");

              if (!data || !nonce) {
                subscription.remove();
                reject(new Error("Missing transaction response data"));
                return;
              }

              const signAndSendTransactionData = this.decryptPayload(
                data,
                nonce,
                this.sharedSecret
              );

              subscription.remove();
              resolve({ signature: signAndSendTransactionData.signature });
            }
          } catch (error) {
            subscription.remove();
            reject(error);
          }
        }
      );

      Linking.openURL(url);
    });
  }

  public async signMessage(
    message: Uint8Array
  ): Promise<{ signature: Uint8Array }> {
    if (!this.session || !this.sharedSecret) {
      throw new Error("Wallet not connected");
    }

    return new Promise((resolve, reject) => {
      const payload = {
        session: this.session,
        message: bs58.encode(Buffer.from(message)),
      };

      const [nonce, encryptedPayload] = this.encryptPayload(
        payload,
        this.sharedSecret
      );

      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        nonce: bs58.encode(nonce),
        redirect_link: this.onSignMessageRedirectLink,
        payload: bs58.encode(encryptedPayload),
      });

      const url = this.buildUrl("signMessage", params);

      const subscription = Linking.addEventListener(
        "url",
        ({ url: responseUrl }) => {
          try {
            const parsedUrl = new URL(responseUrl, "https://dummy.com"); // Provide base URL for React Native
            const responseParams = parsedUrl.searchParams;

            if (responseParams.get("errorCode")) {
              subscription.remove();
              reject(
                new Error(
                  responseParams.get("errorMessage") || "Message signing failed"
                )
              );
              return;
            }

            if (/onSignMessage/.test(parsedUrl.pathname || parsedUrl.host)) {
              const data = responseParams.get("data");
              const nonce = responseParams.get("nonce");

              if (!data || !nonce) {
                subscription.remove();
                reject(new Error("Missing message signing response data"));
                return;
              }

              const signMessageData = this.decryptPayload(
                data,
                nonce,
                this.sharedSecret
              );

              subscription.remove();
              resolve({ signature: bs58.decode(signMessageData.signature) });
            }
          } catch (error) {
            subscription.remove();
            reject(error);
          }
        }
      );

      Linking.openURL(url);
    });
  }

  public getState(): PhantomWalletState {
    return {
      isConnected: !!(this.session && this.phantomWalletPublicKey),
      publicKey: this.phantomWalletPublicKey,
      session: this.session,
      sharedSecret: this.sharedSecret,
    };
  }
}
