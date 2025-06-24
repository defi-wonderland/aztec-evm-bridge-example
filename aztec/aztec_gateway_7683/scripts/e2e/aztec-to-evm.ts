import "dotenv/config"
import { AztecAddress, Contract, createLogger, Fr, sleep, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { createPublicClient, hexToBytes, http, padHex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import * as chains from "viem/chains"
import { TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

import { getSponsoredFPCAddress } from "../fpc.js"
import { getPxe, getWalletFromSecretKey } from "../utils.js"
import { AztecGateway7683ContractArtifact } from "../../src/artifacts/AztecGateway7683.js"
import { OrderData } from "../../src/ts/test/OrderData.js"

const AZTEC_GATEWAY_7683 = process.env.AZTEC_GATEWAY_7683 as `0x${string}`
const L2_GATEWAY_7683 = process.env.L2_GATEWAY_7683 as `0x${string}`
const AZTEC_TOKEN = process.env.AZTEC_TOKEN as `0x${string}`
const L2_EVM_TOKEN = process.env.L2_EVM_TOKEN as `0x${string}`
const L2_GATEWAY_7683_DOMAIN = parseInt(process.env.L2_GATEWAY_7683_DOMAIN as string)
const ORDER_DATA_TYPE = "0xf00c3bf60c73eb97097f1c9835537da014e0b755fe94b25d7ac8401df66716a0"
const EVM_PK = process.env.EVM_PK as `0x${string}`

// NOTE: make sure that the filler is running
async function main(): Promise<void> {
  const logger = createLogger("e2e:evm-to-aztec")

  const l2EvmChain = Object.values(chains).find(
    ({ id }: any) => id.toString() === (process.env.EVM_L2_CHAIN_ID as string),
  ) as chains.Chain
  const evmClient = createPublicClient({
    chain: l2EvmChain,
    transport: http(),
  })

  const pxe = await getPxe()
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const aztecWalllet = await getWalletFromSecretKey({
    secretKey: process.env.AZTEC_SECRET_KEY as string,
    salt: process.env.AZTEC_KEY_SALT as string,
    pxe,
  })
  await aztecWalllet.registerSender(AztecAddress.fromString(AZTEC_GATEWAY_7683))
  const gateway = await Contract.at(
    AztecAddress.fromString(AZTEC_GATEWAY_7683),
    AztecGateway7683ContractArtifact,
    aztecWalllet,
  )
  const token = await Contract.at(AztecAddress.fromString(AZTEC_TOKEN), TokenContractArtifact, aztecWalllet)

  const fillDeadline = 2 ** 32 - 1
  const amount = 100n
  const nonce = Fr.random()
  const orderData = new OrderData({
    sender: padHex("0x00"),
    recipient: padHex(privateKeyToAccount(EVM_PK).address),
    inputToken: AZTEC_TOKEN,
    outputToken: padHex(L2_EVM_TOKEN),
    amountIn: amount,
    amountOut: amount,
    senderNonce: nonce.toBigInt(),
    originDomain: 999999,
    destinationDomain: L2_GATEWAY_7683_DOMAIN,
    destinationSettler: AZTEC_GATEWAY_7683,
    fillDeadline,
    orderType: 1, // PRIVATE_ORDER
    data: padHex("0x00"),
  })
  const orderId = await orderData.id()

  logger.info("opening private order ...")
  const receipt = await gateway.methods
    .open_private({
      fill_deadline: fillDeadline,
      order_data: Array.from(hexToBytes(orderData.encode())),
      order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
    })
    .with({
      authWitnesses: [
        await aztecWalllet.createAuthWit({
          caller: gateway.address,
          action: token.methods.transfer_to_public(aztecWalllet.getAddress(), gateway.address, amount, nonce),
        }),
      ],
    })
    .send({ fee: { paymentMethod } })
    .wait()

  logger.info(`order opened: ${receipt.txHash.toString()}`)

  while (true) {
    const orderStatus = await evmClient.readContract({
      address: L2_GATEWAY_7683,
      abi: [
        {
          type: "function",
          name: "orderStatus",
          inputs: [
            {
              name: "orderId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          outputs: [
            {
              name: "status",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
          stateMutability: "view",
        },
      ],
      functionName: "orderStatus",
      args: [orderId.toString()],
    })
    logger.info(`order ${orderId.toString()} status: ${orderStatus}`)

    if (orderStatus !== padHex("0x00")) {
      logger.info("order filled succesfully!")
      break
    }

    await sleep(5000)
  }
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
