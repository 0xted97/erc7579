import { http } from "viem";
import { sepolia } from "viem/chains";
import {
    createZeroDevPaymasterClient,
  } from "@zerodev/sdk";

export const paymasterClient = createZeroDevPaymasterClient({
    chain: sepolia,
    transport: http("https://rpc.zerodev.app/api/v2/paymaster/b398a059-02c5-4517-9e27-dd0d996c75f0"),
  });
export const ZERO_DEV_BUNDLER_URL = "https://rpc.zerodev.app/api/v2/bundler/b398a059-02c5-4517-9e27-dd0d996c75f0";
export const ZERO_DEV_PASSKEY_URL = "https://passkeys.zerodev.app/api/v3/b398a059-02c5-4517-9e27-dd0d996c75f0";