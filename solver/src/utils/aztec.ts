import { getDeployedTestAccountsWallets } from "@aztec/accounts/testing"
import { createAztecNodeClient, createPXEClient, AztecAddress, waitForPXE } from "@aztec/aztec.js"

import type { AztecNode, ContractInstanceWithAddress, Fr, PXE, Wallet } from "@aztec/aztec.js"
import type { Order, ResolvedOrder } from "../types"

export const getAztecWallet = async (): Promise<Wallet> => {
  const pxe = await getPxe()
  const wallet = (await getDeployedTestAccountsWallets(pxe))[0]
  return wallet as Wallet
}

type RegisterContractOptions = {
  wallet: Wallet
  artifact: any
}

export const getPxe = async (): Promise<PXE> => {
  const pxe = createPXEClient(process.env.PXE_URL || "http://localhost:8080")
  await waitForPXE(pxe)
  return pxe
}

export const getAztecNode = async (): Promise<AztecNode> => {
  return await createAztecNodeClient(process.env.PXE_URL || "http://localhost:8080")
}

export const registerContract = async (
  address: AztecAddress,
  { wallet, artifact }: RegisterContractOptions,
): Promise<void> => {
  const node = await getAztecNode()
  const contractInstance = await node.getContract(address)
  await wallet.registerContract({
    instance: contractInstance as ContractInstanceWithAddress,
    artifact,
  })
}

export const parseOpenLog = (log1: Fr[], log2: Fr[]) => {
  let orderId1 = log1[0]!.toString()
  const residualBytes1 = log1[12]!.toString()
  const resolvedOrder1 =
    "0x" +
    log1[1]!.toString().slice(4) +
    residualBytes1.slice(6, 8) +
    log1[2]!.toString().slice(4) +
    residualBytes1.slice(8, 10) +
    log1[3]!.toString().slice(4) +
    residualBytes1.slice(10, 12) +
    log1[4]!.toString().slice(4) +
    residualBytes1.slice(12, 14) +
    log1[5]!.toString().slice(4) +
    residualBytes1.slice(14, 16) +
    log1[6]!.toString().slice(4) +
    residualBytes1.slice(16, 18) +
    log1[7]!.toString().slice(4) +
    residualBytes1.slice(18, 20) +
    log1[8]!.toString().slice(4) +
    residualBytes1.slice(20, 22) +
    log1[9]!.toString().slice(4) +
    residualBytes1.slice(22, 24) +
    log1[10]!.toString().slice(4) +
    residualBytes1.slice(24, 26) +
    log1[11]!.toString().slice(4, 44)

  let orderId2 = log2[0]!.toString()
  const residualBytes2 = log2[10]!.toString()
  const resolvedOrder2 =
    log2[1]!.toString().slice(4) +
    residualBytes2.slice(6, 8) +
    log2[2]!.toString().slice(4) +
    residualBytes2.slice(8, 10) +
    log2[3]!.toString().slice(4) +
    residualBytes2.slice(10, 12) +
    log2[4]!.toString().slice(4) +
    residualBytes2.slice(12, 14) +
    log2[5]!.toString().slice(4) +
    residualBytes2.slice(14, 16) +
    log2[6]!.toString().slice(4) +
    residualBytes2.slice(16, 18) +
    log2[7]!.toString().slice(4) +
    residualBytes2.slice(18, 20) +
    log2[8]!.toString().slice(4) +
    residualBytes2.slice(20, 22) +
    log2[9]!.toString().slice(4, 38)

  orderId1 = "0x" + orderId1.slice(4) + residualBytes1.slice(4, 6)
  orderId2 = "0x" + orderId2.slice(4) + residualBytes2.slice(4, 6)

  if (orderId1 !== orderId2) throw new Error("logs don't belong to the same order")

  return {
    orderId: orderId1,
    resolvedOrder: resolvedOrder1 + resolvedOrder2,
  }
}

export const parseResolvedCrossChainOrder = (resolvedOrder: string): ResolvedOrder => {
  return {
    fillInstructions: [
      {
        originData: `0x${resolvedOrder.slice(resolvedOrder.length - 602)}`,
        destinationSettler: `0x${resolvedOrder.slice(resolvedOrder.length - 666, resolvedOrder.length - 602)}`,
        destinationChainId: parseInt(resolvedOrder.slice(resolvedOrder.length - 674, resolvedOrder.length - 666), 16),
      },
    ],
    maxSpent: [
      {
        chainId: parseInt(resolvedOrder.slice(resolvedOrder.length - 682, resolvedOrder.length - 674), 16),
        recipient: `0x${resolvedOrder.slice(resolvedOrder.length - 746, resolvedOrder.length - 682)}`,
        amount: BigInt("0x" + resolvedOrder.slice(resolvedOrder.length - 810, resolvedOrder.length - 746)),
        token: `0x${resolvedOrder.slice(resolvedOrder.length - 874, resolvedOrder.length - 810)}`,
      },
    ],
    minReceived: [
      {
        chainId: parseInt(resolvedOrder.slice(resolvedOrder.length - 882, resolvedOrder.length - 874), 16),
        recipient: `0x${resolvedOrder.slice(resolvedOrder.length - 946, resolvedOrder.length - 882)}`,
        amount: BigInt("0x" + resolvedOrder.slice(resolvedOrder.length - 1010, resolvedOrder.length - 946)),
        token: `0x${resolvedOrder.slice(resolvedOrder.length - 1074, resolvedOrder.length - 1010)}`,
      },
    ],
    orderId: `0x${resolvedOrder.slice(resolvedOrder.length - 1138, resolvedOrder.length - 1074)}`,
    fillDeadline: parseInt(resolvedOrder.slice(resolvedOrder.length - 1146, resolvedOrder.length - 1138), 16),
    openDeadline: parseInt(resolvedOrder.slice(resolvedOrder.length - 1154, resolvedOrder.length - 1146), 16),
    originChainId: parseInt(resolvedOrder.slice(resolvedOrder.length - 1162, resolvedOrder.length - 1154), 16),
    user: `0x${resolvedOrder.slice(resolvedOrder.length - 1226, resolvedOrder.length - 1162)}`,
  }
}
