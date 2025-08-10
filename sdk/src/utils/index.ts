export * from "./beacon"
export * from "./fpc"
export * from "./gateway"
export * from "./order-data"

export const getAztecAddressFromAzguardAccount = (account: `aztec:${number}:${string}`): `0x:${string}` =>
  account.split(":").slice(-1)[0] as `0x:${string}`
