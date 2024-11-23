"use client";

import { pimlicoClient, publicClient } from "./../../utils/config";

import { useCallback, useEffect, useState } from "react";
import {
  Client,
  createWalletClient,
  custom,
  encodeFunctionData,
  encodePacked,
  http,
  HttpTransport,
  parseAbi,
  parseEther,
} from "viem";
import { sepolia } from "viem/chains";
import {
  toSafeSmartAccount,
  ToSafeSmartAccountReturnType,
} from "permissionless/accounts";
import {
  entryPoint07Address,
  SendUserOperationParameters,
} from "viem/account-abstraction";
import { BUNDLER_URL, EXECUTOR_PK } from "@/utils/constants";
import { createSmartAccountClient } from "permissionless";
import { Erc7579Actions, erc7579Actions } from "permissionless/actions/erc7579";
import { privateKeyToAccount } from "viem/accounts";

export default function Page() {
  const DEFAULT_SALE_NONCE = BigInt(1234);
  // The module we will use is deployed as a smart contract on Sepolia:
  const ownableExecutorModule = "0xc98B026383885F41d9a995f85FC480E9bb8bB891";
  const executor = privateKeyToAccount(EXECUTOR_PK);

  const [walletClient, setWalletClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);
  const [safeAccount, setSafeAccount] =
    useState<ToSafeSmartAccountReturnType<"0.7"> | null>(null);
  const [smartAccountClient, setSmartAccountClient] = useState<
    | (Client<HttpTransport, typeof sepolia> &
        Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> & {
          sendUserOperation: (
            params: SendUserOperationParameters
          ) => Promise<string>;
        })
    | null
  >(null);
  const [safeAddress, setSafeAddress] = useState<string | null>(null);
  console.log("🚀 ~ Page ~ safeAddress:", safeAddress);
  const [safeIsDeployed, setSafeIsDeployed] = useState(false);
  console.log("🚀 ~ Page ~ safeIsDeployed:", safeIsDeployed);

  useEffect(() => {
    // We create a wallet client to connect to MetaMask:
    const walletClient = createWalletClient({
      chain: sepolia,
      // @ts-expect-error MetaMask is a requirement for this tutorial
      transport: custom(
        typeof window !== "undefined" ? window.ethereum! : null
      ),
    });
    setWalletClient(walletClient);
  }, []);

  const init = async () => {
    if (!walletClient) {
      return;
    }
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      // @ts-expect-error The wallet client is set in the useEffect
      owners: [walletClient],
      entryPoint: {
        address: entryPoint07Address,
        version: "0.7",
      },
      version: "1.4.1",

      safe4337ModuleAddress: "0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2",
      erc7579LaunchpadAddress: "0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE",
      saltNonce: DEFAULT_SALE_NONCE,
    });
    const isSafeDeployed = await safeAccount.isDeployed();
    setSafeIsDeployed(isSafeDeployed);
    setSafeAddress(safeAccount.address);

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
    setSafeAccount(safeAccount);

    console.log("setup done");
  };

  useEffect(() => {
    init();
  }, [walletClient]);

  const connectWallets = async () => {
    // Only at the request address call, MetaMask will pop up and ask the user to connect:
    try {
      await walletClient!.requestAddresses();
    } catch (error) {
      console.error(error);
    }
  };

  const installModule = useCallback(async () => {
    if (!smartAccountClient) {
      return;
    }

    const isModuleInstalled =
      safeIsDeployed &&
      (await smartAccountClient.isModuleInstalled({
        address: ownableExecutorModule,
        type: "executor",
        context: "0x",
      }));
    if (isModuleInstalled) {
      console.log("Module already installed");
      return;
    }


    const userOpHash = await smartAccountClient?.installModule({
      type: "executor",
      address: ownableExecutorModule,
      context: encodePacked(["address"], [executor.address as `0x${string}`]),
    });

    console.log("User operation hash:", userOpHash, "\nwaiting for receipt...");

    // After we sent the user operation, we wait for the transaction to be settled:
    const transactionReceipt = await pimlicoClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });
    console.log("🚀 ~ installModule ~ transactionReceipt:", transactionReceipt);
  }, [smartAccountClient, ownableExecutorModule]);


  const addOwner = async () => {
    if(!smartAccountClient) {
      return
    }
    const addOwnerData = encodeFunctionData({
      abi: parseAbi(['function addOwner(address)']),
      functionName: 'addOwner',
      args: [executor.address]
    });
    console.log("🚀 ~ addOwner ~ addOwnerData:", addOwnerData)

    const userOpHash = await smartAccountClient?.sendUserOperation({
      calls: [
        {
          to: ownableExecutorModule,
          data: addOwnerData,
          value: BigInt(0),
        }
      ]
    });
    console.log("User operation hash:", userOpHash, "\nwaiting for receipt...");

    const transactionReceipt = await pimlicoClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });
    console.log("🚀 ~ addOwner ~ transactionReceipt:", transactionReceipt);
  }

  const executeOnOwnedAccount = async () => {
    console.log('Executing on owned account...')
  
    // We encode the transaction we want the smart account to send. The fields are:
    // - to (address)
    // - value (uint256)
    // - data (bytes)
    // In this example case, it is a dummy transaction with zero data.
    const executeOnOwnedAccountData = encodePacked(
      ['address', 'uint256', 'bytes'],
      ['0xa6d3DEBAAB2B8093e69109f23A75501F864F74e2', parseEther('0'), '0x']
    )
  
    const walletClient = createWalletClient({
      chain: sepolia,
      transport: http(),
      account: executor
    }) 
    const hash = await walletClient!.writeContract({
      chain: sepolia,
      
      abi: parseAbi(['function executeOnOwnedAccount(address, bytes)']),
      functionName: 'executeOnOwnedAccount',
      args: [safeAddress as `0x${string}`, executeOnOwnedAccountData],
      address: ownableExecutorModule
    })
  
    console.log('Executed on owned account, transaction hash:', hash)
  
    const receipt = await publicClient?.waitForTransactionReceipt({ hash })
    console.log("🚀 ~ executeOnOwnedAccount ~ receipt:", receipt)
  }

  return (
    <div>
      <div>Test</div>
      <button onClick={connectWallets}>Connect Wallet</button>
      <button onClick={installModule}>Install module</button>
      <button onClick={addOwner}>Add Owner</button>
      <button onClick={executeOnOwnedAccount}>Transfer by executor</button>
    </div>
  );
}
