import winston from "winston"
import { AztecAddress } from "@aztec/aztec.js"

import { parseOpenLog, parseResolvedCrossChainOrder } from "../utils/aztec"

import type { PXE } from "@aztec/aztec.js"

interface WatcherConfigs {
  service: string
  logger: winston.Logger
  pxe: PXE
  contractAddress: `0x${string}`
  eventName: string
  watchIntervalTimeMs: number
  onLogs: (logs: any[]) => Promise<void>
}

class AztecWatcher {
  logger: winston.Logger
  onLogs: (logs: any[]) => Promise<void>
  pxe: PXE
  contractAddress: `0x${string}`
  eventName: string
  private lastBlock: number
  private watchIntervalTimeMs: number

  constructor(configs: WatcherConfigs) {
    this.logger = configs.logger.child({ service: configs.service })
    this.pxe = configs.pxe
    this.contractAddress = configs.contractAddress
    this.eventName = configs.eventName
    this.onLogs = configs.onLogs
    this.watchIntervalTimeMs = configs.watchIntervalTimeMs

    this.lastBlock = 0
  }

  async start() {
    try {
      this.watch()
      setInterval(() => {
        this.watch()
      }, this.watchIntervalTimeMs)
    } catch (error) {}
  }

  private async watch() {
    try {
      const currentBlock = await this.pxe.getBlockNumber()
      if (!this.lastBlock) {
        this.lastBlock = currentBlock - 1
      }

      const fromBlock = this.lastBlock + 1
      const toBlock = currentBlock + 1

      if (fromBlock === toBlock) {
        this.logger.info(`no new blocks detected. currentBlock is ${currentBlock}. skipping ...`)
        return
      }

      this.logger.info(`looking for ${this.eventName} events from block ${fromBlock} to block ${toBlock} on Aztec ...`)
      const { logs } = await this.pxe.getPublicLogs({
        fromBlock,
        toBlock: toBlock,
        contractAddress: AztecAddress.fromString(this.contractAddress),
      })

      // NOTE: At the moment, we use `pack` to emit an event, so we cannot determine the event name.
      // Since this is a workaround, we created an ad-hoc algorithm to detect whether an event is of type Open,
      // in order to filter Open1 and Open2 events.
      // Currently, for the POC, it's enough to check whether `fields[0]` of both logs are the same
      // and that the log index is sequential (e.g., 0 and 1).
      const groupedLogs = logs.reduce((acc, obj) => {
        const groupKey = obj.log.fields[0].toString()
        if (!acc[groupKey]) {
          acc[groupKey] = []
        }
        acc[groupKey].push(obj)
        return acc
      }, {} as any)

      const joinedLogs = Object.keys(groupedLogs)
        .filter((orderId) => {
          const logs = groupedLogs[orderId].filter(
            ({ log }: { log: any }) => log.getEmittedFields().length === 11 || log.getEmittedFields().length === 13,
          )
          return logs.length === 2
        })
        .map((orderId) => {
          const [open1, open2] = groupedLogs[orderId]
          const open = parseOpenLog(open1.log.fields, open2.log.fields)
          return {
            orderId: open.orderId,
            resolvedOrder: parseResolvedCrossChainOrder(open.resolvedOrder),
          }
        })

      if (logs.length) {
        this.logger.info(`Detected ${joinedLogs.length} new ${this.eventName} events Aztec. Processing them ...`)
        await this.onLogs(joinedLogs)
      }

      this.lastBlock = currentBlock
    } catch (error) {
      this.logger.error(error)
    }
  }
}

export default AztecWatcher
