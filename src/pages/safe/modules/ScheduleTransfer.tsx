"use client";

import { pimlicoClient } from "@/utils/config";
import {
  RHINESTONE_AUTOMATION_KEY,
  TOKEN7579_ADDRESS,
} from "@/utils/constants";
import { createAutomationClient } from "@rhinestone/automations-sdk";
import {
  encode1271Hash,
  encode1271Signature,
  getAccount,
  getExecuteScheduledTransferAction,
  getScheduledTransferData,
  getScheduledTransfersExecutor,
  OWNABLE_VALIDATOR_ADDRESS,
  SCHEDULED_TRANSFERS_EXECUTOR_ADDRESS,
} from "@rhinestone/module-sdk";
import { ToSafeSmartAccountReturnType } from "permissionless/accounts";
import { Erc7579Actions } from "permissionless/actions/erc7579";
import React, { useCallback, useEffect, useState } from "react";

import {
  Address,
  Client,
  createPublicClient,
  encodeAbiParameters,
  Hex,
  http,
  HttpTransport,
  parseAbiParameters,
} from "viem";
import { BundlerActions } from "viem/account-abstraction";
import { sepolia } from "viem/chains";
import { useAccount, useWalletClient } from "wagmi";

interface ScheduleTransferProps {
  isSafeDeployed: boolean;
  safeAccount: ToSafeSmartAccountReturnType<"0.7">;
  smartAccount: Client<HttpTransport, typeof sepolia> &
    Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> &
    BundlerActions;
}

