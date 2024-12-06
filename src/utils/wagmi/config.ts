import { sepolia } from 'wagmi/chains'
import { getDefaultConfig } from '@rainbow-me/rainbowkit';


export const config = getDefaultConfig({
  appName: 'Demo 7579',
  projectId: "fca0c76feca7c0affac7ba41d5328681",
  chains: [
    sepolia
  ],
  ssr: true,
});