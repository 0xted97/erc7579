import { pimlicoClient } from "@/utils/config";
import { TOKEN7579_ADDRESS } from "@/utils/constants";
import {
  encodeSmartSessionSignature,
  encodeValidationData,
  encodeValidatorNonce,
  getAccount,
  getAddOwnableValidatorOwnerAction,
  getEnableSessionDetails,
  getOwnableValidator,
  getOwnableValidatorMockSignature,
  getOwnableValidatorOwners,
  getOwnableValidatorThreshold,
  getSmartSessionsValidator,
  getSudoPolicy,
  OWNABLE_VALIDATOR_ADDRESS,
  Session,
  SMART_SESSIONS_ADDRESS,
} from "@rhinestone/module-sdk";
import { ToSafeSmartAccountReturnType } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { Erc7579Actions } from "permissionless/actions/erc7579";
import React, { useCallback, useEffect, useState } from "react";
import {
  Address,
  Client,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  Hex,
  http,
  HttpTransport,
  isAddress,
  parseAbi,
  parseAbiParameters,
  parseEther,
  toBytes,
  toHex,
  zeroAddress,
} from "viem";
import {
  BundlerActions,
  entryPoint07Address,
  getUserOperationHash,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { useAccount, useWalletClient } from "wagmi";

interface SmartSessionProps {
  isSafeDeployed: boolean;
  safeAccount: ToSafeSmartAccountReturnType<"0.7">;
  smartAccount: Client<HttpTransport, typeof sepolia> &
    Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> &
    BundlerActions;
}

const SmartSession: React.FC<SmartSessionProps> = ({
  safeAccount,
  smartAccount,
  isSafeDeployed,
}) => {
  const sessionData = getSmartSessionsValidator({});

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const { data: walletClient } = useWalletClient();

  const [isInstalled, setIsInstalled] = useState(false);

  const [txId, setTxId] = useState<string | null>();
  const [error, setError] = useState<string | null>(null);

  const [installLoading, setInstallLoading] = useState(false);
  const [addOwnerLoading, setAddOwnerLoading] = useState(false);
  const [testTransferLoading, setTestTransferLoading] = useState(false);

  const initData = async () => {
    if (!smartAccount || !isSafeDeployed) {
      return;
    }
    const isModuleInstalled = await smartAccount.isModuleInstalled({
      address: sessionData.module,
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

  const onTestTransfer = async () => {
    try {
      if (!smartAccount || !isSafeDeployed || !isInstalled) {
        return;
      }
      setTestTransferLoading(true);

      fetchData();
      setTestTransferLoading(false);
    } catch (error: any) {
      setError(error.message);
      setTestTransferLoading(false);
    }
  };

  const onEnableSmartSession = async () => {
    try {
      if (!smartAccount || !isSafeDeployed || !isInstalled) {
        return;
      }
      setTestTransferLoading(true);
      const sessionAddress = "0x1988f07FAA04eAa986584cd1e48b694Fa1b8C323";

      const session: Session = {
        sessionValidator: OWNABLE_VALIDATOR_ADDRESS,
        sessionValidatorInitData: encodeValidationData({
          threshold: 1,
          owners: [sessionAddress],
        }),
        salt: toHex(toBytes("0", { size: 32 })),
        userOpPolicies: [],
        erc7739Policies: {
          allowedERC7739Content: [],
          erc1271Policies: [],
        },
        actions: [
          {
            actionTarget:
              "0xa564cB165815937967a7d018B7F34B907B52fcFd" as Address, // an address as the target of the session execution
            actionTargetSelector: "0x00000000" as Hex, // function selector to be used in the execution, in this case no function selector is used
            actionPolicies: [getSudoPolicy()],
          },
        ],
        chainId: BigInt(sepolia.id),
      };

      const account = getAccount({
        address: safeAccount.address,
        type: "safe",
      });

      const sessionDetails = await getEnableSessionDetails({
        sessions: [session],
        account,
        clients: [publicClient],
      });
      console.log("🚀 ~ onEnableSmartSession ~ sessionDetails:", sessionDetails.enableSessionData.enableSession.permissionEnableSig)

      const signatureOfOwner =  await walletClient!.signMessage({
        account: "0x4429B1e0BE0Af0dFFB3CAb40285CBBb631EE5656",
        message: { raw: sessionDetails.permissionEnableHash },
      });
      console.log("🚀 ~ onEnableSmartSession ~ signatureOfOwner:", signatureOfOwner)
      sessionDetails.enableSessionData.enableSession.permissionEnableSig = signatureOfOwner
       

      console.log("🚀 ~ onEnableSmartSession ~ sessionDetails:", sessionDetails.enableSessionData.enableSession.permissionEnableSig)


      const nonce = await getAccountNonce(publicClient, {
        address: safeAccount.address,
        entryPointAddress: entryPoint07Address,
        key: encodeValidatorNonce({
          account,
          validator: sessionData,
        }),
      });
      console.log("🚀 ~ onEnableSmartSession ~ nonce:", nonce);

      sessionDetails.signature = getOwnableValidatorMockSignature({
        threshold: 1,
      });

      const userOperation = await smartAccount.prepareUserOperation({
        account: safeAccount,
        calls: [
          {
            to: session.actions[0].actionTarget,
            value: BigInt(0),
            data: session.actions[0].actionTargetSelector,
          },
        ],
        nonce,
        signature: encodeSmartSessionSignature(sessionDetails),
      });

      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });
      console.log(
        "🚀 ~ onEnableSmartSession ~ userOpHashToSign:",
        userOpHashToSign
      );

      sessionDetails.signature = await walletClient!.signMessage({
        account: sessionAddress,
        message: { raw: userOpHashToSign },
      });
      fetchData();
      setTestTransferLoading(false);
    } catch (error: any) {
      setError(error.message);
      setTestTransferLoading(false);
    }
  };

  const onInstallModule = useCallback(async () => {
    try {
      setInstallLoading(true);

      const opHash = await smartAccount.installModule({
        address: sessionData.address,
        type: sessionData.type,
        context: sessionData.initData,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      setTxId(result.receipt.transactionHash);
      setInstallLoading(false);
      initData();
    } catch (error: any) {
      console.error("Error installing module", error);
      setInstallLoading(false);
      setError(error.message);
    }
  }, [smartAccount, isSafeDeployed, isInstalled, safeAccount]);

  const onUnInstallModule = useCallback(async () => {
    try {
      setInstallLoading(true);
      const opHash = await smartAccount.uninstallModule({
        type: "validator",
        address: SMART_SESSIONS_ADDRESS,
        context: encodeAbiParameters(
          parseAbiParameters("address prevEntry, bytes memory deInitData"),
          ["0x0000000000000000000000000000000000000001", "0x"]
        ),
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });
      setTxId(result.receipt.transactionHash);
      setInstallLoading(false);
      initData();
    } catch (error: any) {
      console.error("Error installing module", error);
      setInstallLoading(false);
      setError(error.message);
    }
  }, [smartAccount, isSafeDeployed, isInstalled, safeAccount]);

  return (
    <div className="p-6 bg-gray-100 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">SmartSession Module</h2>
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
      {error && (
        <div className="bg-red-100 p-4 rounded-lg mb-4 flex justify-between items-center">
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-700 hover:text-red-900"
          >
            &#x2716;
          </button>
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
        {isInstalled && (
          <div>
            <button
              onClick={onUnInstallModule}
              disabled={installLoading}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
            >
              {installLoading ? "Loading..." : "UnInstall module"}
            </button>
          </div>
        )}
      </div>
      <div className="mb-6">
        <div className="mb-4">
          <button
            onClick={onEnableSmartSession}
            disabled={testTransferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Enable Session
          </button>
        </div>
        <div className="mb-4">
          <button
            onClick={onTestTransfer}
            disabled={testTransferLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {testTransferLoading
              ? "Loading..."
              : "Test transfer with other owner"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartSession;
