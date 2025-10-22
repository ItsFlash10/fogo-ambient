import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Platform,
  StatusBar,
  Share,
  ScrollView,
} from "react-native";
import { FogoSessionProvider } from "./app/providers/FogoSessionProvider";
import { WalletConnector } from "./app/WalletConnector";
import { WalletConnectionDetails } from "./app/WalletConnectionDetails";
import { useSession, StateType } from "./app/providers/FogoSessionProvider";
import { EXCHANGE_API_URL, orderWithDebug } from "./app/ambient/clients";

export const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FogoSessionProvider
        endpoint="https://testnet.fogo.io"
        sponsor={undefined}
        paymaster={undefined}
        domain="https://perps.ambient.finance"
      >
        <SafeAreaView
          style={{
            flex: 1,
            paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
          }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          >
            <Text
              style={{
                color: "white",
                fontSize: 18,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              Fogo Sessions Demo
            </Text>
            <WalletConnector />
            <WalletConnectionDetails />
            <OrderDebugPanel />
          </ScrollView>
        </SafeAreaView>
      </FogoSessionProvider>
    </QueryClientProvider>
  );
}

function OrderDebugPanel() {
  const session = useSession();
  const [requestBody, setRequestBody] = React.useState<Record<
    string,
    unknown
  > | null>(null);
  const [rawResponse, setRawResponse] = React.useState<unknown>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPlacing, setIsPlacing] = React.useState(false);
  const wasConnectedRef = React.useRef(false);

  const isConnected =
    session.type === StateType.Established ||
    session.type === StateType.UpdatingLimits;

  const placeOrder = async () => {
    if (!isConnected) return;
    setIsPlacing(true);
    setError(null);
    setRawResponse(null);
    setRequestBody(null);
    const req = {
      grouping: "na" as const,
      orders: [
        {
          a: 0,
          b: true,
          p: "131425",
          s: "0.00021",
          r: false,
          c: String(Date.now()),
          t: { limit: { tif: "Ioc" as const } },
        },
      ],
    };
    try {
      const result = await orderWithDebug(req);
      setRequestBody(result.requestBody);
      setRawResponse(result.rawResponse ?? result.mapped);
      if (result.error) setError(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPlacing(false);
    }
  };

  const clearDebug = () => {
    setRequestBody(null);
    setRawResponse(null);
    setError(null);
    setIsPlacing(false);
  };

  const curlString = React.useMemo(() => {
    if (!requestBody) return "";
    const json = JSON.stringify(requestBody).replace(/"/g, '\\"');
    return `curl -X POST ${EXCHANGE_API_URL} \\n+  -H "Content-Type: application/json" \\
  -d "${json}"`;
  }, [requestBody]);

  const copy = async (text: string) => {
    try {
      // Try native share as a fallback for quick export; users can copy from the share sheet
      await Share.share({ message: text });
    } catch {}
  };

  // Auto-clear when wallet disconnects (transition from connected -> not connected)
  React.useEffect(() => {
    const wasConnected = wasConnectedRef.current;
    if (wasConnected && !isConnected) {
      clearDebug();
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  if (!isConnected) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: "white", fontWeight: "600", marginBottom: 8 }}>
        Debug Order
      </Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <Text style={{ color: "#bbb", flex: 1 }}>
          Ioc order on asset 0 with size 0.00021 @ 131425
        </Text>
      </View>
      <View style={{ marginTop: 8, flexDirection: "row", gap: 10 }}>
        <Text
          onPress={placeOrder}
          style={{
            color: isPlacing ? "#999" : "black",
            backgroundColor: isPlacing ? "#444" : "#00e676",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 6,
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {isPlacing ? "Placing..." : "Place Order"}
        </Text>
        <Text
          onPress={clearDebug}
          style={{
            color: "black",
            backgroundColor: "#ffd54f",
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 6,
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          Clear API data
        </Text>
      </View>

      {requestBody ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: "#111",
            padding: 10,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#ccc", marginBottom: 6 }}>cURL</Text>
          <Text selectable style={{ color: "#ddd", fontFamily: "Courier" }}>
            {curlString}
          </Text>
          <Text
            onPress={() => copy(curlString)}
            style={{ color: "#00e676", marginTop: 6 }}
          >
            Copy cURL
          </Text>
        </View>
      ) : null}

      {rawResponse ? (
        <View
          style={{
            marginTop: 12,
            backgroundColor: "#111",
            padding: 10,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#ccc", marginBottom: 6 }}>Response</Text>
          <Text selectable style={{ color: "#ddd", fontFamily: "Courier" }}>
            {JSON.stringify(rawResponse, null, 2)}
          </Text>
          <Text
            onPress={() => copy(JSON.stringify(rawResponse, null, 2))}
            style={{ color: "#00e676", marginTop: 6 }}
          >
            Copy Response
          </Text>
        </View>
      ) : null}

      {error ? (
        <Text style={{ color: "#ff5252", marginTop: 8 }}>Error: {error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
