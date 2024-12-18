import { pimlicoClient } from "@/utils/config";
import { CREDENTIAL_PASS_KEY, TOKEN7579_ADDRESS } from "@/utils/constants";
import { p256 } from "@noble/curves/p256";
import {
  encodeValidatorNonce,
  getAccount,
  getOwnableValidator,
  getWebAuthnValidator,
  getWebauthnValidatorMockSignature,
  getWebauthnValidatorSignature,
  WEBAUTHN_VALIDATOR_ADDRESS,
} from "@rhinestone/module-sdk";
import { ToSafeSmartAccountReturnType } from "permissionless/accounts";
import { getAccountNonce } from "permissionless/actions";
import { Erc7579Actions } from "permissionless/actions/erc7579";
import React, { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import {
  Address,
  bytesToBigInt,
  Client,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  Hex,
  hexToBytes,
  http,
  HttpTransport,
  pad,
  parseAbi,
  parseAbiParameters,
  parseEther,
  zeroAddress,
} from "viem";
import {
  BundlerActions,
  createWebAuthnCredential,
  CreateWebAuthnCredentialReturnType,
  entryPoint07Address,
  getUserOperationHash,
  toWebAuthnAccount,
} from "viem/account-abstraction";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { useAccount, useWalletClient } from "wagmi";
import { parsePublicKey, parseSignature, sign } from "webauthn-p256";
import { b64ToBytes, findQuoteIndices, parseAndNormalizeSig, uint8ArrayToHexString } from "./utils/webauth";

import {
  create,
  get,
  PublicKeyCredentialWithAttestationJSON,
} from "@github/webauthn-json";
import crypto from "crypto";
function clean(str: string) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

interface WebAuthnProps {
  isSafeDeployed: boolean;
  safeAccount: ToSafeSmartAccountReturnType<"0.7">;
  smartAccount: Client<HttpTransport, typeof sepolia> &
    Erc7579Actions<ToSafeSmartAccountReturnType<"0.7">> &
    BundlerActions;
}

const WebAuthn: React.FC<WebAuthnProps> = ({
  safeAccount,
  smartAccount,
  isSafeDeployed,
}) => {
  const [passKeyData, setPassKeyData] =
    useLocalStorage<CreateWebAuthnCredentialReturnType | null>(
      CREDENTIAL_PASS_KEY,
      null
    );

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(),
  });

  const { data: walletClient } = useWalletClient();
  const { address } = useAccount();

  const [isInstalled, setIsInstalled] = useState(false);
  console.log("🚀 ~ isInstalled:", isInstalled);

  const [txId, setTxId] = useState<string | null>();
  const [error, setError] = useState<string | null>(null);
  const [signerAddress, setSignerAddress] = useState<Address>(
    address || zeroAddress
  );

  const [installLoading, setInstallLoading] = useState(false);
  const [testTransferLoading, setTestTransferLoading] = useState(false);

  const initData = async () => {
    if (!smartAccount || !isSafeDeployed) {
      return;
    }

    const isModuleInstalled = await smartAccount.isModuleInstalled({
      address: WEBAUTHN_VALIDATOR_ADDRESS,
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

      // const saltUUID = crypto.createHash("sha256").update("salt").digest("hex");
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
      if (!passKeyData) {
        throw new Error("No pass key data found");
      }
      setTestTransferLoading(true);
      const credential = passKeyData;
      const owner = toWebAuthnAccount({
        credential,
      });

      const { x: pubKeyX, y: pubKeyY } = parsePublicKey(credential.publicKey);
      console.log("🚀 ~ onTestTransfer ~ pubKeyY:", pubKeyY);
      console.log("🚀 ~ onTestTransfer ~ pubKeyX:", pubKeyX);

      const installData = getWebAuthnValidator({
        authenticatorId: credential.id,
        pubKeyX: pubKeyX as any,
        pubKeyY: pubKeyY as any,
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
        signature: getWebauthnValidatorMockSignature(),
      });

      const userOpHashToSign = getUserOperationHash({
        chainId: sepolia.id,
        entryPointAddress: entryPoint07Address,
        entryPointVersion: "0.7",
        userOperation,
      });

      console.log("🚀 ~ onTestTransfer ~ userOpHashToSign:", userOpHashToSign);

      const signData = await owner.signMessage({
        message: Buffer.from(userOpHashToSign, "hex").toString("base64"),
      });
      const { signature, webauthn } = signData;
      console.log("🚀 ~ onTestTransfer ~ signature:", signature);
      console.log("🚀 ~ onTestTransfer ~ webauthn:", webauthn);
      const { r, s } = parseSignature(signature);
      console.log("🚀 ~ onTestTransfer ~ s:", s);
      console.log("🚀 ~ onTestTransfer ~ r:", r);

      const sigOfValidator = getWebauthnValidatorSignature({
        authenticatorData: webauthn.authenticatorData,
        clientDataJSON: webauthn.clientDataJSON,
        responseTypeLocation: BigInt(webauthn.typeIndex),
        r: r,
        s: s,
        usePrecompiled: true,
      });
      console.log("🚀 ~ onTestTransfer ~ sigOfValidator:", sigOfValidator);
      const userOpHash = await smartAccount.sendUserOperation({
        account: safeAccount,
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
        nonce,
        signature: sigOfValidator,
      });

      const result = await pimlicoClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });
      setTxId(result.receipt.transactionHash);
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
      let credential = null;
      if (!passKeyData) {
        credential = await createWebAuthnCredential({
          name: "[BIC] Demo 7579",
          rp: {
            name: "BIC",
            id: "localhost",
          },
        });
        setPassKeyData(credential as any);
      } else {
        credential = passKeyData;
      }
      const { x: pubKeyX, y: pubKeyY } = parsePublicKey(credential.publicKey);
      console.log("🚀 ~ onTestTransfer ~ pubKeyX:", pubKeyX, Number(pubKeyX));
      console.log("🚀 ~ onTestTransfer ~ pubKeyY:", pubKeyY, Number(pubKeyY));

      const installData = getWebAuthnValidator({
        authenticatorId: credential.id,
        pubKeyX: pubKeyX as any,
        pubKeyY: pubKeyY as any,
      });
      const opHash = await smartAccount.installModule({
        type: installData.type,
        address: installData.module,
        context: installData.initData!,
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
        address: WEBAUTHN_VALIDATOR_ADDRESS,
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
      <h2 className="text-2xl font-bold mb-4">WebAuthn Module</h2>
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

export default WebAuthn;
