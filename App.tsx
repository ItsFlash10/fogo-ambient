import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  Platform,
  StatusBar,
} from "react-native";
import { FogoSessionProvider } from "./app/providers/FogoSessionProvider";
import { WalletConnector } from "./app/WalletConnector";
import { WalletConnectionDetails } from "./app/WalletConnectionDetails";

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
          <View style={{ padding: 16 }}>
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
          </View>
        </SafeAreaView>
      </FogoSessionProvider>
    </QueryClientProvider>
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
