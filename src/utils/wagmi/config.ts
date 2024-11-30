import { http, createConfig } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import { metaMask, } from 'wagmi/connectors'
import { getDefaultConfig } from '@rainbow-me/rainbowkit';


export const config = getDefaultConfig({
  appName: 'Demo 7579',
  projectId: "PROJECT_ID",
  chains: [
    sepolia
  ],
  ssr: true,
});