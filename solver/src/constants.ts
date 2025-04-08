import { EthAddress } from "@aztec/aztec.js"

export const AZTEC_7683_CHAIN_ID = 999999n

export const ORDER_DATA_TYPE = "0xce57c37dfc5b92296648c64d29544cc620ec6dee71a883e75186bca75bca436c"
export const SETTLE_ORDER_TYPE = "0x191ea776bd6e0cd56a6d44ba4aea2fec468b4a0b4c1d880d4025929eeb615d0d"
export const PUBLIC_ORDER_DATA = "0xefa1f375d76194fa51a3556a97e641e61685f914d446979da50a551a4333ffd7" // sha256("public")
export const PRIVATE_ORDER_DATA = "0x715dc8493c36579a5b116995100f635e3572fdf8703e708ef1a08d943b36774e" // sha256("private")

export const ORDER_STATUS_INITIATED_PRIVATELY = "initiatedPrivately"
export const ORDER_STATUS_FILLED = "filled"
export const ORDER_STATUS_SETTLE_FORWARDED = "settleForwarded"
export const ORDER_STATUS_SETTLED = "settled"

export const ORDER_FILLED = 2n

export const PORTAL_ADDRESS = EthAddress.ZERO // TODO
export const FORWARDER_CHAIN_ID = 31337
export const AZTEC_VERSION = 1

export const FORWARDER_SETTLE_ORDER_SLOTS = 0n
