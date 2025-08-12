import { hexToBytes } from "viem"

export * from "./beacon"
export * from "./fpc"
export * from "./gateway"
export * from "./order-data-encoder"

export const getAztecAddressFromAzguardAccount = (account: `aztec:${number}:${string}`): `0x:${string}` =>
  account.split(":").slice(-1)[0] as `0x:${string}`

export const hexToUintArray = (str: `0x${string}`) => Array.from(hexToBytes(str))
