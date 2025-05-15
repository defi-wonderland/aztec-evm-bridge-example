import { useCallback, useEffect, useMemo, useState } from "react"
import BigNumber from "bignumber.js"
import { createPublicClient, http } from "viem"
import { useAccount } from "wagmi"
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { AztecAddress } from "@aztec/aztec.js"

import settings from "../settings"
import { formatAssetAmount } from "../utils/amount"
import { getAztecWallet } from "../utils/aztec"
import vaultAbi from "../utils/abi/vault.json"

import type { Asset, FormattedBalances } from "../types"

const useAssets = () => {
  const { address: userAddress } = useAccount()
  const [balances, setBalances] = useState<FormattedBalances[]>([])

  const refresh = useCallback(async () => {
    try {
      const aztecWallet = await getAztecWallet()

      if (userAddress) {
        const localBalances = await Promise.all(
          settings.assets.map(async (asset: Asset) => {
            const token = await TokenContract.at(AztecAddress.fromString(asset.sourceAddress), aztecWallet)
            const sourceBalance = await token.methods.balance_of_private(aztecWallet.getAddress()).simulate()

            const publicClient = createPublicClient({
              chain: asset.targetChain,
              transport: http(),
            })

            const targetBalance = await publicClient.readContract({
              address: settings.contractAddresses[asset.targetChain.id]!.vault as `0x${string}`,
              abi: vaultAbi,
              functionName: "amounts",
              args: [asset.targetAddress, userAddress],
            })

            return [sourceBalance, targetBalance]
          }),
        )

        setBalances(
          settings.assets.map((asset: Asset, index: number) => {
            const [sourceBalance, targetBalance] = localBalances[index]
            const offchainSourceAmount = BigNumber(sourceBalance).dividedBy(10 ** asset.sourceDecimals)
            const offchainTargetAmount = BigNumber(targetBalance).dividedBy(10 ** asset.targetDecimals)

            return {
              sourceBalance: offchainSourceAmount.toFixed(),
              targetBalance: offchainTargetAmount.toFixed(),
              formattedSourceBalance: formatAssetAmount(offchainSourceAmount, "", {
                decimals: 4,
                forceDecimals: true,
              }),
              formattedSourceBalanceWithSymbol: formatAssetAmount(offchainSourceAmount, asset.symbol, {
                decimals: 6,
                forceDecimals: true,
              }),
              formattedTargetBalance: formatAssetAmount(offchainTargetAmount, "", {
                decimals: 4,
                forceDecimals: true,
              }),
              formattedTargetBalanceWithSymbol: formatAssetAmount(offchainTargetAmount, asset.symbol, {
                decimals: 6,
                forceDecimals: true,
              }),
            }
          }),
        )
      } else {
        setBalances([])
      }
    } catch (_err) {
      console.error(_err)
    }
  }, [userAddress])

  useEffect(() => {
    refresh()
  }, [refresh])

  const assets = useMemo<Asset[]>(() => {
    return settings.assets.map((_asset, _index) => ({
      ..._asset,
      ...balances[_index],
    }))
  }, [balances])

  return {
    assets,
    refresh,
  }
}

export { useAssets }
