import "dotenv/config"
import { Address, bytesToHex, createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256 } from "viem"
import { mainnet, optimismSepolia } from "viem/chains"
const { ssz } = await import("@lodestar/types")
const { BeaconBlock, SignedBeaconBlock } = ssz.electra
const { createProof, ProofType } = await import("@chainsafe/persistent-merkle-tree")

import l2Gateway7683Abi from "./abis/l2Gateway7683.js"
import { privateKeyToAccount } from "viem/accounts"

const FORWARDER_ADDRESS = "0x5182eCEF5Ffb88d3DcE2b154c9F16c5FC0fE5B4a"
const L2_GATEWAY_7683_ADDRESS = "0xce5dF6D41e7cC4780E75b001BC64588440b3450b"
const FORWARDER_SETTLE_ORDER_SLOTS = 0n
const MESSAGE = "0x0000000000000000000000000000000000000000"
const MESSAGE_HASH = "0xde47c9b27eb8d300dbb5f2c353e632c393262cf06340c4fa7f1b40c4cbd36f90"

const getExecutionStateRootProof = (block: any): { proof: string[]; leaf: string } => {
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
}

const main = async () => {
  const l1Client = createPublicClient({
    chain: mainnet,
    transport: http("https://eth-sepolia.api.onfinality.io/public"),
  })
  const evmL2Client = createPublicClient({
    chain: mainnet,
    transport: http("https://sepolia.optimism.io"),
  })
  const evmL2WalletClient = createWalletClient({
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

  const tx = await evmL2WalletClient.writeContract({
    address: L2_GATEWAY_7683_ADDRESS,
    functionName: "settle",
    args: [MESSAGE, stateRootParameters, accountProofParameters],
    abi: l2Gateway7683Abi,
  })

  console.log("tx", tx)
}

main()
