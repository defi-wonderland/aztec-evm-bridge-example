import "dotenv/config"
import * as chains from "viem/chains"
import { AztecAddress } from "@aztec/aztec.js"
import { MongoClient } from "mongodb"

import EvmWatcher from "./watchers/EvmWatcher.js"
import logger from "./utils/logger.js"
import { getAztecNode, getAztecWallet, getPxe, registerContract } from "./utils/aztec.js"
import l2Gateway7683Abi from "./abis/l2Gateway7683.js"
import { AztecGateway7683ContractArtifact } from "./artifacts/AztecGateway7683/AztecGateway7683.js"
import OrderService from "./services/OrderService.js"
import SettlementService from "./services/SettlementService.js"
import MultiClient from "./MultiClient.js"

import type { Log } from "viem"
import AztecWatcher from "./watchers/AztecWatcher.js"

const AZTEC_GATEWAY_ADDRESS = process.env.AZTEC_GATEWAY_ADDRESS as `0x${string}`
const L2_EVM_GATEWAY_ADDRESS = process.env.L2_EVM_GATEWAY_ADDRESS as `0x${string}`
const FORWARDER_ADDRESS = process.env.FORWARDER_ADDRESS as `0x${string}`
const FORWARDER_RPC_URL = process.env.FORWARDER_RPC_URL as string
const PK = process.env.PK as `0x${string}`
const EVM_L2_RPC_URL = process.env.EVM_L2_RPC_URL as string
const BEACON_API_URL = process.env.BEACON_API_URL as string
const EVM_WATCH_INTERVAL_TIME_MS = Number(process.env.EVM_WATCH_INTERVAL_TIME_MS as string)
const AZTEC_WATCH_INTERVAL_TIME_MS = Number(process.env.AZTEC_WATCH_INTERVAL_TIME_MS as string)

const main = async () => {
  const mongoClient = new MongoClient(process.env.MONGO_DB_URI as string)
  await mongoClient.connect()
  const db = mongoClient.db((process.env.MONGO_DB_NAME as string) || "filler")

  const aztecWallet = await getAztecWallet()
  logger.info("registering gateway contract into the PXE ...")
  await registerContract(AztecAddress.fromString(AZTEC_GATEWAY_ADDRESS), {
    wallet: aztecWallet,
    artifact: AztecGateway7683ContractArtifact,
  })

  const l2EvmChain = Object.values(chains).find(
    ({ id }) => id.toString() === (process.env.EVM_L2_CHAIN_ID as string),
  ) as chains.Chain
  const l1Chain = Object.values(chains).find(
    ({ id }) => id.toString() === (process.env.FORWARDER_CHAIN_ID as string),
  ) as chains.Chain

  const evmMultiClient = new MultiClient({
    chains: [l2EvmChain, chains.sepolia],
    privateKey: PK,
    rpcUrls: {
      [l2EvmChain.id]: EVM_L2_RPC_URL,
      [l1Chain.id]: FORWARDER_RPC_URL,
    },
  })

  const orderService = new OrderService({
    aztecGatewayAddress: AZTEC_GATEWAY_ADDRESS,
    aztecWallet,
    db,
    evmMultiClient,
    logger,
    l2EvmChain,
    l2EvmGatewayAddress: L2_EVM_GATEWAY_ADDRESS,
  })

  new SettlementService({
    aztecGatewayAddress: AZTEC_GATEWAY_ADDRESS,
    aztecWallet,
    aztecNode: await getAztecNode(),
    beaconApiUrl: BEACON_API_URL,
    db,
    evmMultiClient,
    forwarderAddress: FORWARDER_ADDRESS,
    l1Chain,
    logger,
    l2EvmChain,
    l2EvmGatewayAddress: L2_EVM_GATEWAY_ADDRESS,
    pxe: await getPxe(),
  })

  const evmWatcher = new EvmWatcher({
    service: `${l2EvmChain.name.replace(/\s+/g, "")}Watcher`,
    logger,
    client: evmMultiClient.getClientByChain(l2EvmChain),
    contractAddress: L2_EVM_GATEWAY_ADDRESS,
    abi: l2Gateway7683Abi,
    eventName: "Open",
    watchIntervalTimeMs: EVM_WATCH_INTERVAL_TIME_MS,
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        await orderService.fillEvmOrderFromLog(log)
      }
    },
  })
  const aztecWatcher = new AztecWatcher({
    service: "AztecWatcher",
    logger,
    pxe: await getPxe(),
    contractAddress: AZTEC_GATEWAY_ADDRESS,
    eventName: "Open",
    watchIntervalTimeMs: AZTEC_WATCH_INTERVAL_TIME_MS,
    onLogs: async (logs) => {
      for (const log of logs) {
        await orderService.fillAztecOrderFromLog(log)
      }
    },
  })

  evmWatcher.start()
  aztecWatcher.start()
}

main()
