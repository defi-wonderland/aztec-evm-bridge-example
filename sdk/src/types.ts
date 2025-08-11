import { Chain, Hex, Log } from "viem"
import { PXE, AztecNode } from "@aztec/aztec.js"
import { AzguardClient } from "@azguardwallet/client"

export type FilledLog = {
  orderId: `0x${string}`
  fillerData: `0x${string}`
  originData: `0x${string}`
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

export interface Output {
  token: `0x${string}`
  recipient: `0x${string}`
  chainId: number
  amount: bigint
}

export interface FillInstruction {
  destinationSettler: `0x${string}`
  originData: `0x${string}`
  destinationChainId: number
}

export type SwapMode = "private" | "public" | "privateWithHook" | "publicWithHook"

export interface Order {
  chainIn: Chain | { id: number; name: string }
  chainOut: Chain | { id: number; name: string }
  amountIn: bigint
  amountOut: bigint
  tokenIn: Hex
  tokenOut: Hex
  recipient: Hex
  mode: SwapMode
  data: Hex
  fillDeadline?: number
}

export interface RefundOrderDetails {
  orderId: Hex
  chainIn: Chain | { id: number; name: string }
  chainOut: Chain | { id: number; name: string }
  chainForwarder?: Chain
}

export type SettleOrderDetails = RefundOrderDetails

export type ForwardDetails = RefundOrderDetails & {
  fillerData?: Hex
  type: "forwardSettleToL2" | "forwardRefundToL2"
}

export interface OrderResult {
  orderOpenedTxHash: Hex
  // NOTE: on aztec we cannot get the filled transaction hash where a given log has been emitted
  orderFilledTxHash?: Hex
  orderClaimedTxHash?: Hex
  resolvedOrder: ResolvedOrder
}

export interface OrderCallbacks {
  onSecret?: (params: { orderId: Hex; secret: Hex }) => void
  onOrderOpened?: (params: { orderId: Hex; resolvedOrder: ResolvedOrder; transactionHash: Hex }) => void
  onOrderFilled?: (params: { orderId: Hex; transactionHash?: Hex }) => void
  onOrderClaimed?: (params: { orderId: Hex; transactionHash: Hex }) => void
}

export interface BridgeConfigs {
  azguardClient?: AzguardClient
  aztecNode: AztecNode
  aztecPxe?: PXE
  aztecKeySalt?: Hex
  aztecSecretKey?: Hex
  beaconApiUrl: string
  evmPrivateKey?: Hex
  evmProvider?: any
}
