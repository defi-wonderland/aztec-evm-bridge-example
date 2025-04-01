import "dotenv/config"
import { bytesToHex, createWalletClient, encodeAbiParameters, http, keccak256, publicActions } from "viem"
import * as chains from "viem/chains"
const { ssz } = await import("@lodestar/types")
const { BeaconBlock, SignedBeaconBlock } = ssz.electra
const { createProof, ProofType } = await import("@chainsafe/persistent-merkle-tree")
import { privateKeyToAccount } from "viem/accounts"
import { AztecAddress } from "@aztec/aztec.js"
import { MongoClient } from "mongodb"

import EvmWatcher from "./watchers/EvmWatcher.js"
import logger from "./utils/logger.js"
import { getAztecWallet, registerContract } from "./utils/aztec.js"
import l2Gateway7683Abi from "./abis/evm/l2Gateway7683.js"
import { AztecGateway7683ContractArtifact } from "./artifacts/AztecGateway7683/AztecGateway7683.js"
import OrderService from "./services/OrderService.js"

import type { PublicClient, WalletClient, Log, Address } from "viem"

// const FORWARDER_ADDRESS = "0x5182eCEF5Ffb88d3DcE2b154c9F16c5FC0fE5B4a"
const FORWARDER_SETTLE_ORDER_SLOTS = 0n
// const MESSAGE = "0x0000000000000000000000000000000000000000"
// const MESSAGE_HASH = "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90"

const AZTEC_GATEWAY_CONTRACT_ADDRESS = process.env.AZTEC_GATEWAY_CONTRACT_ADDRESS as `0x${string}`
const L2_GATEWAY_CONTRACT_ADDRESS = process.env.L2_GATEWAY_CONTRACT_ADDRESS as `0x${string}`
const PK = process.env.PK as `0x${string}`
const EVM_L2_RPC_URL = process.env.EVM_L2_RPC_URL

/*const getExecutionStateRootProof = (block: any): { proof: string[]; leaf: string } => {
  const blockView = BeaconBlock.toView(block)
  const path = ["body", "executionPayload", "stateRoot"]
  const pathInfo = blockView.type.getPathInfo(path)
  const proofObj = createProof(blockView.node, {
    type: ProofType.single,
    gindex: pathInfo.gindex,
  }) as any
  const proof = proofObj.witnesses.map((w: Uint8Array) => bytesToHex(w))
  const leaf = bytesToHex(proofObj.leaf as Uint8Array)
  return { proof, leaf }
}

const getStorageKey = (messageHash: Address): Address => {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [messageHash, FORWARDER_SETTLE_ORDER_SLOTS]),
  )
}*/

const main = async () => {
  /*const l1Client = createPublicClient({
    chain: mainnet,
    transport: http("https://eth-sepolia.api.onfinality.io/public"),
  })
  const evmL2Client = createPublicClient({
    chain: mainnet,
    transport: http("https://sepolia.optimism.io"),
  })
  const evmL2Wallet = createWalletClient({
    chain: optimismSepolia,
    transport: http("https://sepolia.optimism.io"),
    account: privateKeyToAccount(process.env.PK as `0x${string}`),
  })

  const { parentBeaconBlockRoot: beaconRoot, timestamp: beaconOracleTimestamp } = await evmL2Client.getBlock()
  const resp = await fetch(`${process.env.SEPOLIA_BEACON_API}/eth/v2/beacon/blocks/${beaconRoot}`, {
    headers: { Accept: "application/octet-stream" },
  })
  const beaconBlock = SignedBeaconBlock.deserialize(new Uint8Array(await resp.arrayBuffer())).message
  const l1BlockNumber = BigInt(beaconBlock.body.executionPayload.blockNumber)

  const stateRootInclusionProof = getExecutionStateRootProof(beaconBlock)
  const proof = await l1Client.getProof({
    address: FORWARDER_ADDRESS,
    storageKeys: [getStorageKey(MESSAGE_HASH)],
    blockNumber: l1BlockNumber,
  })

  const stateRootParameters = {
    beaconRoot,
    beaconOracleTimestamp,
    executionStateRoot: stateRootInclusionProof.leaf,
    stateRootProof: stateRootInclusionProof.proof,
  }

  const accountProofParameters = {
    storageKey: proof.storageProof[0].key,
    storageValue: proof.storageProof[0].value === 1n ? "0x01" : "0x00",
    accountProof: proof.accountProof,
    storageProof: proof.storageProof[0].proof,
  }

  const tx = await evmL2Wallet.writeContract({
    address: process.env.L2_GATEWAY_CONTRACT_ADDRESS as `0x${string}`,
    functionName: "settle",
    args: [MESSAGE, stateRootParameters, accountProofParameters],
    abi: l2Gateway7683Abi,
  })

  console.log("tx", tx)*/

  const mongoClient = new MongoClient(process.env.MONGO_DB_URI as string)
  await mongoClient.connect()
  const db = mongoClient.db((process.env.MONGO_DB_NAME as string) || "solver")

  const aztecWallet = await getAztecWallet()
  logger.info("registering gateway contract into the PXE ...")
  await registerContract(AztecAddress.fromString(AZTEC_GATEWAY_CONTRACT_ADDRESS), {
    wallet: aztecWallet,
    artifact: AztecGateway7683ContractArtifact,
  })

  const l2EvmChain = Object.values(chains).find(
    ({ id }) => id.toString() === (process.env.EVM_L2_CHAIN_ID as string),
  ) as chains.Chain

  const evmWallet = createWalletClient({
    chain: l2EvmChain,
    transport: http(EVM_L2_RPC_URL),
    account: privateKeyToAccount(PK),
  }).extend(publicActions)

  const orderService = new OrderService({
    aztecGatewayContractAddress: AZTEC_GATEWAY_CONTRACT_ADDRESS,
    aztecWallet,
    db,
    evmWallet: evmWallet as PublicClient & WalletClient,
    logger,
  })

  const watcher = new EvmWatcher({
    service: `EvmWatcher:${l2EvmChain.name}`,
    logger,
    client: evmWallet,
    contractAddress: L2_GATEWAY_CONTRACT_ADDRESS,
    abi: l2Gateway7683Abi,
    eventName: "Open",
    watchIntervalTimeMs: Number(process.env.WATCH_INTERVAL_TIME_MS as string),
    onLogs: async (logs: Log[]) => {
      for (const log of logs) {
        await orderService.fillEvmOrderFromLog(log)
      }
    },
  })
  watcher.start()
}

main()
