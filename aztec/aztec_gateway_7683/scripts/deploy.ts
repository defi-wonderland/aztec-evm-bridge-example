import "dotenv/config"
import { AztecGateway7683Contract } from "../src/artifacts/AztecGateway7683.js"
import { waitForPXE, EthAddress, Fr, createAztecNodeClient, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { getPXEServiceConfig } from "@aztec/pxe/config"
import { createStore } from "@aztec/kv-store/lmdb"
import { createPXEService } from "@aztec/pxe/server"
import { getSchnorrAccount, SchnorrAccountContractArtifact } from "@aztec/accounts/schnorr"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"

import { getSponsoredFPCInstance } from "./fpc.js"

const PORTAL_ADDRESS = EthAddress.ZERO
const L2_GATEWAY_7673_DOMAIN = process.env.L2_GATEWAY_7673_DOMAIN
const L2_GATEWAY_7683 = EthAddress.fromString(process.env.L2_GATEWAY_7683 as string)

const main = async () => {
  const url = process.env.PXE_URL ?? "https://aztec-alpha-testnet-fullnode.zkv.xyz"
  const node = createAztecNodeClient(url)
  const fullConfig = {
    ...getPXEServiceConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: true,
  }

  const store = await createStore(process.env.PXE_STORE_NAME ?? "pxe-testnet", {
    dataDirectory: "store",
    dataStoreMapSizeKB: 1e6,
  })
  const pxe = await createPXEService(node, fullConfig, true, store)
  await waitForPXE(pxe)

  const fpcContractInstance = await getSponsoredFPCInstance()
  await pxe.registerContract({
    instance: fpcContractInstance,
    artifact: SponsoredFPCContractArtifact,
  })
  const paymentMethod = new SponsoredFeePaymentMethod(fpcContractInstance.address)

  const secretKey = Fr.fromHexString(process.env.PK as string)
  const signingKey = deriveSigningKey(secretKey)
  const account = await getSchnorrAccount(pxe, secretKey, signingKey)
  await account.deploy({ fee: { paymentMethod } }).wait()
  const wallet = await account.getWallet()

  await pxe.registerContract({
    instance: account.getInstance(),
    artifact: SchnorrAccountContractArtifact,
  })

  const gateway = await AztecGateway7683Contract.deploy(wallet, L2_GATEWAY_7683, L2_GATEWAY_7673_DOMAIN, PORTAL_ADDRESS)
    .send({
      fee: { paymentMethod },
    })
    .deployed()
  console.log("gateway:", gateway.address.toString())
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
