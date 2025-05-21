import { AztecAddress, Contract, EthAddress, Fr, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC"
import { TokenContract, TokenContractArtifact } from "@aztec/noir-contracts.js/Token"

import { getSponsoredFPCInstance } from "./fpc.js"
import { getPXEs, getWallet } from "./utils.js"
import { AztecGateway7683Contract, AztecGateway7683ContractArtifact } from "../src/artifacts/AztecGateway7683.js"

const PORTAL_ADDRESS = EthAddress.ZERO

async function main(): Promise<void> {
  const pxes = await getPXEs(["pxe1", "pxe2", "pxe3"])
  const [pxe1, pxe2, pxe3] = pxes
  const sponsoredFPC = await getSponsoredFPCInstance()

  for (const pxe of [pxe1, pxe2, pxe3]) {
    await pxe.registerContract({
      instance: sponsoredFPC,
      artifact: SponsoredFPCContract.artifact,
    })
  }

  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address)
  const user = await getWallet({ paymentMethod, pxe: pxe1 })
  const filler = await getWallet({ paymentMethod, pxe: pxe2 })
  const deployer = await getWallet({ paymentMethod, pxe: pxe2 })

  await user.registerSender(deployer.getAddress())
  await filler.registerSender(deployer.getAddress())

  const gateway = await AztecGateway7683Contract.deploy(deployer, PORTAL_ADDRESS)
    .send({
      contractAddressSalt: Fr.random(),
      universalDeploy: false,
      skipClassRegistration: false,
      skipPublicDeployment: false,
      skipInitialization: false,
      fee: { paymentMethod },
    })
    .deployed()

  const token = await Contract.deploy(deployer, TokenContractArtifact, [deployer.getAddress(), "TOKEN", "TKN", 18])
    .send({ fee: { paymentMethod } })
    .deployed()
  const tokenDeployer = await Contract.at(
    AztecAddress.fromString(token.address.toString()),
    TokenContractArtifact,
    deployer,
  )

  // user and filler must know token and gateway
  for (const pxe of [pxe1, pxe2]) {
    await pxe.registerContract({
      instance: token.instance,
      artifact: TokenContractArtifact,
    })
    await pxe.registerContract({
      instance: gateway.instance,
      artifact: AztecGateway7683ContractArtifact,
    })
  }

  const amount = 1000n * 10n ** 18n
  await tokenDeployer.methods
    .mint_to_private(deployer.getAddress(), user.getAddress(), amount)
    .send({ fee: { paymentMethod } })
    .wait()
  await tokenDeployer.methods.mint_to_public(user.getAddress(), amount).send({ fee: { paymentMethod } }).wait()
  await tokenDeployer.methods.mint_to_public(filler.getAddress(), amount).send({ fee: { paymentMethod } }).wait()
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
