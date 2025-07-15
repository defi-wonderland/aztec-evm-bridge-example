import { AztecAddress, createLogger, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { TokenContract } from "@aztec/noir-contracts.js/Token"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"

const [
  ,
  ,
  aztecSecretKey,
  aztecSalt,
  tokenAddress,
  recipientAddress,
  amountPrivate = "1000000000000000000",
  amountPublic = "1000000000000000000",
  pxeUrl = "https://aztec-alpha-testnet-fullnode.zkv.xyz",
] = process.argv

const main = async () => {
  const logger = createLogger("deploy-token")
  const pxe = await getPxe(pxeUrl)
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: aztecSecretKey as string,
    salt: aztecSalt as string,
    pxe,
    deploy: false,
  })

  const token = await TokenContract.at(AztecAddress.fromString(tokenAddress as string), wallet)

  await token.methods
    .mint_to_private(wallet.getAddress(), AztecAddress.fromString(recipientAddress), BigInt(amountPrivate))
    .send({
      fee: { paymentMethod },
    })
    .wait()
  await token.methods
    .mint_to_public(AztecAddress.fromString(recipientAddress), BigInt(amountPublic))
    .send({
      fee: { paymentMethod },
    })
    .wait()

  await pxe.registerContract({
    instance: token.instance,
    artifact: TokenContract.artifact,
  })

  logger.info(`tokens succesfully minted`)
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
