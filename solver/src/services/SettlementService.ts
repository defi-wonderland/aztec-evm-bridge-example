import { sha256ToField } from "@aztec/foundation/crypto"
import { AztecAddress, Fr } from "@aztec/aztec.js"
import { bytesToHex, encodeAbiParameters, keccak256, padHex } from "viem"
import { waitForTransactionReceipt } from "viem/actions"
const { ssz } = await import("@lodestar/types")
const { BeaconBlock, SignedBeaconBlock } = ssz.electra
const { createProof, ProofType } = await import("@chainsafe/persistent-merkle-tree")

import BaseService from "./BaseService"
import {
  AZTEC_VERSION,
  FORWARDER_CHAIN_ID,
  FORWARDER_SETTLE_ORDER_SLOTS,
  ORDER_STATUS_FILLED,
  ORDER_STATUS_SETTLE_FORWARDED,
  ORDER_STATUS_SETTLED,
  PORTAL_ADDRESS,
  SETTLE_ORDER_TYPE,
} from "../constants"
import forwarderAbi from "../abis/forwarder"
import l2Gateway7683Abi from "../abis/l2Gateway7683"
import { AztecGateway7683Contract } from "../artifacts/AztecGateway7683/AztecGateway7683"
import { hexToUintArray } from "../utils/bytes"

import type { Chain } from "viem"
import type { AztecNode, PXE, Wallet } from "@aztec/aztec.js"
import type { BaseServiceOpts } from "./BaseService"
import type { Order } from "../types"
import type MultiClient from "../MultiClient"

export type SettlementServiceOpts = BaseServiceOpts & {
  aztecWallet: Wallet
  aztecGatewayAddress: `0x${string}`
  aztecNode: AztecNode
  beaconApiUrl: string
  evmMultiClient: MultiClient
  forwarderAddress: `0x${string}`
  l1Chain: Chain
  l2EvmChain: Chain
  l2EvmGatewayAddress: `0x${string}`
  pxe: PXE
}

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

class SettlementService extends BaseService {
  aztecWallet: Wallet
  aztecGatewayAddress: `0x${string}`
  aztecNode: AztecNode
  beaconApiUrl: string
  evmMultiClient: MultiClient
  forwarderAddress: `0x${string}`
  l1Chain: Chain
  l2EvmChain: Chain
  l2EvmGatewayAddress: `0x${string}`
  pxe: PXE

  constructor(opts: SettlementServiceOpts) {
    super(opts)

    this.aztecWallet = opts.aztecWallet
    this.evmMultiClient = opts.evmMultiClient
    this.aztecGatewayAddress = opts.aztecGatewayAddress
    this.forwarderAddress = opts.forwarderAddress
    this.pxe = opts.pxe
    this.aztecNode = opts.aztecNode
    this.l1Chain = opts.l1Chain
    this.l2EvmChain = opts.l2EvmChain
    this.l2EvmGatewayAddress = opts.l2EvmGatewayAddress
    this.beaconApiUrl = opts.beaconApiUrl

    this.forwardOrdersSettlment()
    setInterval(() => {
      this.forwardOrdersSettlment()
    }, 30000)

    this.settleOrders()
    setInterval(() => {
      this.settleOrders()
    }, 30000)
  }

  async forwardOrdersSettlment() {
    try {
      this.logger.info("looking for forwarding order settlements ....")
      const orders = await this.db
        .collection("orders")
        .find({
          status: ORDER_STATUS_FILLED,
        })
        .toArray()

      for (const order of orders) {
        try {
          await this.forwardOrderSettlment({
            orderId: order.orderId,
            resolvedOrder: order.resolvedOrder,
            fillTxHash: order.fillTxHash,
            fillerData: order.fillerData,
            status: order.status,
          })
        } catch (err) {}
      }
    } catch (err) {
      this.logger.error(err)
    }
  }

