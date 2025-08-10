import { bytesToHex } from "viem"
import { createProof, ProofType } from "@chainsafe/persistent-merkle-tree"
const { ssz } = await import("@lodestar/types")
const { BeaconBlock } = ssz.electra

export const getExecutionStateRootProof = (block: any): { proof: string[]; leaf: string } => {
  const blockView = BeaconBlock.toView(block)
  const path = ["body", "executionPayload", "stateRoot"]
  const pathInfo = blockView.type.getPathInfo(path)
  const proofObj = createProof(blockView.node, {
    type: ProofType.single,
    gindex: pathInfo.gindex,
  }) as any
  const proof = proofObj.witnesses.map((w: Uint8Array) => bytesToHex(w))
  const leaf = bytesToHex(proofObj.leaf as Uint8Array)
  return { proof, leaf }
}
