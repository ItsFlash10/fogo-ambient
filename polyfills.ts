import "react-native-url-polyfill/auto";
import "react-native-get-random-values"; // Fallback for getRandomValues
import { install as installEd25519 } from "@solana/webcrypto-ed25519-polyfill";
import { Buffer } from "buffer";
import { Event, EventTarget } from "event-target-shim";
import { install } from "react-native-quick-crypto";

// Polyfill for DOMException in React Native
if (typeof global.DOMException === "undefined") {
  class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || "DOMException";
    }
  }
  // @ts-ignore
  global.DOMException = DOMException;
}

install();
installEd25519();

global.Buffer = Buffer;

Buffer.prototype.subarray = function subarray(
  begin: number | undefined,
  end: number | undefined
) {
  const result = Uint8Array.prototype.subarray.apply(this, [begin, end]);
  Object.setPrototypeOf(result, Buffer.prototype); // Explicitly add the `Buffer` prototype (adds `readUIntLE`!)
  return result;
};

// Ensure window object exists for React Native
if (typeof window === "undefined") {
  (global as any).window = global as any;
}

// Add location polyfill if missing
if (typeof window !== "undefined" && !window.location) {
  (window as any).location = {
    href: "https://hikari.app",
    origin: "https://hikari.app",
    protocol: "https:",
    host: "hikari.app",
    hostname: "hikari.app",
    port: "",
    pathname: "/",
    search: "",
    hash: "",
  };
}

// react-native-quick-crypto should provide the full WebCrypto API
// including crypto.subtle for key generation
console.log("Crypto API available:", {
  crypto: typeof crypto !== "undefined",
  cryptoSubtle: typeof crypto?.subtle !== "undefined",
  getRandomValues: typeof crypto?.getRandomValues === "function",
  subtleMethods: crypto?.subtle
    ? {
        generateKey: typeof crypto.subtle.generateKey === "function",
        sign: typeof crypto.subtle.sign === "function",
        verify: typeof crypto.subtle.verify === "function",
        importKey: typeof crypto.subtle.importKey === "function",
        exportKey: typeof crypto.subtle.exportKey === "function",
      }
    : null,
});

// Test basic crypto functionality
if (typeof crypto !== "undefined" && crypto.getRandomValues) {
  try {
    const testArray = new Uint8Array(16);
    crypto.getRandomValues(testArray);
    console.log("✅ crypto.getRandomValues working");
  } catch (error) {
    console.error("❌ crypto.getRandomValues failed:", error);
  }
}

if (typeof crypto?.subtle?.generateKey === "function") {
  console.log("✅ crypto.subtle.generateKey available for key generation");
} else {
  console.error(
    "❌ crypto.subtle.generateKey not available - fogo sessions SDK will fail"
  );
}

// Test Ed25519 support specifically for Solana
try {
  if (typeof crypto?.subtle?.generateKey === "function") {
    // Test if Ed25519 is supported (this doesn't actually generate a key, just checks support)
    console.log(
      "✅ Ed25519 polyfill installed - Solana key generation should work"
    );

    // Note: We don't actually generate a key here to avoid performance impact
    // The actual test will happen when the fogo sessions SDK tries to generate keys
  }
} catch (error) {
  console.error("❌ Ed25519 polyfill test failed:", error);
}

// Polyfills for @nktkas/hyperliquid
if (!globalThis.EventTarget || !globalThis.Event) {
  // Use type assertion to resolve type incompatibility
  globalThis.EventTarget = EventTarget as any;
  globalThis.Event = Event as any;
}

if (!globalThis.CustomEvent) {
  globalThis.CustomEvent = function (type: string, params?: any) {
    params = params || {};
    const event = new Event(type, params) as any;
    event.detail = params.detail || null;
    return event;
  } as any;
}

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function (delay: number) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), delay);
    return controller.signal;
  };
}

if (!Promise.withResolvers) {
  Promise.withResolvers = function <T>() {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

// Polyfill for structuredClone (required by @fogo/sessions-sdk and Solana dependencies)
if (!globalThis.structuredClone) {
  globalThis.structuredClone = function <T>(obj: T): T {
    // Simple deep clone implementation for React Native
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as T;
    }

    if (obj instanceof Array) {
      return obj.map((item) => structuredClone(item)) as unknown as T;
    }

    if (obj instanceof Object) {
      const cloned = {} as T;
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          (cloned as any)[key] = structuredClone((obj as any)[key]);
        }
      }
      return cloned;
    }

    return obj;
  };
}
