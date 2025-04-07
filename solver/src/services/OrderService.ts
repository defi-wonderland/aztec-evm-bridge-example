import { hexToBytes, padHex } from "viem"
import { AztecAddress } from "@aztec/aztec.js"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

import { registerContract } from "../utils/aztec.js"
import { AztecGateway7683Contract } from "../artifacts/AztecGateway7683/AztecGateway7683.js"
import {
  AZTEC_7683_CHAIN_ID,
  ORDER_FILLED,
  ORDER_STATUS_FILLED,
  ORDER_STATUS_INITIATED_PRIVATELY,
  PRIVATE_ORDER_DATA,
} from "../constants.js"
import BaseService from "./BaseService"

import type { Log, PublicClient, WalletClient } from "viem"
import type { Wallet } from "@aztec/aztec.js"
import type { BaseServiceOpts } from "./BaseService"

export type OrderServiceOpts = BaseServiceOpts & {
  aztecWallet: Wallet
  aztecGatewayContractAddress: `0x${string}`
  evmWallet: PublicClient & WalletClient
}

class OrderService extends BaseService {
  aztecWallet: Wallet
  aztecGatewayContractAddress: `0x${string}`
  evmWallet: PublicClient & WalletClient

  constructor(opts: OrderService) {
    super(opts)

    this.aztecWallet = opts.aztecWallet
    this.evmWallet = opts.evmWallet
    this.aztecGatewayContractAddress = opts.aztecGatewayContractAddress

    this.monitorInitiadedPrivatelyOrders()
    setInterval(() => {
      this.monitorInitiadedPrivatelyOrders()
    }, 30000)
  }

  async monitorInitiadedPrivatelyOrders(): Promise<void> {
    try {
      this.logger.info("looking for settlable orders ...")

      const orders = await this.db
        .collection("orders")
        .find({
          status: ORDER_STATUS_INITIATED_PRIVATELY,
        })
        .toArray()
      if (orders.length === 0) {
        this.logger.info("no orders initiated privately found ...")
        return
      }

      const gateway = await AztecGateway7683Contract.at(
        AztecAddress.fromString(this.aztecGatewayContractAddress),
        this.aztecWallet,
      )

      const orderIds = orders.map(({ orderId }) => orderId)
      const newOrdersStatus = await Promise.all(
        orderIds.map((orderId) => gateway.methods.get_order_status(Array.from(hexToBytes(orderId))).simulate()),
      )

      const filledOrderIds = orderIds.filter((_, index) => newOrdersStatus[index] === ORDER_FILLED)
      if (filledOrderIds.length === 0) {
        this.logger.info("no orders filled privately found ...")
        return
      }

      this.logger.info(`orders ${filledOrderIds.join(",")} has been filled. updating db ...`)
      await this.db.collection("orders").updateMany(
        {
          orderId: { $in: filledOrderIds },
        },
        { $set: { status: ORDER_STATUS_FILLED } },
      )
    } catch (err) {
      this.logger.error(err)
    }
  }

  async fillEvmOrderFromLog(log: Log): Promise<void> {
    try {
      const {
        args: {
          orderId,
          resolvedOrder: { fillInstructions, maxSpent, minReceived },
        },
      } = log as any

      this.logger.info(`new order detect: ${orderId}. processing it ...`)

      const originData = fillInstructions[0].originData
      const minReceivedAmount = minReceived[0].amount
      const minReceivedToken = minReceived[0].token
      const minReceivedRecipient = minReceived[0].recipient
      const minReceivedChainId = minReceived[0].chainId
      const maxSpentAmount = maxSpent[0].amount
      const maxSpentToken = maxSpent[0].token
      const maxSpentRecipient = maxSpent[0].recipient
      const maxSpentChainId = maxSpent[0].chainId

      // TODO: check if minReceivedToken is supported
      if (maxSpentChainId !== AZTEC_7683_CHAIN_ID) throw new Error("Invalid chain id")

      // TODO: calculate the best price for this swap
      this.logger.info(
        `swapping ${minReceivedAmount} ${minReceivedChainId}:${minReceivedToken} for ${maxSpentAmount} ${maxSpentChainId}:${maxSpentToken} to ${maxSpentChainId}:${maxSpentRecipient}...`,
      )

      try {
        this.logger.info("registering token contract into the PXE ...")
        await registerContract(AztecAddress.fromString(maxSpentToken), {
          wallet: this.aztecWallet,
          artifact: TokenContractArtifact,
        })
      } catch (err) {
        this.logger.error(err)
      }

      const [token, aztecGateway] = await Promise.all([
        TokenContract.at(AztecAddress.fromString(maxSpentToken), this.aztecWallet),
        AztecGateway7683Contract.at(AztecAddress.fromString(this.aztecGatewayContractAddress), this.aztecWallet),
      ])

      this.logger.info(`setting public auth with to fill the order ${orderId} ...`)
      await (
        await this.aztecWallet.setPublicAuthWit(
          {
            caller: AztecAddress.fromString(this.aztecGatewayContractAddress),
            action: token.methods.transfer_in_public(
              this.aztecWallet.getAddress(),
              AztecAddress.fromString(this.aztecGatewayContractAddress),
              maxSpentAmount,
              0,
            ),
          },
          true,
        )
      )
        .send()
        .wait()

      const orderStatus =
        "0x" + originData.slice(-64) === PRIVATE_ORDER_DATA ? ORDER_STATUS_INITIATED_PRIVATELY : ORDER_STATUS_FILLED

      let receipt
      if (orderStatus === ORDER_STATUS_INITIATED_PRIVATELY) {
        this.logger.info(`filling the private order ${orderId} ...`)
        receipt = await aztecGateway
          .withWallet(this.aztecWallet)
          .methods.fill_private(
            Array.from(hexToBytes(orderId)),
            Array.from(hexToBytes(originData)),
            Array.from(hexToBytes(padHex(this.evmWallet.account.address))),
          )
          .send()
          .wait()
      } else {
        this.logger.info(`filling the public order ${orderid} ...`)
        receipt = await aztecGateway
          .withWallet(this.aztecWallet)
          .methods.fill(
            Array.from(hexToBytes(orderId)),
            Array.from(hexToBytes(originData)),
            Array.from(hexToBytes(padHex(this.evmWallet.account.address))),
          )
          .send()
          .wait()
      }

      this.logger.info(`order ${orderId} filled succesfully. tx hash: ${receipt.txHash.toString()}. storing it ...`)

      await this.db.collection("orders").findOneAndUpdate(
        { id: orderId },
        {
          $addToSet: {
            confirmedBy: orderId,
          },
          $setOnInsert: {
            ...(log as any).args,
            fillTxHash: receipt.txHash.toString(),
            status: orderStatus,
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

export default OrderService
