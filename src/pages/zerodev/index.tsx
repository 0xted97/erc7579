import { ConnectButton } from "@rainbow-me/rainbowkit";
import React, { useEffect, useState } from "react";
import {
  Address,
  Client,
  createPublicClient,
  createWalletClient,
  custom,
  encodeFunctionData,
  http,
  HttpTransport,
  isAddress,
  parseAbi,
  parseEther,
  PrivateKeyAccount,
} from "viem";
import { sepolia } from "viem/chains";
import {
  toECDSASigner,
  toWebAuthnSigner,
  WebAuthnSignerVersion,
} from "@zerodev/permissions/signers";
import {
  PasskeyValidatorContractVersion,
  WebAuthnMode,
  toPasskeyValidator,
  toWebAuthnKey,
} from "@zerodev/passkey-validator";
import { toPermissionValidator } from "@zerodev/permissions";
import {
  createKernelAccount,
  createKernelAccountClient,
  CreateKernelAccountReturnType,
} from "@zerodev/sdk";

import { Erc7579Actions, erc7579Actions } from "permissionless/actions/erc7579";
import { BundlerActions } from "viem/account-abstraction";

import {
  paymasterClient,
  ZERO_DEV_BUNDLER_URL,
  ZERO_DEV_PASSKEY_URL,
} from "@/utils/zero-dev";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import {
  CallPolicyVersion,
  ParamCondition,
  toCallPolicy,
  toSudoPolicy,
} from "@zerodev/permissions/policies";
import { toSpendingLimitHook } from "@zerodev/hooks";
import { createSmartAccountClient } from "permissionless";
import { BUNDLER_URL, TOKEN7579_ADDRESS } from "@/utils/constants";
import { pimlicoClient } from "@/utils/config";
import { useLocalStorage } from "usehooks-ts";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { TEST_ERC20Abi } from "./abis/erc20.abi";

