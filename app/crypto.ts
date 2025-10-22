// Utility helpers for Ed25519 WebCrypto keys

function base64urlToUint8Array(base64url: string): Uint8Array {
  // Convert base64url to base64 and decode to bytes (Buffer is polyfilled in React Native)
  const base64 =
    base64url.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice((base64url.length + 3) % 4);
  return Uint8Array.from((globalThis as any).Buffer.from(base64, "base64"));
}

/**
 * Export a 64-byte Ed25519 private key (private||public) from a WebCrypto CryptoKey.
 * Requires the key to be extractable. The returned layout is 32-byte seed (d) || 32-byte public (x).
 */
export async function ed25519PrivateKey64(
  privateKey: CryptoKey,
  publicKey?: CryptoKey
): Promise<Uint8Array> {
  let jwk: any;
  try {
    jwk = await crypto.subtle.exportKey("jwk", privateKey);
  } catch {
    throw new Error(
      "Failed to export private key JWK. Ensure the key is extractable."
    );
  }

  if (!jwk?.d) {
    throw new Error('JWK missing private component "d" for Ed25519');
  }

  const dBytes = base64urlToUint8Array(jwk.d);
  if (dBytes.length !== 32) {
    if (dBytes.length === 64) return dBytes;
    throw new Error(
      `Unexpected private seed length: ${dBytes.length} (expected 32)`
    );
  }

  let xBytes: Uint8Array | null = null;
  if (jwk.x) {
    xBytes = base64urlToUint8Array(jwk.x);
  } else if (publicKey) {
    const raw = await crypto.subtle.exportKey("raw", publicKey);
    xBytes = new Uint8Array(raw);
  } else {
    throw new Error('Public key not provided and JWK missing "x" component');
  }

  if (xBytes.length !== 32) {
    throw new Error(
      `Unexpected public key length: ${xBytes.length} (expected 32)`
    );
  }

  const combined = new Uint8Array(64);
  combined.set(dBytes, 0);
  combined.set(xBytes, 32);
  return combined;
}

/**
 * Convenience helper when you have the result of crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]).
 */
export async function ed25519PrivateKey64FromKeyPair(
  keyPair: CryptoKeyPair
): Promise<Uint8Array> {
  return ed25519PrivateKey64(keyPair.privateKey, keyPair.publicKey);
}
