export type OrderStatus = "initiatedPrivately" | "filled"

export interface Output {
  token: `0x${string}`
  recipient: `0x${string}`
  chainId: number
  amount: number
}

export interface FillInstruction {
  destinationSettler: `0x${string}`
  bytes: `0x${string}`
  destinationChainId: number
}

export interface ResolvedOrder {
  user: `0x${string}`
  originChainId: number
  openDeadline: number
  fillDeadline: number
  orderId: `0x${string}`
  maxSpent: Output[]
  minReceived: Output[]
  fillInstructions: FillInstruction[]
}

export interface Order {
  orderId: `0x${string}`
  status: OrderStatus
  resolvedOrder: ResolvedOrder
  fillTxHash?: `0x${string}`
  fillerData?: `0x${string}`
  forwardSettleTxHash?: `0x${string}`
}
