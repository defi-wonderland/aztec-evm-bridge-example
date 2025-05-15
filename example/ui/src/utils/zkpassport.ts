import { ZKPassport } from "@zkpassport/sdk"

import type { SolidityVerifierParameters } from "@zkpassport/sdk"

export type GetZkPassportProofParams = {
  onGeneratingProof?: () => void
  onRequestReceived?: () => void
  onProofGenerated?: (proof: unknown) => void
  onUrl: (url: string) => void
  scope: string
}

export const getZkPassportProof = async ({
  onGeneratingProof: _onGeneratingProof,
  onRequestReceived: _onRequestReceived,
  onProofGenerated: _onProofGenerated,
  onUrl,
  scope,
}: GetZkPassportProofParams): Promise<[SolidityVerifierParameters, unknown]> => {
  const zkPassport = new ZKPassport()

  const queryBuilder = await zkPassport.request({
    name: "Aztec EVM bridge",
    logo: "https://zkpassport.id/logo.png",
    purpose: "You must be at least 18 years old",
    scope,
    devMode: true,
    mode: "compressed-evm",
  })

  const { url, onRequestReceived, onGeneratingProof, onProofGenerated, onResult, onReject } = queryBuilder.done()

  queryBuilder.gte("age", 18)
  queryBuilder.done()
  onUrl(url)

  if (_onRequestReceived) onRequestReceived(_onRequestReceived)
  if (_onGeneratingProof) onGeneratingProof(_onGeneratingProof)

  const waitProofGenerated = () =>
    new Promise<SolidityVerifierParameters>((resolve) => {
      onProofGenerated(async (proof) => {
        _onProofGenerated?.(proof)
        const verifierParams = await zkPassport.getSolidityVerifierParameters({
          proof,
          devMode: true,
          scope,
        })
        resolve(verifierParams)
      })
    })

  const waitResult = () =>
    new Promise<unknown>((resolve) => {
      onResult(resolve)
    })

  const waitReject = () =>
    new Promise<never>((_, reject) => {
      onReject(reject)
    })

  return Promise.race([Promise.all([waitProofGenerated(), waitResult()]), waitReject()])
}
