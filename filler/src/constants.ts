import { EthAddress } from "@aztec/aztec.js"

export const AZTEC_7683_CHAIN_ID = 999999n

export const ORDER_DATA_TYPE = "0xce57c37dfc5b92296648c64d29544cc620ec6dee71a883e75186bca75bca436c"
export const SETTLE_ORDER_TYPE = "0x191ea776bd6e0cd56a6d44ba4aea2fec468b4a0b4c1d880d4025929eeb615d0d"
export const PUBLIC_ORDER_HEX = "0x00"
export const PRIVATE_ORDER_HEX = "0x01"

export const ORDER_STATUS_INITIATED_PRIVATELY = "initiatedPrivately"
export const ORDER_STATUS_FILLED = "filled"
export const ORDER_STATUS_SETTLE_FORWARDED = "settleForwarded"
export const ORDER_STATUS_SETTLED = "settled"

export const ORDER_FILLED = 2n

export const PORTAL_ADDRESS = EthAddress.ZERO // TODO
export const FORWARDER_CHAIN_ID = 31337
export const AZTEC_VERSION = 1369311804 // TODO read it from the RollupContract

export const FORWARDER_SETTLE_ORDER_SLOTS = 0n
