import type { Chain } from "viem"

export type Asset = {
  id: string
  name: string
  symbol: string
  icon: string
  targetAddress: `0x${string}`
  targetChain: Chain
  targetDecimals: number
  sourceAddress: `0x${string}`
  sourceChain: Chain
  sourceDecimals: number
  sourceBalance?: string
  targetBalance?: string
  formattedSourceBalance?: string
  formattedSourceBalanceWithSymbol?: string
  formattedTargetBalance?: string
  formattedTargetBalanceWithSymbol?: string
}

export type Assets = Asset[]

export type FormattedBalances = {
  sourceBalance: string
  targetBalance: string
  formattedSourceBalance: string
  formattedSourceBalanceWithSymbol: string
  formattedTargetBalance: string
  formattedTargetBalanceWithSymbol: string
}
