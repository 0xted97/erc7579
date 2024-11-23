import { sepolia } from "viem/chains";

const chainId = sepolia.id.toString()
export const BUNDLER_URL = `https://api.pimlico.io/v2/${chainId}/rpc?apikey=pim_HFScqhEgUgvBpH9hbrncZu`;
export const PIMLICO_API_KEY = "pim_HFScqhEgUgvBpH9hbrncZu";
export const SPONSORSHIP_POLICY_ID = "sp_wakeful_sir_ram";

export const OWNER_PK = "0x9a0a9fe880a9d3a7389b8ce86184c41cf8132ab15cadeb77ec27c0e797d44218";
export const EXECUTOR_PK = "0x9a0a9fe880a9d3a7389b8ce86184c41cf8132ab15cadeb77ec27c0e797d44218";