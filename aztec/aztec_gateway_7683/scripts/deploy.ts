import "dotenv/config"
import { AztecGateway7683Contract } from "../src/artifacts/AztecGateway7683.js"
import { createLogger, EthAddress, Fr, SponsoredFeePaymentMethod } from "@aztec/aztec.js"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"

const PORTAL_ADDRESS = EthAddress.fromString(process.env.FORWARDER as string)
const L2_GATEWAY_7683_DOMAIN = parseInt(process.env.L2_GATEWAY_7683_DOMAIN as string)
const L2_GATEWAY_7683 = EthAddress.fromString(process.env.L2_GATEWAY_7683 as string)

const main = async () => {
  const logger = createLogger("deploy")
  const pxe = await getPxe()
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: process.env.AZTEC_SECRET_KEY as string,
    salt: process.env.AZTEC_KEY_SALT as string,
    pxe,
    paymentMethod,
    deploy: false,
  })

  const gateway = await AztecGateway7683Contract.deploy(wallet, L2_GATEWAY_7683, L2_GATEWAY_7683_DOMAIN, PORTAL_ADDRESS)
    .send({
      fee: { paymentMethod },
    })
    .deployed()

  await pxe.registerContract({
    instance: gateway.instance,
    artifact: AztecGateway7683Contract.artifact,
  })

  logger.info(`gateway deployed: ${gateway.address.toString()}`)
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
