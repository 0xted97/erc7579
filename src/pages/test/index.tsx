"use client";

import {
  guardian1,
  guardian2,
  guardian3,
  pimlicoClient,
  publicClient,
} from "./../../utils/config";

import { useCallback, useEffect, useState } from "react";
import {
  Address,
  Client,
  createWalletClient,
  custom,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  http,
  HttpTransport,
  parseAbi,
  parseAbiParameters,
  parseEther,
} from "viem";
import { sepolia } from "viem/chains";
import {
  toSafeSmartAccount,
  ToSafeSmartAccountReturnType,
} from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import {
  bundlerActions,
  BundlerActions,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import {
  encodeValidatorNonce,
  getAccount,
  getAddOwnableValidatorOwnerAction,
  getAddSocialRecoveryGuardianAction,
  getOwnableValidator,
  getOwnableValidatorOwners,
  getOwnableValidatorThreshold,
  getRemoveOwnableValidatorOwnerAction,
  getRemoveSocialRecoveryGuardianAction,
  getSetOwnableValidatorThresholdAction,
  getSocialRecoveryGuardians,
  getSocialRecoveryMockSignature,
  getSocialRecoveryValidator,
} from "@rhinestone/module-sdk";

import { BUNDLER_URL, OWNER_PK } from "@/utils/constants";
import { createSmartAccountClient } from "permissionless";
import { Erc7579Actions, erc7579Actions } from "permissionless/actions/erc7579";
import { privateKeyToAccount } from "viem/accounts";

export default function Page() {
  const DEFAULT_SALE_NONCE = BigInt(12345678910);
  // The module we will use is deployed as a smart contract on Sepolia:
  const ownableExecutorModule = "0xc98B026383885F41d9a995f85FC480E9bb8bB891";
  const executorAddress = "0x45c761075C1109B6F3c7e8516dAB8fD7daA89bBa";
  const wallet0 = "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656";
  const wallet1 = "0xBF6dc05235645299bAa2148300aBbc0E730C74cA";
  const wallet2 = "0xC818409492AFf04EdDc5c15ED0b24aB8e1CC26E4";
  const validator = privateKeyToAccount(OWNER_PK);
  const token7579 = "0x042d5D690E3339a57B0983ec5311BbE6Fa8bBD4F";

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

  // Module: OwnableExecutor
  const [owners, setOwners] = useState<string[]>([]);
  const [isInstalledOwnableExecutor, setIsInstalledOwnableExecutor] =
    useState(false);

  // Module: OwnableValidator
  const ownableValidatorModule = getOwnableValidator({
    owners: [wallet0],
    threshold: 1,
  });
  const [ownersOwnableValidator, setOwnersOwnableValidator] = useState<
    string[]
  >([]);
  const [thresholdOwnableValidator, setThresholdOwnableValidator] = useState<
    string | number
  >(0);
  const [isInstalledOwnableValidator, setIsInstalledOwnableValidator] =
    useState(false);

  // Module: SocialRecovery
  const socialRecovery = getSocialRecoveryValidator({
    threshold: 2,
    guardians: [guardian1.address, guardian2.address, guardian3.address],
  });
  const [isInstalledSocialRecovery, setIsInstalledSocialRecovery] =
    useState(false);
  const [guardians, setGuardians] = useState<string[]>([]);

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

    const isModuleInstalled =
      isSafeDeployed &&
      (await smartAccountClient.isModuleInstalled({
        address: ownableExecutorModule,
        type: "executor",
        context: "0x",
      }));
    setIsInstalledOwnableExecutor(isModuleInstalled);

    const isSocialRecoveryInstalled =
      isSafeDeployed &&
      (await smartAccountClient.isModuleInstalled({
        address: socialRecovery.address,
        type: "validator",
        context: "0x",
      }));
    setIsInstalledSocialRecovery(isSocialRecoveryInstalled);

    const isOwnableValidatorInstalled =
      isSafeDeployed &&
      (await smartAccountClient.isModuleInstalled({
        address: ownableValidatorModule.address,
        type: "validator",
        context: ownableValidatorModule.initData,
      }));
    setIsInstalledOwnableValidator(isOwnableValidatorInstalled);

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
      context: encodePacked(["address"], [executorAddress as `0x${string}`]),
    });

    console.log("User operation hash:", userOpHash, "\nwaiting for receipt...");

    // After we sent the user operation, we wait for the transaction to be settled:
    const transactionReceipt = await pimlicoClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });
    console.log("🚀 ~ installModule ~ transactionReceipt:", transactionReceipt);
  }, [smartAccountClient, ownableExecutorModule]);

  const unInstallModule = useCallback(async () => {
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
    if (!isModuleInstalled) {
      console.log("Module is not installed");
      return;
    }

    const userOpHash = await smartAccountClient?.uninstallModule({
      type: "executor",
      address: ownableExecutorModule,
      context: encodeAbiParameters(
        parseAbiParameters("address prevEntry, bytes memory deInitData"),
        ["0x0000000000000000000000000000000000000001", "0x"]
      ),
    });

    console.log("User operation hash:", userOpHash, "\nwaiting for receipt...");

    // After we sent the user operation, we wait for the transaction to be settled:
    const transactionReceipt = await pimlicoClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });
    console.log("🚀 ~ installModule ~ transactionReceipt:", transactionReceipt);
  }, [smartAccountClient, ownableExecutorModule]);

  const addOwnerExecutor = async () => {
    if (!smartAccountClient) {
      return;
    }
    const addOwnerData = encodeFunctionData({
      abi: parseAbi(["function addOwner(address)"]),
      functionName: "addOwner",
      args: [executorAddress],
    });

    const userOpHash = await smartAccountClient?.sendUserOperation({
      calls: [
        {
          to: ownableExecutorModule,
          data: addOwnerData,
          value: BigInt(0),
        },
      ],
    });
    console.log("User operation hash:", userOpHash, "\nwaiting for receipt...");

    const transactionReceipt = await pimlicoClient.waitForUserOperationReceipt({
      hash: userOpHash as `0x${string}`,
    });
    console.log("🚀 ~ addOwner ~ transactionReceipt:", transactionReceipt);
  };

  const executeOnOwnedAccount = async () => {
    try {
      console.log("Executing on owned account...");
      if (!smartAccountClient) {
        return;
      }
      if (!isInstalledOwnableExecutor) {
        console.log("Module is not installed");
        return;
      }

      const executeOnOwnedAccountData = encodePacked(
        ["address", "uint256", "bytes"],
        [
          token7579,
          parseEther("0"),
          encodeFunctionData({
            abi: parseAbi(["function transfer(address, uint256)"]),
            functionName: "transfer",
            args: [executorAddress, parseEther("0.01")],
          }),
        ]
      );

      const hash = await walletClient!.writeContract({
        chain: sepolia,
        account: executorAddress as `0x${string}`,
        abi: parseAbi(["function executeOnOwnedAccount(address, bytes)"]),
        functionName: "executeOnOwnedAccount",
        args: [safeAddress as `0x${string}`, executeOnOwnedAccountData],
        address: ownableExecutorModule,
      });

      console.log("Executed on owned account, transaction hash:", hash);

      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      console.log("🚀 ~ executeOnOwnedAccount ~ receipt:", receipt);
    } catch (error) {
      console.error(error);
    }
  };

  const getOwnersExecutor = async () => {
    if (!smartAccountClient) {
      return;
    }
    if (!isInstalledOwnableExecutor) {
      console.log("Module is not installed");
      return;
    }
    const owners = await publicClient!.readContract({
      abi: parseAbi(["function getOwners(address) returns(address[])"]),
      functionName: "getOwners",
      args: [safeAccount?.address],
      address: ownableExecutorModule,
    });
    setOwners(owners);
  };

  // #region Ownable Validator
  const installOwnableValidatorModule = useCallback(async () => {
    try {
      if (!smartAccountClient) {
        return;
      }
      const opHash = await smartAccountClient.installModule({
        address: ownableValidatorModule.address,
        type: ownableValidatorModule.type,
        context: ownableValidatorModule.initData,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      console.log("🚀 ~ installSocialRecoveryModule ~ result:", result);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const removeOwnableValidator = useCallback(
    async (owner: string) => {
      try {
        if (!smartAccountClient || !safeAccount) {
          return;
        }
        const removeOwner = await getRemoveOwnableValidatorOwnerAction({
          client: publicClient,
          account: safeAccount as any,
          owner: owner as Address,
        });

        const userOpHash = await smartAccountClient?.sendUserOperation({
          calls: [
            {
              to: removeOwner.to,
              data: removeOwner.data,
              value: BigInt(0),
            },
          ],
        });
        const result = await pimlicoClient.waitForUserOperationReceipt({
          hash: userOpHash,
        });
        console.log("🚀 ~ removeOwnableValidator ~ result:", result);
      } catch (error) {
        console.error(error);
      }
    },
    [smartAccountClient, socialRecovery]
  );

  const transferTokenByOwnableValidator = useCallback(async () => {
    try {
      if (!smartAccountClient || !safeAccount) {
        return;
      }
      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: ownableValidatorModule,
        }),
      });

      const userOperation = await smartAccountClient.prepareUserOperation({
        account: safeAccount,
        nonce,
        calls: [
          {
            to: token7579,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [executorAddress, parseEther("0.01")],
            }),
          },
          {
            to: token7579,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [guardian1.address, parseEther("0.02")],
            }),
          },
        ],
      });
      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      const signature1 = await validator.signMessage({
        message: { raw: userOpHashToSign },
      });
      userOperation.signature = signature1;

      const userOpHash = await smartAccountClient.sendUserOperation(
        userOperation
      );
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log("🚀 ~ transferTokenByOwnableValidator ~ receipt:", receipt);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const addGuardianByOwnableValidator = useCallback(async () => {
    try {
      if (!smartAccountClient || !safeAccount) {
        return;
      }
      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: ownableValidatorModule,
        }),
      });

      const addGuardian = getAddSocialRecoveryGuardianAction({
        guardian: "0xE96dA2357f5A6fD3ECd7E3436ea10726394CB99d",
      });

      const userOperation = await smartAccountClient.prepareUserOperation({
        account: safeAccount,
        nonce,
        calls: [addGuardian],
      });
      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      const signature1 = await validator.signMessage({
        message: { raw: userOpHashToSign },
      });
      userOperation.signature = signature1;

      const userOpHash = await smartAccountClient.sendUserOperation(
        userOperation
      );
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log("🚀 ~ addGuardianByOwnableValidator ~ receipt:", receipt);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery, ownableValidatorModule]);

  const setThresholdForOwnableValidator = useCallback(async () => {
    try {
      if (!smartAccountClient || !safeAccount) {
        return;
      }
      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: ownableValidatorModule,
        }),
      });

      const setThresholdAction = getSetOwnableValidatorThresholdAction({
        threshold: 2,
      });

      const userOperation = await smartAccountClient.prepareUserOperation({
        account: safeAccount,
        nonce,
        calls: [setThresholdAction],
      });
      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      const signature1 = await validator.signMessage({
        message: { raw: userOpHashToSign },
      });
      userOperation.signature = signature1;

      const userOpHash = await smartAccountClient.sendUserOperation(
        userOperation
      );
      const receipt = await smartAccountClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log("🚀 ~ setThreshold ~ receipt:", receipt);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const getOwnerAndThreshold = useCallback(async () => {
    try {
      if (!smartAccountClient) {
        return;
      }
      const owners = await getOwnableValidatorOwners({
        account: safeAccount as any,
        client: publicClient,
      });

      const threshold = await getOwnableValidatorThreshold({
        account: safeAccount as any,
        client: publicClient,
      });
      setOwnersOwnableValidator(owners);
      setThresholdOwnableValidator(threshold);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);
  // #endregion Ownable Validator

  //#region Social Recovery
  const installSocialRecoveryModule = useCallback(async () => {
    try {
      if (!smartAccountClient) {
        return;
      }
      const opHash = await smartAccountClient.installModule({
        address: socialRecovery.address,
        type: socialRecovery.type,
        context: socialRecovery.initData,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      console.log("🚀 ~ installSocialRecoveryModule ~ result:", result);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const unInstallSocialRecoveryModule = useCallback(async () => {
    try {
      if (!smartAccountClient) {
        return;
      }
      const opHash = await smartAccountClient.uninstallModule({
        address: socialRecovery.address,
        type: socialRecovery.type,
        context: encodeAbiParameters(
          parseAbiParameters("address prevEntry, bytes memory deInitData"),
          ["0x0000000000000000000000000000000000000001", "0x"]
        ),
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      console.log("🚀 ~ unInstallSocialRecoveryModule ~ result:", result);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const recoveryKey = useCallback(async () => {
    try {
      if (!smartAccountClient || !safeAccount) {
        return;
      }

      const addNewOwner = await getAddOwnableValidatorOwnerAction({
        client: publicClient,
        account: safeAccount as any,
        owner: validator.address,
      });

      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: socialRecovery,
        }),
      });

      const mockSignature = getSocialRecoveryMockSignature({
        threshold: 2,
      });
      console.log("🚀 ~ recoveryKey ~ mockSignature:", mockSignature);

      const userOperation = await smartAccountClient.prepareUserOperation({
        account: safeAccount,
        calls: [addNewOwner],
        nonce: nonce,
        signature: mockSignature,
      });

      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      const signature1 = await guardian1.signMessage({
        message: { raw: userOpHashToSign },
      });

      const signature2 = await guardian2.signMessage({
        message: { raw: userOpHashToSign },
      });

      userOperation.signature = encodePacked(
        ["bytes", "bytes"],
        [signature1, signature2]
      );

      const userOpHash = await smartAccountClient.sendUserOperation(
        userOperation
      );

      const receipt = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      console.log("🚀 ~ recoveryKey ~ receipt:", receipt);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);

  const removeGuardian = useCallback(
    async (guardian: Address) => {
      try {
        if (!smartAccountClient || !safeAccount) {
          return;
        }

        const removeGuardianAction =
          await getRemoveSocialRecoveryGuardianAction({
            client: publicClient,
            account: safeAccount as any,
            guardian: guardian,
          });

        const userOpHash = await smartAccountClient?.sendUserOperation({
          account: safeAccount,
          calls: [
            {
              to: removeGuardianAction.to,
              data: removeGuardianAction.data,
              value: BigInt(removeGuardianAction.value.toString()),
            },
          ],
        });

        const result = await pimlicoClient.waitForUserOperationReceipt({
          hash: userOpHash,
        });
        console.log("🚀 ~ removeGuardian ~ result:", result);
      } catch (error) {
        console.error(error);
      }
    },
    [smartAccountClient, socialRecovery]
  );

  const getGuardians = useCallback(async () => {
    try {
      if (!smartAccountClient || !safeAccount) {
        return;
      }
      const guardians = await getSocialRecoveryGuardians({
        client: publicClient,
        account: safeAccount as any,
      });
      setGuardians(guardians);

      const owners = await getOwnableValidatorOwners({
        client: publicClient,
        account: safeAccount as any,
      });
      console.log("🚀 ~ getGuardians ~ owners:", owners);
    } catch (error) {
      console.error(error);
    }
  }, [smartAccountClient, socialRecovery]);
  //#endregion Social Recovery

  return (
    <div>
      <button
        className="mr-2 px-4 py-2 bg-blue-500 text-white rounded"
        onClick={connectWallets}
      >
        Connect Wallet
      </button>
      {safeAddress && (
        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            border: "1px solid #ccc",
            borderRadius: "5px",
            wordBreak: "break-all",
          }}
        >
          <h3>Safe Address:</h3>
          <p>{safeAddress}</p>
        </div>
      )}
      <div
        style={{
          marginTop: "20px",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "5px",
        }}
      >
        <h3>
          Module: <b>Ownable Executor</b>{" "}
          {isInstalledOwnableExecutor ? "✅" : "❌"}
        </h3>
        <p>{ownableExecutorModule}</p>
        <p>Owners: {owners.join(",")}</p>
        <button
          onClick={installModule}
          className="mr-2 px-4 py-2 bg-blue-500 text-white rounded"
        >
          Install Module
        </button>
        <button
          onClick={unInstallModule}
          className="mr-2 px-4 py-2 bg-red-500 text-white rounded"
        >
          Uninstall Module
        </button>
        <button
          onClick={getOwnersExecutor}
          className="mr-2 px-4 py-2 bg-yellow-500 text-white rounded"
        >
          Get Owners
        </button>
        <button
          onClick={addOwnerExecutor}
          className="mr-2 px-4 py-2 bg-green-500 text-white rounded"
        >
          Add Owner
        </button>
        <button
          onClick={executeOnOwnedAccount}
          className="px-4 py-2 bg-purple-500 text-white rounded"
        >
          Transfer by Executor
        </button>
      </div>
      <div
        style={{
          marginTop: "20px",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "5px",
        }}
      >
        <h3>
          Module: <b>Ownable Validator</b>{" "}
          {isInstalledOwnableValidator ? "✅" : "❌"}
        </h3>
        <i>it can use as multisig</i>
        <p>{ownableValidatorModule.address}</p>
        <p>
          Threshold: <b>{thresholdOwnableValidator}</b>
        </p>
        <ul>
          <b>Validator:</b>
          {ownersOwnableValidator.map((owner, index) => (
            <li
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              {owner}
              <button
                onClick={() => {
                  removeOwnableValidator(owner as Address);
                }}
                className="ml-2 px-2 py-1 bg-red-500 text-white rounded"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={installOwnableValidatorModule}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
        >
          Install ownable validator
        </button>

        <button
          onClick={getOwnerAndThreshold}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
        >
          Get owners + threshold
        </button>
        <button
          onClick={setThresholdForOwnableValidator}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
        >
          Set threshold
        </button>
        <button
          onClick={transferTokenByOwnableValidator}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
        >
          Test transfer
        </button>
        <button
          onClick={addGuardianByOwnableValidator}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
        >
          Add some guardian
        </button>
      </div>
      <div
        style={{
          marginTop: "20px",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "5px",
        }}
      >
        <h3>
          Module: <b>SocialRecovery Validator</b>{" "}
          {isInstalledSocialRecovery ? "✅" : "❌"}
        </h3>
        <p>{socialRecovery.address}</p>
        <ul>
          <b>Guardians:</b>
          {guardians.map((guardian, index) => (
            <li
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "10px",
              }}
            >
              {guardian}
              <button
                onClick={() => {
                  removeGuardian(guardian as Address);
                }}
                className="ml-2 px-2 py-1 bg-red-500 text-white rounded"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={installSocialRecoveryModule}
          className="px-4 py-2 bg-teal-500 text-white rounded"
          style={{ marginRight: "10px" }}
        >
          Install social recovery
        </button>
        <button
          onClick={unInstallSocialRecoveryModule}
          className="mr-2 px-4 py-2 bg-orange-500 text-white rounded"
          style={{ marginLeft: "10px" }}
        >
          Uninstall social recovery
        </button>
        <button
          onClick={recoveryKey}
          className="mr-2 px-4 py-2 bg-purple-500 text-white rounded"
          style={{ marginLeft: "10px" }}
        >
          Recover
        </button>
        <button
          onClick={getGuardians}
          className="mr-2 px-4 py-2 bg-pink-500 text-white rounded"
          style={{ marginLeft: "10px" }}
        >
          Get guardians
        </button>
      </div>
    </div>
  );
}