const SafePage: React.FC = () => {
  const DEFAULT_SALE_NONCE = BigInt(7579_3);
  const passkeyName = "ZeroDev Demo 7579"; // any name you want
  const passkeyServerUrl = ZERO_DEV_PASSKEY_URL; // get this from ZeroDev dashboard
  const [walletClient, setWalletClient] = useState<ReturnType<
    typeof createWalletClient
  > | null>(null);
  const [kernelAccount, setKernelAccount] =
    useState<CreateKernelAccountReturnType<"0.7"> | null>(null);
  const [smartAccountClient, setSmartAccountClient] = useState<
    | (Client<HttpTransport, typeof sepolia> &
        Erc7579Actions<CreateKernelAccountReturnType<"0.7">> &
        BundlerActions)
    | null
  >(null);
  const [passkeyValidator, setPasskeyValidator] = useState<any>();

  const sudoSigner = privateKeyToAccount(
    "0x7355ae6b3362c11b0e6698e37f2b9324597812fc29eae37d92f6f7239723c036"
  );
  const sessionSigner = privateKeyToAccount(
    "0x964ed93a9f83cb0ea461db336b9fd46683505d23b59d6f5ad99b43e06dd29190"
  );

  const WHITELIST_ADDRESSES: Address[] = [
    "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656",
  ];
  const LIMIT_AMOUNT_PER_TRANSFER = "20";

  const OTHER_ADDRESSES: Address[] = [
    "0x43370108f30Ee5Ed54A9565F37af3BE8502903f5",
  ];

  const [selectedSigner, setSelectedSigner] = useState<PrivateKeyAccount>();

  const [kernelAddress, setKernelAddress] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [txId, setTxId] = useState("");
  const [errorMessage, setErrorMessage] = useState();
  const [grantSessionLoading, setGrantSessionLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [grantSudoPassKeyLoading, setGrantSudoPassKeyLoading] = useState(false);
  const [transferWithPassKeyLoading, setTransferWithPassKeyLoading] =
    useState(false);
  const [toAddress, setToAddress] = useState<Address>();

  const entryPoint = getEntryPoint("0.7");
  const publicClient = createPublicClient({
    transport: http(ZERO_DEV_BUNDLER_URL),
    chain: sepolia,
  });

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

  useEffect(() => {
    initZeroAccount();
  }, [walletClient]);

  const getECDSASigners = async () => {
    const ecdsaSudoSigner = await toECDSASigner({
      signer: sudoSigner,
    });
    const ecdsaSessionSigner = await toECDSASigner({
      signer: sessionSigner,
    });

    const sudoPolicy = toSudoPolicy({});

    const sudoValidator = await toPermissionValidator(publicClient, {
      entryPoint,
      kernelVersion: KERNEL_V3_1,
      signer: ecdsaSudoSigner,
      policies: [sudoPolicy],
    });

    return {
      sudoValidator: sudoValidator,
      ecdsaSudoSigner: ecdsaSudoSigner,
      ecdsaSessionSigner: ecdsaSessionSigner,
    };
  };

  const getPoliciesAndHooks = async () => {
    const transferPolicies = toCallPolicy({
      policyVersion: CallPolicyVersion.V0_0_2,
      permissions: [
        {
          abi: TEST_ERC20Abi,
          target: TOKEN7579_ADDRESS,
          functionName: "transfer",
          args: [
            {
              condition: ParamCondition.ONE_OF,
              value: WHITELIST_ADDRESSES, // Can transfer to either randomAccount or randomAccount2
            },
            {
              condition: ParamCondition.LESS_THAN_OR_EQUAL,
              value: parseEther(LIMIT_AMOUNT_PER_TRANSFER),
            },
          ],
        },
      ],
    });
    const spendingLimitHook = await toSpendingLimitHook({
      limits: [{ token: TOKEN7579_ADDRESS, allowance: parseEther("25") }],
    });
    return { transferPolicies, spendingLimitHook };
  };

  const initZeroAccount = async () => {
    if (walletClient) {
      try {
        const { sudoValidator } = await getECDSASigners();

        const account = await createKernelAccount(publicClient, {
          entryPoint,
          kernelVersion: KERNEL_V3_1,
          plugins: {
            sudo: sudoValidator,
          },
        });

        const smartAccountClient = createKernelAccountClient({
          account: account,
          chain: sepolia,
          bundlerTransport: http(BUNDLER_URL),
          paymaster: pimlicoClient,
          userOperation: {
            estimateFeesPerGas: async () => {
              return (await pimlicoClient.getUserOperationGasPrice()).fast;
            },
          },
        }).extend(erc7579Actions());

        const isDeployed = await account.isDeployed();
        setIsDeployed(isDeployed);
        setSmartAccountClient(smartAccountClient);
        setKernelAddress(account.address);
        setKernelAccount(account);
      } catch (error) {
        console.error("🚀 ~ initZeroAccount ~ error", error);
      }
    }
  };

  const initPassKey = async () => {
    try {
      const mode = WebAuthnMode.Login; // can also be "login" if you are using an existing key

      const webAuthnKey = await toWebAuthnKey({
        passkeyName,
        passkeyServerUrl,
        mode,
        passkeyServerHeaders: {},
      });

      const webAuthnSigner = await toWebAuthnSigner(publicClient, {
        webAuthnKey,
        webAuthnSignerVersion: WebAuthnSignerVersion.V0_0_2,
      });

      const sudoPolicy = toSudoPolicy({});

      const passKeySudoValidator = await toPermissionValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        signer: webAuthnSigner,
        policies: [sudoPolicy],
      });
      setPasskeyValidator(passKeySudoValidator);
    } catch (error) {
      console.error("🚀 ~ initPassKey ~ error", error);
    }
  };
  const grantPassKeyAsSudo = async () => {
    try {
      if (!walletClient || !kernelAccount) {
        console.log("walletClient & kernelAccount is not initialized");
        return;
      }
      if(!passkeyValidator) { 
        console.log("passkeyValidator is not initialized");
        return;
      }
      const { spendingLimitHook } = await getPoliciesAndHooks();

      setGrantSudoPassKeyLoading(true);
      const { sudoValidator } = await getECDSASigners();

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        address: kernelAccount.address,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: sudoValidator,
          regular: passkeyValidator,
          // hook: spendingLimitHook,
        },
      });

      const kernelClient = createKernelAccountClient({
        account: account,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());

      const transferOpHash = await kernelClient.sendUserOperation({
        calls: [
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [
                WHITELIST_ADDRESSES[0],
                parseEther("0.09"),
              ],
            }),
          },
        ],
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onGrantSessionKey ~ receipt:", receipt);
      setTxId(receipt.receipt.transactionHash);
      setGrantSudoPassKeyLoading(false);
    } catch (error: any) {
      setErrorMessage(error.message);
      setGrantSudoPassKeyLoading(false);
      console.error("🚀 ~ initPassKey ~ error", error);
    }
  };

  const onTransferWithPassKey = async () => {
    try {
      if (!walletClient || !kernelAccount) {
        console.log("walletClient & kernelAccount is not initialized");
        return;
      }
      if(!passkeyValidator) { 
        console.log("passkeyValidator is not initialized");
        return;
      }
      setTransferWithPassKeyLoading(true);
     

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        address: kernelAccount.address,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          regular: passkeyValidator,
        },
      });

      const kernelClient = createKernelAccountClient({
        account: account,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());

      const transferOpHash = await kernelClient.sendUserOperation({
        calls: [
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [
                "0x4337012eaf1f862B8dBDC6b62a01782AE01Ef038",
                parseEther("1.01"),
              ],
            }),
          },
        ],
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onGrantSessionKey ~ receipt:", receipt);
      setTxId(receipt.receipt.transactionHash);
      setTransferWithPassKeyLoading(false);
    } catch (error: any) {
      setTransferWithPassKeyLoading(false);
      setErrorMessage(error.message);
      console.error("🚀 ~ initPassKey ~ error", error);
    }
  };

  const onGrantSessionKey = async () => {
    try {
      if (!walletClient || !smartAccountClient || !kernelAccount) {
        console.log("Not initialized");
        return;
      }
      setGrantSessionLoading(true);
      const { sudoValidator, ecdsaSessionSigner } = await getECDSASigners();

      const { transferPolicies, spendingLimitHook } =
        await getPoliciesAndHooks();

      const sessionPermission = await toPermissionValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        signer: ecdsaSessionSigner,
        policies: [transferPolicies],
      });

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        address: kernelAccount.address,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: sudoValidator,
          regular: sessionPermission,
          // hook: spendingLimitHook,
        },
      });

      const kernelClient = createKernelAccountClient({
        account: account,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());


      // mint user op
      const transferOpHash = await kernelClient.sendUserOperation({
        calls: [
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [WHITELIST_ADDRESSES[0], parseEther("1")],
            }),
          }
        ],
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onGrantSessionKey ~ receipt:", receipt);
      setTxId(receipt.receipt.transactionHash);
      setGrantSessionLoading(false);
    } catch (error:any) {
      console.error("🚀 ~ initPassKey ~ error", error);
      setGrantSessionLoading(false);
      setErrorMessage(error.message);
    }
  };


  const onRevokeSessionKey = async () => {
    try {
      if (!walletClient || !smartAccountClient || !kernelAccount) {
        console.log("Not initialized");
        return;
      }
      setGrantSessionLoading(true);
      const { sudoValidator, ecdsaSessionSigner } = await getECDSASigners();
      
      const sessionPermission = await toPermissionValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        signer: ecdsaSessionSigner,
        policies: [],
      });

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        address: kernelAccount.address,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          sudo: sudoValidator,
          regular: sessionPermission,
          // hook: spendingLimitHook,
        },
      });

      const kernelClient = createKernelAccountClient({
        account: account,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());


      // mint user op
      const transferOpHash = await kernelClient.sendTransaction({
        callData:"0x0",
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onGrantSessionKey ~ receipt:", receipt);
      setTxId(receipt.receipt.transactionHash);
      setGrantSessionLoading(false);
    } catch (error: any) {
      console.error("🚀 ~ initPassKey ~ error", error);
      setGrantSessionLoading(false);
      setErrorMessage(error.message);
    }
  };

  const onTransferWithSessionKey = async (amount: number) => {
    try {
      if (!walletClient || !smartAccountClient || !kernelAccount) {
        console.log("Not initialized");
        return;
      }
      if (!isAddress(toAddress as string)) {
        console.log("Invalid address");
        return;
      }
      setTransferLoading(true);
      const { ecdsaSessionSigner } = await getECDSASigners();

      const { transferPolicies } = await getPoliciesAndHooks();

      const sessionPermission = await toPermissionValidator(publicClient, {
        entryPoint,
        kernelVersion: KERNEL_V3_1,
        signer: ecdsaSessionSigner,
        policies: [transferPolicies],
      });

      const account = await createKernelAccount(publicClient, {
        entryPoint,
        address: kernelAccount.address,
        kernelVersion: KERNEL_V3_1,
        plugins: {
          // sudo: sudoValidator,
          regular: sessionPermission,
        },
      });

      const kernelClient = createKernelAccountClient({
        account: account,
        chain: sepolia,
        bundlerTransport: http(BUNDLER_URL),
        paymaster: pimlicoClient,
        userOperation: {
          estimateFeesPerGas: async () => {
            return (await pimlicoClient.getUserOperationGasPrice()).fast;
          },
        },
      }).extend(erc7579Actions());

      // mint user op
      const transferOpHash = await kernelClient.sendUserOperation({
        calls: [
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [toAddress as Address, parseEther(amount.toString())],
            }),
          }
        ],
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onTransferWithSessionKey ~ receipt:", receipt);
      setTransferLoading(false);
      setTxId(receipt.receipt.transactionHash);
    } catch (error: any) {
      console.log("🚀 ~ onTransferWithSessionKey ~ error:", error);
      setTransferLoading(false);
      setErrorMessage(error.message);
    }
  };


  const renderSigners = () => {
    return (
      <div>
        <h3 className="text-lg font-bold mb-2">Available Signers</h3>
        <ul>
          <li className="flex items-center mb-2">
            <p className="mr-2">SudoSigner: {sudoSigner.address}</p>
            {selectedSigner?.address === sudoSigner.address && (
              <button
                onClick={() => setSelectedSigner(sudoSigner)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mr-2"
              >
                Sudo Signer
              </button>
            )}
          </li>
          <li className="flex items-center">
            <p className="mr-2">SessionSigner: {sessionSigner.address}</p>
            {selectedSigner?.address === sessionSigner.address && (
              <button
                onClick={() => setSelectedSigner(sessionSigner)}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Session Signer
              </button>
            )}
          </li>
        </ul>
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <ConnectButton />
        <h2 className="text-xl font-bold mb-4">
          Kernel Address: {kernelAddress}
        </h2>
        {renderSigners()}

        <button
          onClick={initZeroAccount}
          disabled={false}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-4"
        >
          {"Init Zero Account"}
        </button>
      </div>
      {txId && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
          <h2 className="text-xl font-bold mb-4">Transaction</h2>
          <a
            href={`https://sepolia.etherscan.io/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            {`https://sepolia.etherscan.io/tx/${txId}`}
          </a>
        </div>
      )}
      {errorMessage && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
          <h2 className="text-xl font-bold mb-4">Error</h2>
          <p>{errorMessage}</p>
        </div>
      )}
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <h2 className="text-xl font-bold mb-4">Test Passkey sudo</h2>

        <button
          onClick={initPassKey}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-4"
        >
          {"Generate Passkey"}
        </button>

        <button
          onClick={grantPassKeyAsSudo}
          disabled={grantSudoPassKeyLoading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-4"
        >
          {grantSudoPassKeyLoading ? "Initializing..." : "Init passkey as sudo"}
        </button>

        <button
          onClick={onTransferWithPassKey}
          disabled={transferWithPassKeyLoading}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 mr-4"
        >
          {transferWithPassKeyLoading ? "Loading" : "Transfer with passkey"}
        </button>
      </div>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <h2 className="text-xl font-bold mb-4">Session Key</h2>
        <div className="mb-4">
          <h3 className="text-lg font-bold mb-2">Policy</h3>
          <p>Only transfer to {WHITELIST_ADDRESSES.join(',')} addresses and less than {LIMIT_AMOUNT_PER_TRANSFER} tokens.</p>
        </div>
        <div className="mb-4">
          <button
            onClick={onGrantSessionKey}
            disabled={!kernelAccount || grantSessionLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-4"
          >
            {grantSessionLoading
              ? "Granting Session Key..."
              : "Grant Session Key"}
          </button>

          {/* <button
            onClick={onRevokeSessionKey}
            disabled={!kernelAccount || grantSessionLoading}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            {grantSessionLoading
              ? "Revoking Session Key..."
              : "Revoke Session Key"}
          </button> */}
        </div>
        <div>
          <div className="mb-4">
            <select
              className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              onChange={(e) => setToAddress(e.target.value as any)}
              value={toAddress}
            >
              <option value="">Select address to transfer</option>
              {WHITELIST_ADDRESSES.concat(OTHER_ADDRESSES).map(
                (address, index) => (
                  <option key={index} value={address}>
                    {address}
                  </option>
                )
              )}
            </select>
          </div>
          <button
            onClick={()=>onTransferWithSessionKey(0.05)}
            disabled={!kernelAccount || transferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600 mr-4"
          >
            {transferLoading ? "Transferring..." : "Transfer 0.05 Token"}
          </button>
          <button
            onClick={()=>onTransferWithSessionKey(20)}
            disabled={!kernelAccount || transferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            {transferLoading ? "Transferring..." : "Transfer 20 Token"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SafePage;
