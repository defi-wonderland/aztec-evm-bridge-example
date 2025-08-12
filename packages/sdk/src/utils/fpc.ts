import {
  Fr,
  ContractInstanceWithAddress,
  getContractInstanceFromDeployParams,
  SponsoredFeePaymentMethod,
} from "@aztec/aztec.js"
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC"

const SPONSORED_FPC_SALT = new Fr(0)

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromDeployParams(SponsoredFPCContract.artifact, {
    salt: SPONSORED_FPC_SALT,
  })
}

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address
}

export async function getSponsporedFeePaymentMethod() {
  const sponsoredFPC = await getSponsoredFPCInstance()
  return new SponsoredFeePaymentMethod(sponsoredFPC.address)
}
