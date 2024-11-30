import React, { useState } from "react";
import { createWalletClient, custom } from "viem";
import { sepolia } from "viem/chains";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const SafeAccount: React.FC = () => {
  const [account, setAccount] = useState<string | null>(null);
  const client = createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum!),
  });

  const [walletClient, setWalletClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);

  return (
    <div>
      <ConnectButton />
      {account && <p>Connected Address: {account}</p>}
    </div>
  );
};

export default SafeAccount;
