import { useEffect, useState } from "react";
import { View, ViewStyle, TextStyle, Text, Button } from "react-native";

import { useSession, StateType } from "./providers/FogoSessionProvider";

export const WalletConnector = () => {
  const session = useSession();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (session.type === StateType.NotEstablished) {
      try {
        setIsConnecting(true);
        session.establishSession();
      } catch (error) {
        console.log({ error });
        setIsConnecting(false);
      }
    }
  };

  const handleDisconnect = () => {
    if (
      session.type === StateType.Established ||
      session.type === StateType.UpdatingLimits
    ) {
      session.endSession();
    }
  };

  const getStatusText = () => {
    if (isConnecting && session.type === StateType.NotEstablished) {
      return "Connecting wallet...";
    }
    switch (session.type) {
      case StateType.Initializing:
        return "Initializing...";
      case StateType.NotEstablished:
        return "Wallet not connected";
      case StateType.WalletConnecting:
        return "Connecting wallet...";
      case StateType.CreatingAdapter:
        return "Creating adapter...";
      case StateType.EstablishingSession:
        return "Establishing session...";
      case StateType.CheckingStoredSession:
        return "Checking stored session...";
      case StateType.Established:
        return `Connected: ${session.walletPublicKey
          .toString()
          .slice(0, 8)}...`;
      case StateType.UpdatingLimits:
        return "Updating session limits...";
      default:
        return "Unknown state";
    }
  };

  const getButtonText = () => {
    if (isConnecting && session.type === StateType.NotEstablished) {
      return "Loading...";
    }
    switch (session.type) {
      case StateType.NotEstablished:
        return "Connect Wallet";
      case StateType.Established:
        return "Disconnect";
      default:
        return "Loading...";
    }
  };

  const isButtonDisabled = () => {
    if (isConnecting) return true;
    return (
      session.type !== StateType.NotEstablished &&
      session.type !== StateType.Established
    );
  };

  const handleButtonPress = () => {
    if (session.type === StateType.NotEstablished) {
      //   signIn({
      //     domain: "yourdomain.com",
      //     statement: "Sign into Expo Template App",
      //     uri: "https://yourdomain.com",
      //   })
      handleConnect();
    } else if (session.type === StateType.Established) {
      handleDisconnect();
    }
  };

  useEffect(() => {
    if (
      session.type === StateType.Established ||
      session.type === StateType.NotEstablished
    ) {
      setIsConnecting(false);
    }
  }, [session.type]);

  return (
    <View>
      <Text style={{ color: "white" }}>{getStatusText()}</Text>
      <Button
        onPress={handleButtonPress}
        disabled={isButtonDisabled()}
        title={getButtonText()}
      />
    </View>
  );
};
