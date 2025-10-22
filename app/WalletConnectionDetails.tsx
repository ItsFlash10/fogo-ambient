import { View, Text } from "react-native";
import { useSession, StateType } from "./providers/FogoSessionProvider";

export const WalletConnectionDetails = () => {
  const session = useSession();

  const renderRow = (label: string, value?: string) => {
    if (!value) return null;
    return (
      <View style={{ marginBottom: 6 }}>
        <Text style={{ color: "#bbb", fontSize: 12 }}>{label}</Text>
        <Text style={{ color: "white", fontSize: 14 }}>{value}</Text>
      </View>
    );
  };

  if (
    session.type !== StateType.Established &&
    session.type !== StateType.UpdatingLimits &&
    session.type !== StateType.CheckingStoredSession
  ) {
    return null;
  }

  const walletKey = session.walletPublicKey?.toString();
  const sessionKey = (session as any).sessionPublicKey?.toString?.();
  const payer = (session as any).payer?.toString?.();
  const isLimited = (session as any).isLimited === true ? "Yes" : "No";
  const connectionEndpoint = (session as any).connection?.rpcEndpoint as
    | string
    | undefined;
  const limitsError = (session as any).updateLimitsError as unknown;

  return (
    <View style={{ marginTop: 16, padding: 12, borderRadius: 8, backgroundColor: "#1b1b1b" }}>
      <Text style={{ color: "white", fontWeight: "600", fontSize: 16, marginBottom: 8 }}>
        Wallet Connection Details
      </Text>
      {renderRow("State", StateType[session.type])}
      {renderRow("Wallet", walletKey)}
      {renderRow("Session Key", sessionKey)}
      {renderRow("Payer", payer)}
      {renderRow("Limited", isLimited)}
      {renderRow("RPC Endpoint", connectionEndpoint)}
      {limitsError
        ? renderRow(
            "Limits Error",
            limitsError instanceof Error ? limitsError.message : String(limitsError)
          )
        : null}
    </View>
  );
};


