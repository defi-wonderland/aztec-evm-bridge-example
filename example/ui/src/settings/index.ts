import { optimismSepolia } from "viem/chains"
import { AZTEC_7683_CHAIN_ID } from "./constants"

export default {
  contractAddresses: {
    [optimismSepolia.id]: {
      gateway: process.env.L2_GATEWAY as `0x${string}`,
      vault: process.env.VAULT_ADDRESS as `0x${string}`,
    },
    [AZTEC_7683_CHAIN_ID]: {
      gateway: process.env.AZTEC_GATEWAY_7683 as `0x${string}`,
    },
  },
  assets: [
    {
      targetAddress: "0x74A4A85C611679B73F402B36c0F84A7D2CcdFDa3",
      targetChain: optimismSepolia,
      targetDecimals: 18,
      id: "WETH",
      icon: "./assets/eth.svg",
      name: "Wrapped ETH",
      symbol: "WETH",
      // aztec-wallet deploy TokenContractArtifact --from accounts:test0 --args accounts:test0 WrappedEthereum WETH 18 -a wethtoken
      // aztec-wallet register-contract --from accounts:test0  contracts:wethtoken TokenContractArtifact
      // aztec-wallet send mint_to_public --from accounts:test0 --contract-address contracts:wethtoken --args accounts:test0 100000000000000000000000
      // aztec-wallet send mint_to_private --from accounts:test0 --contract-address contracts:wethtoken --args accounts:test0 accounts:test0 100000000000000000000000000000000
      sourceAddress: "0x14dc46157539075e868e767612419de798360399fa7e11984dfb7ec8d3d70c99",
      sourceChain: {
        name: "Aztec",
        id: AZTEC_7683_CHAIN_ID,
      },
      sourceDecimals: 18,
    },
  ],
}
