import { useCallback, useState } from "react"
import { useAssets } from "./use-assets"
import { useWalletClient } from "wagmi"
import BigNumber from "bignumber.js"
import { createPublicClient, encodePacked, hexToBytes, http, padHex, sha256 } from "viem"
import { Buffer } from "buffer"
import { optimismSepolia } from "viem/chains"
import { AztecAddress, Fr } from "@aztec/aztec.js"
import { TokenContract } from "@aztec/noir-contracts.js/Token"
import { toast } from "react-toastify"

import { sleep } from "../utils/sleep"
import vaultAbi from "../utils/abi/vault.json"
import settings from "../settings"
import { AztecGateway7683Contract } from "../utils/artifacts/AztecGateway7683/AztecGateway7683"
import { getAztecWallet, getPxe, parseFilledLog } from "../utils/aztec"
import {
  ORDER_DATA_TYPE,
  AZTEC_7683_CHAIN_ID,
  PRIVATE_ORDER,
  PRIVATE_SENDER,
  PRIVATE_ORDER_WITH_HOOK,
  INITIATED_PRIVATELY,
} from "../settings/constants"
import { getZkPassportProof } from "../utils/zkpassport"
import { randomUint64 } from "../utils/random"

import type { Asset } from "../types"

const useActions = () => {
  const { refresh: refreshBalances } = useAssets()
  const { data: walletClient /*refetch: refetchWalletClient*/ } = useWalletClient()
  const [depositInProgress, setDepositInProgress] = useState<string | null>(null)
  const [withdrawInProgress, setWithdrawInProgress] = useState<string | null>(null)
  const [isGeneratingProof, setIsGeneratingProof] = useState<boolean>(false)

  const deposit = useCallback(
    async ({
      setUrl,
      asset,
      amount,
    }: {
      setUrl: (url: string | null) => void
      amount: number | string
      asset: Asset
    }) => {
      try {
        if (!walletClient) throw new Error("Wallet not connected")

        let txHash

        const [proofParams] = await getZkPassportProof({
          onGeneratingProof: () => {
            setIsGeneratingProof(true)
            console.log("generating proof ...")
          },
          onProofGenerated: () => {
            console.log("proof generated")
            setIsGeneratingProof(false)
            setUrl(null)
          },
          onRequestReceived: () => {
            console.log("request received. processing it")
          },
          scope: Array.from({ length: 100 }, () => Math.floor(Math.random() * 10)).join(""), //
          onUrl: (url: string) => {
            console.log("zk passport url received")
            setUrl(url)
          },
        })

        const onChainSourceAssetAmount = BigInt(
          BigNumber(amount).multipliedBy(BigNumber(10).pow(asset.sourceDecimals)).toFixed(0),
        )
        const onChainTargetAssetAmount = BigInt(
          BigNumber(amount).multipliedBy(BigNumber(10).pow(asset.targetDecimals)).toFixed(0),
        )
        const fillDeadline = 2 ** 32 - 1

        // AZTEC -> EVM
        setDepositInProgress(asset.id)
        const gatewayAddress = AztecAddress.fromString(settings.contractAddresses[AZTEC_7683_CHAIN_ID].gateway)
        const aztecWallet = await getAztecWallet()
        const [token, aztecGateway] = await Promise.all([
          TokenContract.at(AztecAddress.fromString(asset.sourceAddress), aztecWallet),
          AztecGateway7683Contract.at(gatewayAddress, aztecWallet),
        ])

        const nonce = Fr.random()
        const witness = await aztecWallet.createAuthWit({
          caller: gatewayAddress,
          action: token.methods.transfer_in_private(
            aztecWallet.getAddress(),
            gatewayAddress,
            onChainSourceAssetAmount,
            nonce,
          ),
        })

        const innerCommitment = sha256(
          encodePacked(["address", "bytes"], [walletClient!.account.address, proofParams.proof as `0x${string}`]),
        )
        const orderData = encodePacked(
          [
            "bytes32",
            "bytes32",
            "bytes32",
            "bytes32",
            "uint256",
            "uint256",
            "uint256",
            "uint32",
            "uint32",
            "bytes32",
            "uint32",
            "uint8",
            "bytes32",
          ],
          [
            PRIVATE_SENDER,
            padHex(settings.contractAddresses[asset.targetChain.id].vault),
            asset.sourceAddress,
            padHex(asset.targetAddress),
            onChainSourceAssetAmount,
            onChainTargetAssetAmount,
            nonce.toBigInt(),
            asset.sourceChain.id,
            asset.targetChain.id,
            "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90", // TODO
            fillDeadline,
            PRIVATE_ORDER_WITH_HOOK,
            innerCommitment,
          ],
        )

        const receipt = await aztecGateway.methods
          .open_private({
            fill_deadline: fillDeadline,
            order_data: Array.from(hexToBytes(orderData)),
            order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
          })
          .with({
            authWitnesses: [witness],
          })
          .send()
          .wait()

        const orderId = sha256(orderData)
        console.log(`order ${orderId} sent: ${receipt.txHash.toString()}`)

        // Finalizing deposit
        const publicClientTarget = createPublicClient({
          chain: asset.targetChain,
          transport: http(optimismSepolia.rpcUrls.default.http[0]),
        })
        while (true) {
          const commitment = sha256(encodePacked(["address", "bytes32"], [asset.targetAddress, innerCommitment]))
          const amount = (await publicClientTarget.readContract({
            address: settings.contractAddresses[asset.targetChain.id].vault,
            functionName: "finalizableDeposits",
            args: [commitment],
            abi: vaultAbi,
          })) as bigint

          if (amount > 0n) break
          await sleep(2000)
        }

        console.log("finalizing deposit ...")
        txHash = await walletClient.writeContract({
          address: settings.contractAddresses[asset.targetChain.id].vault,
          functionName: "finalizeDeposit",
          args: [proofParams.proof, walletClient.account.address, asset.targetAddress],
          abi: vaultAbi,
        })
        console.log("finalize deposit tx:", txHash)

        toast.success("Deposit completed successfully.")
        refreshBalances()
      } catch (err) {
        console.error(err)
      } finally {
        setDepositInProgress(null)
        setIsGeneratingProof(false)
        setUrl(null)
      }
    },
    [walletClient, refreshBalances],
  )

  const withdraw = useCallback(
    async ({ asset, amount }: { amount: number | string; asset: Asset }) => {
      try {
        let txHash

        const onChainSourceAssetAmount = BigInt(
          BigNumber(amount).multipliedBy(BigNumber(10).pow(asset.sourceDecimals)).toFixed(0),
        )
        const onChainTargetAssetAmount = BigInt(
          BigNumber(amount).multipliedBy(BigNumber(10).pow(asset.targetDecimals)).toFixed(0),
        )
        const fillDeadline = 2 ** 32 - 1

        // EVM -> AZTEC
        let effectiveWalletClient = walletClient!
        if (walletClient && effectiveWalletClient.chain.id !== asset.targetChain.id) {
          await effectiveWalletClient.switchChain({ id: asset.targetChain.id })
          await sleep(2000)
        }

        setWithdrawInProgress(asset.id)

        const secret = padHex(`0x${Buffer.from("secret", "utf-8").toString("hex")}`) // NOTE: make it stronger for production
        const orderData = encodePacked(
          [
            "bytes32",
            "bytes32",
            "bytes32",
            "bytes32",
            "uint256",
            "uint256",
            "uint256",
            "uint32",
            "uint32",
            "bytes32",
            "uint32",
            "uint8",
            "bytes32",
          ],
          [
            padHex(settings.contractAddresses[asset.targetChain.id].vault),
            sha256(secret),
            padHex(asset.targetAddress),
            padHex(asset.sourceAddress),
            onChainTargetAssetAmount,
            onChainSourceAssetAmount,
            randomUint64(),
            asset.targetChain.id,
            asset.sourceChain.id,
            "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90", // TODO
            fillDeadline,
            PRIVATE_ORDER,
            padHex("0x00"),
          ],
        )

        txHash = await walletClient!.writeContract({
          address: settings.contractAddresses[asset.targetChain.id].vault,
          functionName: "withdraw",
          args: [[fillDeadline, ORDER_DATA_TYPE, orderData]],
          abi: vaultAbi,
        })

        const orderId = sha256(orderData)
        const orderIdBytes = Array.from(hexToBytes(orderId))
        console.log(`order ${orderId} sent: ${txHash}`)

        const aztecWallet = await getAztecWallet()
        const aztecGateway = await AztecGateway7683Contract.at(
          AztecAddress.fromString(settings.contractAddresses[AZTEC_7683_CHAIN_ID].gateway),
          aztecWallet,
        )

        const pxe = getPxe()
        while (true) {
          const status = await aztecGateway.methods.get_order_status(orderIdBytes).simulate()
          console.log("order status:", status)
          if (parseInt(status) === INITIATED_PRIVATELY) {
            let log
            while (true) {
              try {
                console.log(`order ${orderId} filled succesfully. claiming it ...`)

                await sleep(3000)
                // TODO: understand why if i use fromBlock and toBlock i always receive the penultimante log.
                // Basically i never receive the last one even if block numbers are up to date
                const { logs } = await pxe.getPublicLogs({
                  contractAddress: AztecAddress.fromString(settings.contractAddresses[AZTEC_7683_CHAIN_ID].gateway),
                })

                const parsedLogs = logs.map(({ log }) => parseFilledLog(log.log))
                log = parsedLogs.find((log) => log.orderId === orderId)
                if (!log) throw new Error("log not found")
                break
              } catch (err) {
                console.error(err)
                sleep(3000)
              }
            }

            await aztecGateway.methods
              .claim_private(
                Array.from(hexToBytes(secret)),
                orderIdBytes,
                Array.from(hexToBytes(log.originData)),
                Array.from(hexToBytes(log.fillerData)),
              )
              .send()
              .wait()
            break
          }
          await sleep(3000)
        }

        toast.success("Withdraw completed successfully.")
        refreshBalances()
      } catch (err) {
        console.error(err)
      } finally {
        setWithdrawInProgress(null)
      }
    },
    [walletClient, refreshBalances],
  )

  return {
    deposit,
    depositInProgress,
    isGeneratingProof,
    withdraw,
    withdrawInProgress,
  }
}

export { useActions }
