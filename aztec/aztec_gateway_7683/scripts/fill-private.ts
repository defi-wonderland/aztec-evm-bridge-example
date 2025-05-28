import "dotenv/config"
import { AztecAddress, Contract, Fr, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { hexToBytes, padHex } from "viem"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"
import { AztecGateway7683ContractArtifact } from "../src/artifacts/AztecGateway7683.js"
import { OrderData } from "../src/ts/test/OrderData.js"
import { TokenContractArtifact } from "@aztec/noir-contracts.js/Token"
import { poseidon2Hash } from "@aztec/foundation/crypto"

const AZTEC_GATEWAY_7683 = process.env.AZTEC_GATEWAY_7683 as `0x${string}`
const AZTEC_TOKEN = process.env.AZTEC_TOKEN as `0x${string}`
const L2_EVM_TOKEN = process.env.L2_EVM_TOKEN as `0x${string}`
const L2_GATEWAY_7683_DOMAIN = parseInt(process.env.L2_GATEWAY_7683_DOMAIN as string)

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
  const token = await Contract.at(AztecAddress.fromString(AZTEC_TOKEN), TokenContractArtifact, wallet)

  const amountOut = 100n
  const nonce = Fr.random()
  const secret = Fr.random()
  const secretHash = await poseidon2Hash([secret])

  const orderData = new OrderData({
    sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
    recipient: secretHash.toString(),
    inputToken: padHex(L2_EVM_TOKEN),
    outputToken: AZTEC_TOKEN,
    amountIn: amountOut,
    amountOut,
    senderNonce: nonce.toBigInt(),
    originDomain: L2_GATEWAY_7683_DOMAIN,
    destinationDomain: 999999, // AZTEC_7683_DOMAIN
    destinationSettler: gateway.address.toString(),
    fillDeadline: 2 ** 32 - 1,
    orderType: 1, // PRIVATE_ORDER
    data: padHex("0x00"),
  })

  const orderId = await orderData.id()

  const witness = await wallet.createAuthWit({
    caller: gateway.address,
    action: token.methods.transfer_to_public(wallet.getAddress(), gateway.address, amountOut, nonce),
  })

  const receipt = await gateway.methods
    .fill_private(
      Array.from(hexToBytes(orderId.toString())),
      Array.from(hexToBytes(orderData.encode())),
      Array.from(hexToBytes(wallet.getAddress().toString())),
    )
    .with({
      authWitnesses: [witness],
    })
    .send({
      fee: { paymentMethod },
    })
    .wait()

  console.log("order filled:", receipt.txHash.toString())
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
