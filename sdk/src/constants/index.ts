import { baseSepolia } from "viem/chains"
import { Hex, padHex } from "viem"

export const ORDER_DATA_TYPE = "0xf00c3bf60c73eb97097f1c9835537da014e0b755fe94b25d7ac8401df66716a0"
export const PUBLIC_ORDER = 0
export const PRIVATE_ORDER = 1
export const PUBLIC_ORDER_WITH_HOOK = 2
export const PRIVATE_ORDER_WITH_HOOK = 3
export const PRIVATE_SENDER = padHex("0x")
export const FILLED_PRIVATELY = 3
export const FILLED = 2

export const aztecSepolia = {
  id: 999999,
  name: "Aztec Sepolia",
}

export const gatewayAddresses: Record<number, Hex> = {
  [aztecSepolia.id]: "0x1c48c2d7dca7291d2ab5935a684c160628be3a4a5a4ca670bcb4716233dc68cf",
  [baseSepolia.id]: "0xe91C15EF8cE69e7bd90a68E4aC576A242C84eAdF",
}
