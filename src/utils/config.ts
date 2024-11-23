'use client'

import { createPublicClient, createWalletClient, custom, encodePacked, Hex, http } from 'viem'

declare global {
    interface Window {
        ethereum?: any;
    }
}
import { createSmartAccountClient } from 'permissionless'
import { toSafeSmartAccount } from 'permissionless/accounts'
import { erc7579Actions } from 'permissionless/actions/erc7579'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import {
    createPaymasterClient,
    entryPoint06Address,
    entryPoint07Address,
    getUserOperationHash,
} from 'viem/account-abstraction'

import { sepolia } from 'viem/chains'
import { BUNDLER_URL, OWNER_PK } from './constants'




export const pimlicoClient = createPimlicoClient({
    transport: http(BUNDLER_URL),
    entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
    },
})
const owner = privateKeyToAccount(OWNER_PK);

export const publicClient = createPublicClient({
    chain: sepolia,
    transport: http('https://rpc.ankr.com/eth_sepolia'),
})

export const walletClient = createWalletClient({
    account: owner,
    chain: sepolia,
    transport: http()
})

const safeAccount = await toSafeSmartAccount<
'0.7',
'0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE'
>({
    client: publicClient,
    owners: [owner!],
    version: '1.4.1',

    safe4337ModuleAddress: '0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2',
    erc7579LaunchpadAddress: '0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE',
   
})

const smartAccountClient = createSmartAccountClient({
    account: safeAccount,
    chain: sepolia,
    bundlerTransport: http(BUNDLER_URL),
    paymaster: pimlicoClient,
    userOperation: {
        estimateFeesPerGas: async () => {
            const result = await pimlicoClient.getUserOperationGasPrice()
            return result.fast;
        }
    },

}).extend(erc7579Actions())

export const guardian1 = privateKeyToAccount(
    '0xc171c45f3d35fad832c53cade38e8d21b8d5cc93d1887e867fac626c1c0d6be7',
) // the key coresponding to the first guardian

export const guardian2 = privateKeyToAccount(
    '0x1a4c05be22dd9294615087ba1dba4266ae68cdc320d9164dbf3650ec0db60f67',
) // the key coresponding to the second guardian