import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  toSafeSmartAccount,
  ToSafeSmartAccountReturnType,
} from "permissionless/accounts";
import React, { useEffect, useState } from "react";
import { Client, createWalletClient, custom, http, HttpTransport } from "viem";
import { sepolia } from "viem/chains";
import { createSmartAccountClient } from "permissionless";
import { Erc7579Actions, erc7579Actions } from "permissionless/actions/erc7579";
import { BundlerActions, entryPoint07Address } from "viem/account-abstraction";
import { MOCK_ATTESTER_ADDRESS, RHINESTONE_ATTESTER_ADDRESS } from "@rhinestone/module-sdk";


import { MODULES, ModuleType } from "@/utils/modules";
import {
  BUNDLER_URL,
  ERC7579_LAUNCHPAD_ADDRESS,
  SAFE4337_MODULE_ADDRESS,
} from "@/utils/constants";
import MultiSig from "./modules/MultiSig";
import WebAuthn from "./modules/WebAuthn";
import ScheduleTransfer from "./modules/ScheduleTransfer";

import { pimlicoClient } from "@/utils/config";

const SafePage: React.FC = () => {
  const DEFAULT_SALE_NONCE = BigInt(7579_3);
  const [walletClient, setWalletClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);
  const [safeAccount, setSafeAccount] =
    useState<ToSafeSmartAccountReturnType<"0.7"> | null>(null);
  const [smartAccountClient, setSmartAccountClient] = useState<
    | (Client<HttpTransport, typeof sepolia> &
        Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> &
        BundlerActions)
    | null
  >(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  const [safeIsDeployed, setSafeIsDeployed] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleType | null>(
    ModuleType.Webauthn
  );
  const [prepareUserOperationData, setPrepareUserOperationData] = useState();

  useEffect(() => {
    // We create a wallet client to connect to MetaMask:
    const walletClient = createWalletClient({
      chain: sepolia,
      transport: custom(
        typeof window !== "undefined" ? window.ethereum! : null
      ),
    });
    setWalletClient(walletClient);
  }, []);

  const initSafeAccount = async () => {
    const DEFAULT_SAFE_OWNER = "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656";
    if (walletClient) {
      const safeAccount = await toSafeSmartAccount({
        client: walletClient,
        // @ts-expect-error The wallet client is set in the useEffect
        owners: [walletClient],
        entryPoint: {
          address: entryPoint07Address,
          version: "0.7",
        },
        version: "1.4.1",

        safe4337ModuleAddress: SAFE4337_MODULE_ADDRESS,
        erc7579LaunchpadAddress: ERC7579_LAUNCHPAD_ADDRESS,
        saltNonce: DEFAULT_SALE_NONCE,

        attesters: [
          RHINESTONE_ATTESTER_ADDRESS, // Rhinestone Attester
          MOCK_ATTESTER_ADDRESS, // Mock Attester - do not use in production
        ],
        attestersThreshold: 1,
      });
      const isSafeDeployed = await safeAccount.isDeployed();
      setSafeIsDeployed(isSafeDeployed);
      setSafeAddress(safeAccount.address);
      setSafeAccount(safeAccount);

      const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());

      setSmartAccountClient(smartAccountClient);
    }
  };

  useEffect(() => {
    initSafeAccount();
  }, [walletClient]);

  const onChangeModule = async (module: ModuleType) => {
    setSelectedModule(module);
  };

  const renderModule = () => {
    if (selectedModule === ModuleType.Webauthn) {
      return (
        <WebAuthn
          key={selectedModule}
          isSafeDeployed={safeIsDeployed}
          safeAccount={safeAccount!}
          smartAccount={smartAccountClient!}
        />
      );
    }
    if(selectedModule === ModuleType.ScheduleTransfer) { 
      return (
        <ScheduleTransfer
          key={selectedModule}
          isSafeDeployed={safeIsDeployed}
          safeAccount={safeAccount!}
          smartAccount={smartAccountClient!}
        />
      );
    }
    return <div>Not found module</div>;
  };

  return (
    <div className="p-4">
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <ConnectButton />
        <h2 className="text-xl font-bold mb-4">Safe Address: {safeAddress}</h2>
      </div>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <h2 className="text-xl font-bold mb-4">User Operation Data</h2>
        <pre className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
          {JSON.stringify(prepareUserOperationData, null, 2)}
        </pre>
      </div>
      <div className="bg-white shadow-md rounded-lg mb-4 m-4">
        <div className="p-4">
          <MultiSig
            key={selectedModule}
            isSafeDeployed={safeIsDeployed}
            safeAccount={safeAccount!}
            smartAccount={smartAccountClient!}
          />
        </div>
      </div>
      <div className="bg-white shadow-md rounded-lg mb-4 m-4">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-4 p-4">
            {MODULES.map((module, index) => (
              <button
                key={index}
                className="text-gray-600 hover:text-gray-800 focus:outline-none"
                onClick={() => onChangeModule(module.id)}
              >
                {module.name}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-4">{renderModule()}</div>
      </div>
    </div>
  );
};

export default SafePage;