const ScheduleTransfer: React.FC<ScheduleTransferProps> = ({
  safeAccount,
  smartAccount,
  isSafeDeployed,
}) => {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [isInstalled, setIsInstalled] = useState(false);

  const [txId, setTxId] = useState<string | null>();
  const [error, setError] = useState<string | null>(null);
  const [automationResponse] = useState<{ id: string; hash: Hex }>({
    "id": "6fcfe543-10ca-41b1-bfef-8bc6b7b08993",
    "hash": "0xaf47607e9353c74f86f47d510f4238ffc18ccdacb96ef0c335f09cc2608c4c73"
  });

  const startDate = Math.floor(Date.now() / 1000); // current Unix time in seconds
  const executeInterval = 60; // in seconds
  const numberOfExecutions = 10;
  const scheduledTransferData = {
    token: {
      token_address: TOKEN7579_ADDRESS as Address, // Mock USDC
      decimals: 18,
    },
    amount: 0.01,
    recipient: "0x1988f07FAA04eAa986584cd1e48b694Fa1b8C323" as Address,
  };
  
  const triggerData = {
    cronExpression: "*/60 * * * * *",
    startDate: startDate,
  };

  const [installLoading, setInstallLoading] = useState(false);
  const [createAutoLoading, setCreateAutoLoading] = useState(false);
  const [activationAutoLoading, setActivationAutoLoading] = useState(false);



  const initData = async () => {
    if (!smartAccount || !isSafeDeployed) {
      return;
    }

    const isModuleInstalled = await smartAccount.isModuleInstalled({
      address: SCHEDULED_TRANSFERS_EXECUTOR_ADDRESS,
      type: "executor",
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

  const onCreateAutomation = useCallback(async () => {
    setCreateAutoLoading(true);
    const automationClient = createAutomationClient({
      account: safeAccount.address,
      accountType: "SAFE",
      apiKey: RHINESTONE_AUTOMATION_KEY,
      accountInitCode: "0x",
      network: sepolia.id,
      validator: OWNABLE_VALIDATOR_ADDRESS,
    });

    const executeScheduledTransferAction = getExecuteScheduledTransferAction({
      jobId: 0, // since this is our first automation on the module
    });



    const actions = [
      {
        type: "static" as const,
        target: executeScheduledTransferAction.target,
        value: Number(executeScheduledTransferAction.value),
        callData: executeScheduledTransferAction.callData,
      },
    ];

    const automation = await automationClient.createAutomation({
      type: "time-based",
      data: {
        trigger: {
          triggerData: {
            cronExpression: triggerData.cronExpression,
            startDate: triggerData.startDate,
          },
        },
        actions,
        maxNumberOfExecutions: numberOfExecutions,
      },
    });
    setCreateAutoLoading(false);
  }, [safeAccount, smartAccount]);

  const onActiveAutomation = useCallback(async () => {
    try {
      if (!safeAccount || !walletClient) {
        return;
      }
      setActivationAutoLoading(true);
      const account = getAccount({
        address: safeAccount.address,
        type: "safe",
      });

      const formattedHash = encode1271Hash({
        account,
        validator: OWNABLE_VALIDATOR_ADDRESS,
        chainId: sepolia.id,
        hash: automationResponse.hash,
      });

      const signature = await walletClient!.signMessage({
        message: { raw: formattedHash },
      });

      const formattedSignature = encode1271Signature({
        account,
        validator: OWNABLE_VALIDATOR_ADDRESS,
        signature,
      });

      const automationClient = createAutomationClient({
        account: safeAccount.address,
        accountType: "SAFE",
        apiKey: RHINESTONE_AUTOMATION_KEY,
        accountInitCode: "0x",
        network: sepolia.id,
        validator: OWNABLE_VALIDATOR_ADDRESS,
      });

      const res = await automationClient.signAutomation({
        automationId: automationResponse.id,
        signature: formattedSignature,
      });
      console.log("🚀 ~ onActiveAutomation ~ res:", res);
    } catch (error: any) {
      console.error("Error activating automation", error);
      setActivationAutoLoading(false);
      setError(error.message);
    }
  }, [safeAccount, smartAccount]);

  const onCheckLogAutomation = useCallback(async () => {
    try {
      if (!safeAccount || !walletClient) {
        return;
      }
      const automationClient = createAutomationClient({
        account: safeAccount.address,
        accountType: "SAFE",
        apiKey: RHINESTONE_AUTOMATION_KEY,
        accountInitCode: "0x",
        network: sepolia.id,
        validator: OWNABLE_VALIDATOR_ADDRESS,
      });
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const automationLogs = await automationClient.getAutomationLogs(
        automationResponse.id
      );
      console.log(
        "🚀 ~ onCheckLogAutomation ~ automationLogs:",
        automationLogs
      );
    } catch (error: any) {
      console.error("Error activating automation", error);
      setActivationAutoLoading(false);
      setError(error.message);
    }
  }, [safeAccount, smartAccount]);

  const onInstallModule = useCallback(async () => {
    try {
      setInstallLoading(true);

      const scheduledTransfer = {
        startDate: startDate,
        repeatEvery: executeInterval,
        numberOfRepeats: numberOfExecutions,
        token: scheduledTransferData.token,
        amount: scheduledTransferData.amount,
        recipient: scheduledTransferData.recipient as Address,
      };

      const executionData = getScheduledTransferData({
        scheduledTransfer,
      });
      console.log("🚀 ~ onInstallModule ~ executionData", executionData);

      const scheduledTransfers = getScheduledTransfersExecutor({
        executeInterval,
        numberOfExecutions,
        startDate,
        executionData,
      });
      console.log("🚀 ~ onInstallModule ~ scheduledTransfers", scheduledTransfers);


      const opHash = await smartAccount.installModule({
        address: scheduledTransfers.address,
        type: scheduledTransfers.type,
        context: scheduledTransfers.initData,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: opHash,
      });

      setTxId(result.receipt.transactionHash);
      setInstallLoading(false);
      fetchData();
    } catch (error: any) {
      console.error("Error installing module", error);
      setInstallLoading(false);
      setError(error.message);
    }
  }, [smartAccount, isSafeDeployed, isInstalled, safeAccount]);

  const onUnInstallModule = useCallback(async () => {
    try {
      setInstallLoading(true);

      const scheduledTransfer = {
        startDate: startDate,
        repeatEvery: executeInterval,
        numberOfRepeats: numberOfExecutions,
        token: scheduledTransferData.token,
        amount: scheduledTransferData.amount,
        recipient: scheduledTransferData.recipient as Address,
      };

      const executionData = getScheduledTransferData({
        scheduledTransfer,
      });

      const scheduledTransfers = getScheduledTransfersExecutor({
        executeInterval,
        numberOfExecutions,
        startDate,
        executionData,
      });

      const opHash = await smartAccount.uninstallModule({
        address: scheduledTransfers.address,
        type: "executor",
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
      fetchData();
    } catch (error: any) {
      console.error("Error installing module", error);
      setInstallLoading(false);
      setError(error.message);
    }
  }, [smartAccount, isSafeDeployed, isInstalled, safeAccount]);

  return (
    <div className="p-6 bg-gray-100 rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">Schedule Transfer Module</h2>
      <div>
        <p className="text-gray-700">
          <strong>Token Address:</strong> {scheduledTransferData.token.token_address}
        </p>
        <p className="text-gray-700">
          <strong>Amount:</strong> {scheduledTransferData.amount}
        </p>
        <p className="text-gray-700">
          <strong>Recipient:</strong> {scheduledTransferData.recipient}
        </p>
        <p className="text-gray-700">
          <strong>Schedule:</strong> {triggerData.cronExpression}
        </p>
      </div>
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
              {installLoading ? "Loading..." : "Install module"}
            </button>
          </div>
        )}
                {isInstalled && (
          <div>
            <p className="text-red-500 mb-2">Module not installed</p>
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
        <h3 className="text-xl font-semibold mb-2">Owners</h3>
        <div className="mb-4">
          <button
            onClick={onCreateAutomation}
            disabled={createAutoLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            {createAutoLoading ? "Loading..." : "Create automation"}
          </button>

          <button
            onClick={onActiveAutomation}
            disabled={createAutoLoading}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-4"
          >
            {activationAutoLoading ? "Loading..." : "Active automation"}
          </button>

          <button
            onClick={onCheckLogAutomation}
            disabled={false}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 ml-4"
          >
            {"Check Log"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleTransfer;
