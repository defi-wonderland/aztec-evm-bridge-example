# Aztec-EVM Bridge

## Overview

The Aztec-EVM Bridge is a privacy-preserving, trust-minimized cross-chain intent execution framework that facilitates secure transactions between the Aztec Network and Ethereum Virtual Machine (EVM)-compatible Layer 2 (L2) solutions, such as Optimism. This project aligns with the proposal outlined in the Aztec Network forum: [Confidential Cross-Chain Bridging: Enabling Private and Trust-Minimized Interoperability for Aztec](https://forum.aztec.network/t/confidential-cross-chain-bridging-enabling-private-and-trust-minimized-interoperability-for-aztec/7523).

## Features

- **Privacy-Preserving Transactions**: Utilizes Aztec's zero-knowledge proofs to ensure transaction confidentiality.
- **Trust-Minimized Execution**: Implements a solver-based model where solvers fulfill intents and execute cross-chain transactions without centralized intermediaries.
- **Cross-Chain Interoperability**: Designed to be compatible with any EVM L2 that settles on Ethereum, facilitating broad adoption.
- **Support for Public and Private Intents**: Accommodates both public and private transaction intents, enhancing flexibility and user control.

## Architecture

The framework leverages ERC-7683 intents and includes a Forwarder contract on Ethereum to ensure verifiable cross-chain settlement. The solver-based model operates as follows:

- **Private Intents**:
  - *EVM to Aztec*: Solvers lock funds on Aztec; users claim them privately using a secret, triggering settlement verification through storage proofs.
  - *Aztec to EVM*: Solvers advance funds on the destination L2; the Forwarder contract verifies settlement before solvers can claim reimbursement on Aztec.

- **Public Intents**:
  - *EVM to Aztec*: Solvers execute intent orders by transferring funds on the destination chain and verify fulfillment using storage proofs against Ethereum block headers.
  - *Aztec to EVM*: Solvers record a commitment in the ERC-7683 contract on the L2; the Forwarder contract validates this against the L2 state root before allowing reimbursement on Aztec.