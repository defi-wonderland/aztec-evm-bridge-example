# example

This example demonstrates how users can privately deposit and withdraw assets (e.g., ETH) held on Aztec into a secure Vault on Optimism Sepolia. It leverages the confidential ERC-7683-compliant bridge to enable trustless, privacy-preserving transfers between Aztec and Optimism Sepolia. Additionally, it uses zkPassport proofs to enforce eligibility criteria—such as verifying that the user is over 18—without disclosing any personal information.

## 🧱 Project Structure

This project is composed of two main parts:

### 1. `ui/` – Frontend Interface

The `ui` directory contains the user interface, built with the following stack:

- ⚛️ [React](https://reactjs.org/)
- 🧠 [TypeScript](https://www.typescriptlang.org/)
- ⚡ [Vite](https://vitejs.dev/) for fast development and build tooling
- 🍞 [Bun](https://bun.sh/) as the package manager and runtime

### 2. `vault/` – Smart Contracts

The `vault` directory contains the `Vault` contracts deployed on Optimism Sepolia.

## 🚀 Getting Started

### ⚙️ Prerequisites

Before running the app, make sure to set up the Aztec environment by following these steps:

Install the Aztec sandbox, CLI, and required tooling:

```bash
bash -i <(curl -s https://install.aztec.network)
```

Install the correct toolkit version:

```bash
aztec-up 0.86.0
```

Start the sandbox environment:

```bash
aztec start --sandbox
```

### ⚠️ IMPORTANT

Before running the example, make sure the **filler** is up and running.

