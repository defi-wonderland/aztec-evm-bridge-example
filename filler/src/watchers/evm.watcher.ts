import winston from "winston"

import type { PublicClient, Log, Filter } from "viem"

interface WatcherConfigs {
  service: string
  logger: winston.Logger
  client: any
  contractAddress: `0x${string}`
  abi: any
  eventName: string
  watchIntervalTimeMs: number
  onLogs: (logs: Log[]) => Promise<void>
}

class EvmWatcher {
  logger: winston.Logger
  onLogs: (logs: Log[]) => Promise<void>
  client: PublicClient
  contractAddress: `0x${string}`
  abi: any
  eventName: string
  private lastBlock: bigint
  private watchIntervalTimeMs: number

  constructor(configs: WatcherConfigs) {
    this.logger = configs.logger.child({ service: configs.service })
    this.client = configs.client
    this.contractAddress = configs.contractAddress
    this.abi = configs.abi
    this.eventName = configs.eventName
    this.onLogs = configs.onLogs
    this.watchIntervalTimeMs = configs.watchIntervalTimeMs

    this.lastBlock = 0n
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
      const currentBlock = await this.client.getBlockNumber()
      if (!this.lastBlock) {
        this.lastBlock = currentBlock - 1n
      }

      const fromBlock = this.lastBlock + 1n
      const toBlock = currentBlock
      this.lastBlock = currentBlock

      this.logger.info(
        `looking for ${this.eventName} events from block ${fromBlock} to block ${toBlock} on ${this.client.chain!.name} ...`,
      )

      const filter = await this.client.createContractEventFilter({
        address: this.contractAddress,
        abi: this.abi,
        eventName: this.eventName,
        fromBlock,
        toBlock,
      })
      const logs = (await this.client.getFilterLogs({ filter: filter as Filter })) as Log[]

      if (logs.length) {
        this.logger.info(
          `Detected ${logs.length} new ${this.eventName} events on ${this.client.chain!.name}. Processing them ...`,
        )
        await this.onLogs(logs)
      }
    } catch (error) {
      this.logger.error(error)
    }
  }
}

export default EvmWatcher
