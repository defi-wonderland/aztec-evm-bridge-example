import "dotenv/config"
import { AztecAddress, Contract, createLogger, Fr, sleep, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { createWalletClient, hexToBytes, http, padHex } from "viem"
import { poseidon2Hash } from "@aztec/foundation/crypto"
import { privateKeyToAccount } from "viem/accounts"
import { optimismSepolia } from "viem/chains"

import { getSponsoredFPCAddress } from "../fpc.js"
import { getPxe, getWalletFromSecretKey } from "../utils.js"
import { AztecGateway7683ContractArtifact } from "../../src/artifacts/AztecGateway7683.js"
import { OrderData } from "../../src/ts/test/OrderData.js"
import { parseFilledLog } from "../../src/ts/test/utils.js"

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
  const evmWalletClient = createWalletClient({
    account: privateKeyToAccount(EVM_PK),
    chain: optimismSepolia,
    transport: http(),
  })

  const fillDeadline = 2 ** 32 - 1
  const amount = 100n
  const secret = Fr.random()
  const secretHash = await poseidon2Hash([secret])
  const nonce = Fr.random()
  const orderData = new OrderData({
    sender: padHex(evmWalletClient.account.address),
    recipient: secretHash.toString(),
    inputToken: padHex(L2_EVM_TOKEN),
    outputToken: AZTEC_TOKEN,
    amountIn: amount,
    amountOut: amount,
    senderNonce: nonce.toBigInt(),
    originDomain: L2_GATEWAY_7683_DOMAIN,
    destinationDomain: 999999,
    destinationSettler: AZTEC_GATEWAY_7683,
    fillDeadline,
    orderType: 1, // PRIVATE_ORDER
    data: padHex("0x00"),
  })
  const orderId = await orderData.id()

  // NOTE: make sure to approve the tokens
  logger.info("creating open order on op sepolia ...")
  const txHash = await evmWalletClient.writeContract({
    address: L2_GATEWAY_7683,
    functionName: "open",
    abi: [
      {
        type: "function",
        name: "open",
        inputs: [
          {
            name: "_order",
            type: "tuple",
            internalType: "struct OnchainCrossChainOrder",
            components: [
              {
                name: "fillDeadline",
                type: "uint32",
                internalType: "uint32",
              },
              {
                name: "orderDataType",
                type: "bytes32",
                internalType: "bytes32",
              },
              {
                name: "orderData",
                type: "bytes",
                internalType: "bytes",
              },
            ],
          },
        ],
        outputs: [],
        stateMutability: "payable",
      },
    ],
    args: [
      {
        fillDeadline,
        orderDataType: ORDER_DATA_TYPE,
        orderData: orderData.encode(),
      },
    ],
  })

  logger.info(`order created. tx hash: ${txHash}`)
  logger.info("waiting for the filler to fill the order ...")

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

  while (true) {
    const status = await gateway.methods.get_order_status(orderId).simulate()
    logger.info(`order ${orderId.toString()} status: ${status}`)
    // FILLED_PRIVATELY
    if (status === 3n) {
      let log
      while (true) {
        try {
          logger.info(`order ${orderId.toString()} filled succesfully. claiming it ...`)

          await sleep(3000)
          // TODO: understand why if i use fromBlock and toBlock i always receive the penultimante log.
          // Basically i never receive the last one even if block numbers are up to date
          const { logs } = await pxe.getPublicLogs({
            contractAddress: AztecAddress.fromString(AZTEC_GATEWAY_7683),
          })

          const parsedLogs = logs.map(({ log }) => parseFilledLog(log.fields))
          log = parsedLogs.find((log) => log.orderId === orderId.toString())
          if (!log) throw new Error("log not found")
          break
        } catch (err) {
          console.error(err)
          sleep(3000)
        }
      }

      await gateway.methods
        .claim_private(
          secret,
          Array.from(hexToBytes(orderId.toString())),
          Array.from(hexToBytes(log.originData as `0x${string}`)),
          Array.from(hexToBytes(log.fillerData as `0x${string}`)),
        )
        .send({
          fee: {
            paymentMethod,
          },
        })
        .wait()
      break
    }

    sleep(15000)
  }
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
