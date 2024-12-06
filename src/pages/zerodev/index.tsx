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

  const sudoSigner = privateKeyToAccount(
    "0xcc0502397649f81dcbed56cb8ec6b022492fce2de97e9e6bb32944c58c0d1a0c"
  );
  const sessionSigner = privateKeyToAccount(
    "0xb404432b675c8971ea819c5014dff012289aacabad4a331d58dbda46ed84e3f3"
  );

  const WHITELIST_ADDRESSES: Address[] = [
    "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656",
  ];

  const OTHER_ADDRESSES: Address[] = [
    "0x43370108f30Ee5Ed54A9565F37af3BE8502903f5",
  ];

  const [selectedSigner, setSelectedSigner] = useState<PrivateKeyAccount>();

  const [kernelAddress, setKernelAddress] = useState<string | null>(null);
  const [isDeployed, setIsDeployed] = useState(false);
  const [txId, setTxId] = useState("");
  const [grantSessionLoading, setGrantSessionLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
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
              value: parseEther("10"),
            },
          ],
        },
      ],
    });
    const spendingLimitHook = await toSpendingLimitHook({
      limits: [{ token: TOKEN7579_ADDRESS, allowance: BigInt(1) }],
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
      if (!walletClient) {
        console.log("walletClient is not initialized");
        return;
      }
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

      const passkeyValidator = await toPasskeyValidator(publicClient, {
        webAuthnKey,
        kernelVersion: KERNEL_V3_1,
        validatorContractVersion: PasskeyValidatorContractVersion.V0_0_2,
        entryPoint: entryPoint,
      });

      console.log("🚀 ~ initPassKey ~ webAuthnKey:", webAuthnKey);
    } catch (error) {
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

      const { transferPolicies, spendingLimitHook } = await getPoliciesAndHooks();

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

      const mintTransactionHash = await kernelClient.sendTransaction({
        to: TOKEN7579_ADDRESS,
        data: encodeFunctionData({
          abi: parseAbi(["function transfer(address, uint256)"]),
          functionName: "transfer",
          args: [WHITELIST_ADDRESSES[0], parseEther("0.05")],
        }),
      });
      console.log("🚀 ~ onGrantSessionKey ~ mintTransactionHash:", mintTransactionHash)

      // // mint user op
      // const transferOpHash = await kernelClient.sendUserOperation({
      //   calls: [
      //     {
      //       to: TOKEN7579_ADDRESS,
      //       value: BigInt(0),
      //       data: encodeFunctionData({
      //         abi: parseAbi(["function transfer(address, uint256)"]),
      //         functionName: "transfer",
      //         args: [WHITELIST_ADDRESSES[0], parseEther("0.05")],
      //       }),
      //     }
      //   ],
      // });

      // const receipt = await kernelClient.waitForUserOperationReceipt({
      //   hash: transferOpHash,
      // });
      // console.log("🚀 ~ onGrantSessionKey ~ receipt:", receipt);
      // setTxId(receipt.receipt.transactionHash);
      setGrantSessionLoading(false);
    } catch (error) {
      console.error("🚀 ~ initPassKey ~ error", error);
      setGrantSessionLoading(false);
    }
  };

  const onTransferWithSessionKey = async () => {
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
              args: [toAddress as Address, parseEther("9")],
            }),
          },
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [toAddress as Address, parseEther("2")],
            }),
          },
        ],
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: transferOpHash,
      });
      console.log("🚀 ~ onTransferWithSessionKey ~ receipt:", receipt);
      setTransferLoading(false);
      setTxId(receipt.receipt.transactionHash);
    } catch (error) {
      console.log("🚀 ~ onTransferWithSessionKey ~ error:", error);
      setTransferLoading(false);
    }
  };

  const onTestTransfer = async () => {
    try {
      if (!walletClient || !smartAccountClient || !kernelAccount) {
        console.log("Not initialized");
        return;
      }

      const transferUserOpHash = await smartAccountClient.sendUserOperation({
        callData: await kernelAccount.encodeCalls([
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [
                "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656",
                parseEther("0.01"),
              ],
            }),
          },
        ]),
      });

      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: transferUserOpHash,
      });
      console.log("🚀 ~ onTestTransfer ~ receipt:", receipt);
      setTxId(receipt.receipt.transactionHash);
    } catch (error) {
      console.error("🚀 ~ initPassKey ~ error", error);
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
          Safe Address: {kernelAddress}
        </h2>
        {renderSigners()}
        <button
          onClick={initPassKey}
          disabled={false}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          {"Init passkey"}
        </button>
        <button
          onClick={initZeroAccount}
          disabled={false}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-4"
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
      <div className="bg-white shadow-md rounded-lg p-6 mb-6 m-4">
        <h2 className="text-xl font-bold mb-4">Session Key</h2>
        <div className="mb-4">
            <button
            onClick={onGrantSessionKey}
            disabled={!kernelAccount || grantSessionLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
            {grantSessionLoading ? "Granting Session Key..." : "Grant Session Key"}
            </button>
        </div>
        <div>
          <div className="mb-4">
            <select
              className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
              onChange={(e) => setToAddress(e.target.value as any)}
              value={toAddress}
            >
              <option value="">Select address to transfer</option>
              {WHITELIST_ADDRESSES.concat(OTHER_ADDRESSES).map((address, index) => (
                <option key={index} value={address}>
                  {address}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={onTransferWithSessionKey}
            disabled={!kernelAccount || transferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            {transferLoading ? "Transferring..." : "Transfer with session"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SafePage;
