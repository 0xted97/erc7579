import { pimlicoClient } from "@/utils/config";
import { TOKEN7579_ADDRESS } from "@/utils/constants";
import {
  encodeValidatorNonce,
  getAccount,
  getAddOwnableValidatorOwnerAction,
  getOwnableValidator,
  getOwnableValidatorOwners,
  getOwnableValidatorThreshold,
  OWNABLE_VALIDATOR_ADDRESS,
} from "@rhinestone/module-sdk";
import { ToSafeSmartAccountReturnType } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { Erc7579Actions } from "permissionless/actions/erc7579";
import React, { useCallback, useEffect, useState } from "react";
import {
  Address,
  Client,
  createPublicClient,
  encodeFunctionData,
  encodePacked,
  http,
  HttpTransport,
  isAddress,
  parseAbi,
  parseEther,
} from "viem";
import {
  BundlerActions,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { useWalletClient } from "wagmi";

interface MultiSigProps {
  isSafeDeployed: boolean;
  safeAccount: ToSafeSmartAccountReturnType<"0.7">;
  smartAccount: Client<HttpTransport, typeof sepolia> &
    Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> &
    BundlerActions;
}

const MultiSig: React.FC<MultiSigProps> = ({
  safeAccount,
  smartAccount,
  isSafeDeployed,
}) => {
  const DEFAULT_OWNERS = [
    "0xBF6dc05235645299bAa2148300aBbc0E730C74cA",
    "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656",
    "0xC818409492AFf04EdDc5c15ED0b24aB8e1CC26E4",
  ] as Address[];
  const DEFAULT_THRESHOLD = 1;

  const installData = getOwnableValidator({
    owners: DEFAULT_OWNERS,
    threshold: DEFAULT_THRESHOLD,
  });

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const { data: walletClient } = useWalletClient();

  const [isInstalled, setIsInstalled] = useState(false);
  const [owners, setOwners] = useState<Address[]>(DEFAULT_OWNERS);
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [newOwner, setNewOwner] = useState<Address | null>(
    "0x7b0949204e7Da1B0beD6d4CCb68497F51621b574"
  );
  const [txId, setTxId] = useState<string | null>();
  const [installLoading, setInstallLoading] = useState(false);
  const [addOwnerLoading, setAddOwnerLoading] = useState(false);
  const [testTransferLoading, setTestTransferLoading] = useState(false);

  const initData = async () => {
    if (!smartAccount || !isSafeDeployed) {
      return;
    }

    const isModuleInstalled = await smartAccount.isModuleInstalled({
      address: OWNABLE_VALIDATOR_ADDRESS,
      type: "validator",
      context: "0x",
    });
    setIsInstalled(isModuleInstalled);
  };

  const fetchData = async () => {
    try {
      if (!smartAccount || !isSafeDeployed || !isInstalled) {
        return;
      }

      const owners = await getOwnableValidatorOwners({
        account: safeAccount as any,
        client: publicClient,
      });
      setOwners(owners);

      const threshold = await getOwnableValidatorThreshold({
        account: safeAccount as any,
        client: publicClient,
      });
      setThreshold(threshold);
    } catch (error) {
      console.error("Error fetching data", error);
    }
  };

  useEffect(() => {
    initData();
  }, [smartAccount, isSafeDeployed]);

  useEffect(() => {
    fetchData();
  }, [isInstalled]);

  const onAddOwner = async () => {
    try {
      if (!smartAccount || !isSafeDeployed || !isInstalled) {
        return;
      }
      if (!isAddress(newOwner as any)) {
        alert("Please add a new owner");
        return;
      }
      setAddOwnerLoading(true);
      const updateOwners = await getAddOwnableValidatorOwnerAction({
        owner: newOwner!,
        account: safeAccount as any,
        client: publicClient,
      });

      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: installData,
        }),
      });

      const userOperation = await smartAccount.prepareUserOperation({
        account: safeAccount,
        nonce,
        calls: [updateOwners],
      });

      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      const signature = await walletClient?.signMessage({
        message: {
          raw: userOpHashToSign,
        },
      });

      userOperation.signature = encodePacked(["bytes"], [signature || "0x"]);

      const userOpHash = await smartAccount.sendUserOperation(userOperation);
      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      setTxId(result.receipt.transactionHash);
      fetchData();
      setAddOwnerLoading(false);
    } catch (error) {
      setAddOwnerLoading(false);
      console.error("Error updating owners and threshold", error);
    }
  };

  const onTestTransfer = async () => {
    try {
      if (!smartAccount || !isSafeDeployed || !isInstalled) {
        return;
      }
      setTestTransferLoading(true);
      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account: getAccount({
            address: safeAccount.address,
            type: "safe",
          }),
          validator: installData,
        }),
      });
      const randomAccount1 = privateKeyToAccount(generatePrivateKey());
      const randomAccount2 = privateKeyToAccount(generatePrivateKey());

      const userOperation = await smartAccount.prepareUserOperation({
        account: safeAccount,
        nonce,
        calls: [
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [randomAccount1.address, parseEther("0.01")],
            }),
          },
          {
            to: TOKEN7579_ADDRESS,
            value: BigInt(0),
            data: encodeFunctionData({
              abi: parseAbi(["function transfer(address, uint256)"]),
              functionName: "transfer",
              args: [randomAccount2.address, parseEther("0.02")],
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

      const signature = await walletClient?.signMessage({
        account: "0xBF6dc05235645299bAa2148300aBbc0E730C74cA",
        message: {
          raw: userOpHashToSign,
        },
      });

      userOperation.signature = encodePacked(["bytes"], [signature || "0x"]);

      const userOpHash = await smartAccount.sendUserOperation(userOperation);
      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      setTxId(result.receipt.transactionHash);
      fetchData();
      setTestTransferLoading(false);
    } catch (error) {
      setTestTransferLoading(false);

    }
  };

  const onInstallModule = useCallback(async () => {
    try {
      setInstallLoading(true);
      const installData = getOwnableValidator({
        owners,
        threshold,
      });
      const opHash = await smartAccount.installModule({
        address: installData.address,
        type: installData.type,
        context: installData.initData,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      setTxId(result.receipt.transactionHash);
      setInstallLoading(false);
    } catch (error) {
      setInstallLoading(false);
      console.error("Error installing module", error);
    }
  }, [smartAccount, isSafeDeployed, isInstalled, safeAccount]);

  return (
    <div className="p-6 bg-gray-100 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">MultiSig Module</h2>
      <h3 className="text-2xl font-bold mb-4">Threshold: {threshold}</h3>
      {txId && (
        <div className="bg-green-100 p-4 rounded-lg mb-4">
          <a
            href={`${sepolia.blockExplorers.default.url}/tx/${txId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {txId}
          </a>
        </div>
      )}
      <div className="mb-4">
        {!isInstalled && (
          <div>
            <p className="text-red-500 mb-2">Module not installed</p>
            <button
              onClick={onInstallModule}
              disabled={installLoading}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
            >
              {installLoading ? "Loading..." : "Install Module"}
            </button>
          </div>
        )}
      </div>
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-2">Owners</h3>
        <ul className="list-disc pl-5 mb-4">
          {owners.map((owner) => (
            <li key={owner} className="flex justify-between items-center mb-2">
              <span>{owner}</span>
            </li>
          ))}
        </ul>
        <div className="mb-4">
          <input
            type="text"
            value={newOwner?.toString()}
            onChange={(e) => setNewOwner(e.target.value as any)}
            placeholder="New owner address"
            className="border border-gray-300 rounded px-3 py-2 mb-2 w-full"
          />
          <button
            onClick={onAddOwner}
            disabled={addOwnerLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {addOwnerLoading ? "Loading..." : "Add Owner"}
          </button>
        </div>

        <div className="mb-4">
          <button
            onClick={onTestTransfer}
            disabled={testTransferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {testTransferLoading ? "Loading..." : "Test transfer with other owner"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiSig;
