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
          style={[
            styles.safeArea,
            Platform.OS === "android" ? styles.safeAreaAndroid : null,
          ]}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Fogo Sessions Demo</Text>
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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Debug Order</Text>
      <View style={styles.row}>
        <Text style={styles.mutedLine}>
          Ioc order on asset 0 with size 0.00021 @ 131425
        </Text>
      </View>
      <View style={styles.actionsRow}>
        <Text
          onPress={placeOrder}
          style={[
            styles.button,
            isPlacing ? styles.buttonDisabled : styles.buttonPrimary,
            isPlacing ? styles.buttonTextDisabled : styles.buttonTextPrimary,
          ]}
        >
          {isPlacing ? "Placing..." : "Place Order"}
        </Text>
        <Text
          onPress={clearDebug}
          style={[styles.button, styles.clearButton, styles.clearButtonText]}
        >
          Clear API data
        </Text>
      </View>

      {requestBody ? (
        <View style={styles.codeContainer}>
          <Text style={styles.codeTitle}>cURL</Text>
          <Text selectable style={styles.codeText}>
            {curlString}
          </Text>
          <Text onPress={() => copy(curlString)} style={styles.copyLink}>
            Copy cURL
          </Text>
        </View>
      ) : null}

      {rawResponse ? (
        <View style={styles.codeContainer}>
          <Text style={styles.codeTitle}>Response</Text>
          <Text selectable style={styles.codeText}>
            {JSON.stringify(rawResponse, null, 2)}
          </Text>
          <Text
            onPress={() => copy(JSON.stringify(rawResponse, null, 2))}
            style={styles.copyLink}
          >
            Copy Response
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>Error: {error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  safeAreaAndroid: {
    paddingTop: StatusBar.currentHeight,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    color: "white",
    fontWeight: "600",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 10,
  },
  mutedLine: {
    color: "#bbb",
    flex: 1,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    overflow: "hidden",
    textAlign: "center",
  },
  buttonPrimary: {
    backgroundColor: "#00e676",
  },
  buttonDisabled: {
    backgroundColor: "#444",
  },
  buttonTextPrimary: {
    color: "black",
  },
  buttonTextDisabled: {
    color: "#999",
  },
  clearButton: {
    backgroundColor: "#ffd54f",
  },
  clearButtonText: {
    color: "black",
  },
  codeContainer: {
    marginTop: 12,
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 6,
  },
  codeTitle: {
    color: "#ccc",
    marginBottom: 6,
  },
  codeText: {
    color: "#ddd",
    fontFamily: "Courier",
  },
  copyLink: {
    color: "#00e676",
    marginTop: 6,
  },
  errorText: {
    color: "#ff5252",
    marginTop: 8,
  },
});
