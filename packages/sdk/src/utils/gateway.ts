import { decodeAbiParameters, Hex, Log, TransactionReceipt } from "viem"
import { Fr } from "@aztec/aztec.js"

import l2Gateway7683Abi from "./abi/l2Gateway7683"

import type { ExtendedPublicLog, PublicLog } from "@aztec/stdlib/logs"
import type { AbiParameter } from "viem"
import type { FilledLog, ResolvedOrder } from "../types"

export type LogWithTopics = Log & {
  topics: string[]
}

export const parseResolvedOrderFromOpen1AndOpen2Logs = (fields1: Fr[], fields2: Fr[]): ResolvedOrder => {
  let orderId1 = fields1[0]!.toString()
  const residualBytes1 = fields1[12]!.toString()
  const resolvedOrder1 =
    "0x" +
    fields1[1]!.toString().slice(4) +
    residualBytes1.slice(6, 8) +
    fields1[2]!.toString().slice(4) +
    residualBytes1.slice(8, 10) +
    fields1[3]!.toString().slice(4) +
    residualBytes1.slice(10, 12) +
    fields1[4]!.toString().slice(4) +
    residualBytes1.slice(12, 14) +
    fields1[5]!.toString().slice(4) +
    residualBytes1.slice(14, 16) +
    fields1[6]!.toString().slice(4) +
    residualBytes1.slice(16, 18) +
    fields1[7]!.toString().slice(4) +
    residualBytes1.slice(18, 20) +
    fields1[8]!.toString().slice(4) +
    residualBytes1.slice(20, 22) +
    fields1[9]!.toString().slice(4) +
    residualBytes1.slice(22, 24) +
    fields1[10]!.toString().slice(4) +
    residualBytes1.slice(24, 26) +
    fields1[11]!.toString().slice(4, 44)

  let orderId2 = fields2[0]!.toString()
  const residualBytes2 = fields2[10]!.toString()
  const resolvedOrder2 =
    fields2[1]!.toString().slice(4) +
    residualBytes2.slice(6, 8) +
    fields2[2]!.toString().slice(4) +
    residualBytes2.slice(8, 10) +
    fields2[3]!.toString().slice(4) +
    residualBytes2.slice(10, 12) +
    fields2[4]!.toString().slice(4) +
    residualBytes2.slice(12, 14) +
    fields2[5]!.toString().slice(4) +
    residualBytes2.slice(14, 16) +
    fields2[6]!.toString().slice(4) +
    residualBytes2.slice(16, 18) +
    fields2[7]!.toString().slice(4) +
    residualBytes2.slice(18, 20) +
    fields2[8]!.toString().slice(4) +
    residualBytes2.slice(20, 22) +
    fields2[9]!.toString().slice(4, 38)

  orderId1 = `0x${orderId1.slice(4) + residualBytes1.slice(4, 6)}`
  orderId2 = `0x${orderId2.slice(4) + residualBytes2.slice(4, 6)}`

  if (orderId1 !== orderId2) throw new Error("logs don't belong to the same order")

  return parseResolvedAztecOrder((resolvedOrder1 + resolvedOrder2) as `0x${string}`)
}

export const parseFilledLog = (fields: Fr[]): FilledLog => {
  let orderId = fields[0].toString()
  let fillerData = fields[11].toString()
  const residualBytes = fields[12].toString()
  const originData =
    "0x" +
    fields[1].toString().slice(4) +
    residualBytes.slice(6, 8) +
    fields[2].toString().slice(4) +
    residualBytes.slice(8, 10) +
    fields[3].toString().slice(4) +
    residualBytes.slice(10, 12) +
    fields[4].toString().slice(4) +
    residualBytes.slice(12, 14) +
    fields[5].toString().slice(4) +
    residualBytes.slice(14, 16) +
    fields[6].toString().slice(4) +
    residualBytes.slice(16, 18) +
    fields[7].toString().slice(4) +
    residualBytes.slice(18, 20) +
    fields[8].toString().slice(4) +
    residualBytes.slice(20, 22) +
    fields[9].toString().slice(4) +
    residualBytes.slice(22, 24) +
    fields[10].toString().slice(4, 30)

  orderId = `0x${orderId.slice(4) + residualBytes.slice(4, 6)}`
  fillerData = `0x${fillerData.slice(4) + residualBytes.slice(24, 26)}`

  return {
    orderId,
    fillerData,
    originData: originData as `0x${string}`,
  }
}

export const parseResolvedAztecOrder = (resolvedOrder: string): ResolvedOrder => {
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

export const getResolvedOrderAndOrderIdEvmByReceipt = (
  receipt: TransactionReceipt,
): { orderId: Hex; resolvedOrder: ResolvedOrder } => {
  const log = (receipt.logs as LogWithTopics[]).find(
    ({ topics }) => topics[0] === "0x3448bbc2203c608599ad448eeb1007cea04b788ac631f9f558e8dd01a3c27b3d", // Open
  )
  const orderId = Fr.fromBufferReduce(Buffer.from(log!.topics[1].slice(2), "hex")).toString()
  const resolvedOrder = parseResolvedOrderEvm(log!)
  return {
    orderId,
    resolvedOrder,
  }
}

export const parseResolvedOrderEvm = (log: Log): ResolvedOrder => {
  const openEvent = l2Gateway7683Abi.find((el) => el.name === "Open")
  if (!openEvent || !openEvent.inputs[1]) {
    throw new Error("Invalid ABI: Could not find Open event or inputs[1]")
  }
  const [resolvedOrder] = decodeAbiParameters([openEvent.inputs[1] as AbiParameter], log.data) as [ResolvedOrder]
  return resolvedOrder
}

export const getResolvedOrderByAztecLogs = (logs: ExtendedPublicLog[]): ResolvedOrder[] => {
  const groupedLogs = logs.reduce<Record<string, ExtendedPublicLog[]>>((acc, obj) => {
    const groupKey = obj.log.fields[0].toString()
    if (!acc[groupKey]) {
      acc[groupKey] = []
    }
    acc[groupKey].push(obj)
    return acc
  }, {})

  const joinedLogs = Object.keys(groupedLogs)
    .filter((orderId) => {
      const logs = groupedLogs[orderId].filter(
        ({ log }: { log: PublicLog }) => log.getEmittedFields().length === 11 || log.getEmittedFields().length === 13,
      )
      return logs.length === 2
    })
    .map((orderId) => {
      const [open1, open2] = groupedLogs[orderId]
      const open = parseResolvedOrderFromOpen1AndOpen2Logs(open1.log.fields, open2.log.fields)
      return open
    })

  return joinedLogs
}
