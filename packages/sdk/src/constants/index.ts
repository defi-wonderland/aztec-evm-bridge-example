import { baseSepolia, sepolia } from "viem/chains"
import { Hex, padHex } from "viem"

import type { InternalChain } from "../types"

export const ORDER_DATA_TYPE = "0xf00c3bf60c73eb97097f1c9835537da014e0b755fe94b25d7ac8401df66716a0"
export const REFUND_ORDER_TYPE = "0x66ad36d8ca106da96563556152aba4b916ec696ecdd08a3e5ed368f4e473a538"
export const SETTLE_ORDER_TYPE = "0x191ea776bd6e0cd56a6d44ba4aea2fec468b4a0b4c1d880d4025929eeb615d0d"
export const PUBLIC_ORDER = 0
export const PRIVATE_ORDER = 1
export const PUBLIC_ORDER_WITH_HOOK = 2
export const PRIVATE_ORDER_WITH_HOOK = 3
export const PRIVATE_SENDER = padHex("0x")
export const OPENED = 1
export const FILLED = 2
export const FILLED_PRIVATELY = 3
export const AZTEC_VERSION = 3924331020
export const FORWARDER_SETTLE_ORDER_SLOT = 2n
export const FORWARDER_REFUNDED_ORDERS_SLOT = 3n

export const aztecSepolia: InternalChain = {
  id: 999999,
  name: "Aztec Sepolia",
  rpcUrls: {
    "aztec-alpha": {
      http: ["https://aztec-alpha-testnet-fullnode.zkv.xyz"],
    },
    default: {
      http: ["https://aztec-alpha-testnet-fullnode.zkv.xyz"],
    },
  },
}

export const gatewayAddresses: Record<number, Hex> = {
  [aztecSepolia.id]: "0x1b4f272b622a493184f6fbb83fc7631f1ce9bad68d4d4c150dc55eed5f100d73",
  [baseSepolia.id]: "0x0Bf4eD5a115e6Ad789A88c21e9B75821Cc7B2e6f",
}

export const aztecRollupContractL1Addresses: Record<number, Hex> = {
  [sepolia.id]: "0x216f071653a82ced3ef9d29f3f0c0ed7829c8f81",
}

export const forwarderAddresses: Record<number, Hex> = {
  [sepolia.id]: "0xfbbb6dDb3534A2A8eb7c0eC1ad3abBbc9f694ECd",
}
