import "dotenv/config"
import { AztecAddress, Contract, Fr, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { hexToBytes, padHex } from "viem"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"
import { AztecGateway7683ContractArtifact } from "../src/artifacts/AztecGateway7683.js"
import { OrderData } from "../src/ts/test/OrderData.js"
import { TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

const AZTEC_GATEWAY_7683 = process.env.AZTEC_GATEWAY_7683 as `0x${string}`
const L2_GATEWAY_7683 = process.env.L2_GATEWAY_7683 as `0x${string}`
const RECIPIENT = process.env.RECIPIENT as `0x${string}`
const TOKEN_IN = process.env.TOKEN_IN as `0x${string}`
const TOKEN_OUT = process.env.TOKEN_OUT as `0x${string}`
const L2_GATEWAY_7683_DOMAIN = parseInt(process.env.L2_GATEWAY_7683_DOMAIN as string)
const ORDER_DATA_TYPE = "0xf00c3bf60c73eb97097f1c9835537da014e0b755fe94b25d7ac8401df66716a0"

async function main(): Promise<void> {
  const pxe = await getPxe()
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: process.env.SECRET_KEY as string,
    salt: process.env.SALT as string,
    pxe,
  })

  await wallet.registerSender(AztecAddress.fromString(AZTEC_GATEWAY_7683))

  const gateway = await Contract.at(
    AztecAddress.fromString(AZTEC_GATEWAY_7683),
    AztecGateway7683ContractArtifact,
    wallet,
  )
  const token = await Contract.at(AztecAddress.fromString(TOKEN_IN), TokenContractArtifact, wallet)

  const amountIn = 100n
  const nonce = Fr.random()
  const witness = await wallet.createAuthWit({
    caller: gateway.address,
    action: token.methods.transfer_to_public(wallet.getAddress(), gateway.address, amountIn, nonce),
  })

  const orderData = new OrderData({
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    recipient: padHex(RECIPIENT),
    inputToken: TOKEN_IN,
    outputToken: padHex(TOKEN_OUT),
    amountIn,
    amountOut: amountIn,
    senderNonce: nonce.toBigInt(),
    originDomain: 999999, // AZTEC_7683_DOMAIN
    destinationDomain: L2_GATEWAY_7683_DOMAIN,
    destinationSettler: padHex(L2_GATEWAY_7683),
    fillDeadline: 2 ** 32 - 1,
    orderType: 1, // PRIVATE_ORDER
    data: padHex("0x00"),
  })

  const tx = await gateway.methods
    .open_private({
      fill_deadline: 2 ** 32 - 1,
      order_data: Array.from(hexToBytes(orderData.encode())),
      order_data_type: Array.from(hexToBytes(ORDER_DATA_TYPE)),
    })
    .with({
      authWitnesses: [witness],
    })
    .send({ fee: { paymentMethod } })
    .wait()

  console.log("Private order opened:", tx.txHash.toString())
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
