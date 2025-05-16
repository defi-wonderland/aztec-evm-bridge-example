# ui

This is a simple website that allows users to privately deposit their ETH (held on Aztec) into a Vault on Ethereum. The process uses an ERC-7683-based bridge and leverages zkPassport to prove that the user is at least 18 years old.

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

Navigate to `src/settings`, run the Aztec deployment scripts, and replace the token address in the code with the one just deployed.

Create a `.env` file in the project root and populate it using the provided `.env.example` as a reference:

```bash
cp .env.example .env
```

### Install Dependencies

```bash
bun install
```

### Start the Development Server

```bash
bun dev
```

### Build for Production

```bash
bun run build
```