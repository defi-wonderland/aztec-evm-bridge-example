import { createLogger, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { TokenContract } from "@aztec/noir-contracts.js/Token"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"

const [
  ,
  ,
  aztecSecretKey,
  aztecSalt,
  tokenName,
  tokenSymbol,
  tokenDecimals,
  pxeUrl = "https://aztec-alpha-testnet-fullnode.zkv.xyz",
] = process.argv

const main = async () => {
  const logger = createLogger("deploy-token")
  const pxe = await getPxe(pxeUrl)
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: aztecSecretKey,
    salt: aztecSalt,
    pxe,
    deploy: false,
  })

  const token = await TokenContract.deploy(wallet, wallet.getAddress(), tokenName, tokenSymbol, parseInt(tokenDecimals))
    .send({
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })

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