  async forwardOrderSettlment(order: Order) {
    try {
      // TODO: distinguish the chains

      this.logger.info(`forwarding settlement for order ${order.orderId} ...`)

      const message = [
        Buffer.from(SETTLE_ORDER_TYPE.slice(2), "hex"),
        Buffer.from(order.orderId.slice(2), "hex"),
        Buffer.from(order.fillerData!.slice(2), "hex"),
      ]
      const messageHash = sha256ToField(message)

      const l2ToL1Message = sha256ToField([
        Buffer.from(this.aztecGatewayAddress.slice(2), "hex"),
        new Fr(AZTEC_VERSION).toBuffer(), // aztec version
        PORTAL_ADDRESS.toBuffer32(),
        new Fr(FORWARDER_CHAIN_ID).toBuffer(),
        messageHash.toBuffer(),
      ])

      const gateway = await AztecGateway7683Contract.at(
        AztecAddress.fromString(this.aztecGatewayAddress),
        this.aztecWallet,
      )
      const filledOrderBlockNumber = await gateway.methods
        .get_filled_order_block_number(hexToUintArray(order.orderId))
        .simulate()

      const [l2ToL1MessageIndex, siblingPath] = await this.pxe.getL2ToL1MembershipWitness(
        parseInt(filledOrderBlockNumber),
        l2ToL1Message,
      )

      const client = this.evmMultiClient.getClientByChain(this.l1Chain)
      const forwardSettleTxHash = await client.writeContract({
        address: this.forwarderAddress,
        abi: forwarderAbi,
        args: [
          [
            [
              this.aztecGatewayAddress,
              AZTEC_VERSION, // version
            ],
            [this.forwarderAddress, FORWARDER_CHAIN_ID],
            messageHash.toString(),
          ],
          bytesToHex(Buffer.concat([...message])),
          filledOrderBlockNumber,
          l2ToL1MessageIndex,
          [padHex("0x00")], // TODO
        ],
        functionName: "forwardSettleToL2",
      })
      this.logger.info(`waiting for transaction confirmation of ${forwardSettleTxHash} ...`)
      await waitForTransactionReceipt(client, { hash: forwardSettleTxHash })

      this.logger.info(`settlement succesfully forwarded for order ${order.orderId}. tx hash: ${forwardSettleTxHash}`)
      await this.db.collection("orders").findOneAndUpdate(
        { orderId: order.orderId },
        {
          $set: {
            forwardSettleTxHash,
            status: ORDER_STATUS_SETTLE_FORWARDED,
          },
        },
        { upsert: true, returnDocument: "after" },
      )
    } catch (err) {
      this.logger.error(err)
      throw err
    }
  }

  async settleOrders() {
    try {
      this.logger.info("looking for settlable orders ....")
      const orders = await this.db
        .collection("orders")
        .find({
          status: ORDER_STATUS_SETTLE_FORWARDED,
        })
        .toArray()

      for (const order of orders) {
        try {
          await this.settleOrder({
            orderId: order.orderId,
            resolvedOrder: order.resolvedOrder,
            fillTxHash: order.fillTxHash,
            fillerData: order.fillerData,
            status: order.status,
          })
        } catch (err) {}
      }
    } catch (err) {
      this.logger.error(err)
    }
  }

  async settleOrder(order: Order) {
    try {
      this.logger.info(`settling order ${order.orderId} ...`)

      const l1Client = this.evmMultiClient.getClientByChain(this.l1Chain)
      const l2EvmClient = this.evmMultiClient.getClientByChain(this.l2EvmChain)

      const message = [
        Buffer.from(SETTLE_ORDER_TYPE.slice(2), "hex"),
        Buffer.from(order.orderId.slice(2), "hex"),
        Buffer.from(order.fillerData!.slice(2), "hex"),
      ]
      const messageHash = sha256ToField(message)

      const { parentBeaconBlockRoot: beaconRoot, timestamp: beaconOracleTimestamp } = await l2EvmClient.getBlock()
      const resp = await fetch(`${this.beaconApiUrl}/eth/v2/beacon/blocks/${beaconRoot}`, {
        headers: { Accept: "application/octet-stream" },
      })
      const beaconBlock = SignedBeaconBlock.deserialize(new Uint8Array(await resp.arrayBuffer())).message
      const l1BlockNumber = BigInt(beaconBlock.body.executionPayload.blockNumber)

      const stateRootInclusionProof = getExecutionStateRootProof(beaconBlock)
      const storageKey = keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "uint256" }],
          [messageHash.toString(), FORWARDER_SETTLE_ORDER_SLOTS],
        ),
      )
      const proof = await l1Client.getProof({
        address: this.forwarderAddress,
        storageKeys: [storageKey],
        blockNumber: l1BlockNumber,
      })

      const stateRootParameters = {
        beaconRoot,
        beaconOracleTimestamp,
        executionStateRoot: stateRootInclusionProof.leaf,
        stateRootProof: stateRootInclusionProof.proof,
      }

      const accountProofParameters = {
        storageKey: proof.storageProof[0]!.key,
        storageValue: proof.storageProof[0]!.value === 1n ? "0x01" : "0x00",
        accountProof: proof.accountProof,
        storageProof: proof.storageProof[0]!.proof,
      }

      if (accountProofParameters.storageValue === "0x00") {
        this.logger.info(`storage value not up to date yet for order ${order.orderId}. trying in seconds ...`)
        return
      }

      const settleTxHash = await l2EvmClient.writeContract({
        address: this.l2EvmGatewayAddress,
        functionName: "settle",
        args: [bytesToHex(Buffer.concat([...message])), stateRootParameters, accountProofParameters],
        abi: l2Gateway7683Abi,
      })
      this.logger.info(`waiting for transaction confirmation of ${settleTxHash} ...`)
      await waitForTransactionReceipt(l1Client, { hash: settleTxHash })

      this.logger.info(`order ${order.orderId} succesfully settled. tx hash: ${settleTxHash}`)
      await this.db.collection("orders").findOneAndUpdate(
        { orderId: order.orderId },
        {
          $set: {
            settleTxHash,
            status: ORDER_STATUS_SETTLED,
          },
        },
        { upsert: true, returnDocument: "after" },
      )
    } catch (err) {
      this.logger.error(err)
      throw err
    }
  }
}

export default SettlementService
