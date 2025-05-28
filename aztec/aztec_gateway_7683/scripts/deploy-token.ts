import "dotenv/config"
import { createLogger, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { TokenContract } from "@aztec/noir-contracts.js/Token"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"

const main = async () => {
  const logger = createLogger("deploy-token")
  const pxe = await getPxe()
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: process.env.AZTEC_SECRET_KEY as string,
    salt: process.env.AZTEC_KEY_SALT as string,
    pxe,
  })

  const token = await TokenContract.deploy(wallet, wallet.getAddress(), "Wrapper Ethereum", "WETH", 18)
    .send({
      fee: { paymentMethod },
    })
    .deployed()

  await token.methods
    .mint_to_private(wallet.getAddress(), wallet.getAddress(), 1000000000000000000n)
    .send({
      fee: { paymentMethod },
    })
    .wait()
  await token.methods
    .mint_to_public(wallet.getAddress(), 1000000000000000000n)
    .send({
      fee: { paymentMethod },
    })
    .wait()

  await pxe.registerContract({
    instance: token.instance,
    artifact: TokenContract.artifact,
  })

  logger.info(`token deployed: ${token.address.toString()}`)
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
