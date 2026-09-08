# Deploy from the Supra Move IDE (ide.supra.com)

The Supra Move IDE is a browser IDE that compiles Move on Supra's servers and publishes through the connected wallet. Nothing to install: no Docker, no CLI, no key files. It deploys to **Testnet** and **Mainnet**, and it is the recommended path for a first deploy and for demos.

- IDE: https://ide.supra.com
- Docs: https://docs.supra.com/network/move/dev/supra-move-ide (sub-pages: Project & Files Management, IDE Core Actions, Contract Interactions & Transaction History, Accounts and Balance)

The same Move package deploys from the IDE or from the Docker CLI. Write the package once, following every rule in `SKILL.md`; only the deploy step differs.

---

## What the IDE gives you

| Area | What is there |
|---|---|
| Editor | Monaco-based (VS Code shortcuts), multi-tab, syntax highlighting for Move and TOML, auto-save. Projects live in this browser (IndexedDB) - export a `.zip` to keep them. |
| Projects | **Create a new project**: blank or from a pre-built template. Import / export as `.zip`. Right-click a file for rename / delete. |
| Actions | **Compile**, **Test** (with a filter popup), **Deploy** (plus **Deploy Settings**). Output goes to the read-only **Console**. |
| Accounts | **Connect StarKey**, or **Local Wallets** / **Add Wallet** for an IDE-managed key. |
| Networks | **Testnet** (chain `6`) / **Mainnet** (chain `8`) selector. **Faucet** button on Testnet (50 SUPRA per call). |
| Interact | **Contract Interactions** tab: pick Address, Type (**View** or **Run**), Module, Function, then **View or Run**. |
| History | Transaction list with hash, from, network fee, and a **View on SupraScan** link. |

Deploy submits `0x1::code::publish_package_txn` signed by the connected account. Modules therefore live at **the connected wallet's address**.

---

## Step-by-step: Testnet

1. **Create or import the project.** New project (blank or template), or import the `.zip` of the package you wrote locally. The layout is the standard one: `Move.toml`, `sources/`, `tests/`.
2. **Set the named address.** In `Move.toml`, point your named address at the wallet that will deploy:
   ```toml
   [addresses]
   my_module = "0x<address of the connected StarKey account>"
   ```
   Publishing is signed by that wallet, so the module address and the signer must match. Copy the address from StarKey (or from the IDE account panel) after connecting.
3. **Compile.** Fix anything the Console reports. The compiler rules in `SKILL.md` (no `///`, ASCII only, `(expr as T)`, exact `acquires`) apply exactly as they do in the CLI.
4. **Test** if the package has `#[test]` functions.
5. **Connect StarKey** and make sure the selector shows **Testnet**. If the account is new, click **Faucet**; an account does not exist on-chain until it is funded.
6. **Deploy.** Approve the `publish_package_txn` in StarKey. The Console prints "Deployed successfully" with a SupraScan link (Testnet explorer: https://testnet.suprascan.io).
7. **Call it.** Contract Interactions tab: your address, then **View** for `#[view]` functions (free) or **Run** for entry functions (signed).

## Step-by-step: Mainnet

Same steps, with three differences:

1. Switch the selector to **Mainnet** *before* deploying, and confirm StarKey is on Mainnet (chain `8`).
2. There is **no faucet**. The deploying wallet needs real SUPRA for gas.
3. Pin dependencies. `rev = "dev"` in `Move.toml` tracks a moving branch; for Mainnet pin `rev` to a commit hash (see the warning at the top of `SKILL.md`). For dVRF, switch the interface `subdir` from `supra/testnet` to `supra/mainnet`; for oracles, use the mainnet `dora-interface` path.

Deploy to Testnet again first if the Mainnet package differs in any way from what was tested.

## Upgrading a deployed package

Change the code, keep the same wallet and the same package name, and **Deploy** again. The upgrade policy comes from `Move.toml` (`upgrade_policy = "compatible"` by default; `"immutable"` locks the package forever). Compatible upgrades may add functions and structs but may not remove or change existing public ones - see `references/patterns.md`.

## Move.toml the IDE expects

The IDE generates a starter `Move.toml` for new projects. If you import your own, use the template from `SKILL.md` and make sure:

- `[addresses]` has your named address set to the deploying wallet's address, not a placeholder.
- Every `[dependencies.*]` entry is a git dependency the IDE's compiler can fetch (SupraFramework, AptosTokenObjects, SupraVrf, `core` for oracles). Local `path = "..."` dependencies will not resolve in the browser.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy fails with an address or module-owner error | The named address in `Move.toml` is not the connected wallet. Set it to the wallet's address, recompile, redeploy. |
| "Account not found" or insufficient balance on Testnet | The account has never been funded. Click **Faucet**, wait for the balance to update, retry. |
| Deploy button does nothing | No wallet connected. **Connect StarKey** (or select a Local Wallet) first. |
| Deploy succeeded but the frontend cannot find the module | The frontend points at the other network. `NEXT_PUBLIC_SUPRA_CHAIN_ID` must be `"6"` for Testnet, `"8"` for Mainnet, and the module address must be the deploying wallet's address. |
| Compiles in the IDE but not in the CLI (or the reverse) | Most likely a different framework `rev`. Pin `rev` to the same commit in both. |
| Project disappeared | Projects are stored in this browser's IndexedDB. Export a `.zip` after every session you care about. |

## When to use the CLI instead

- CI pipelines and scripted deploys (`scripts/deploy.sh`).
- Supra Automation registration, which is documented for the CLI (`supra move automation register`).
- Anything that needs a key profile in a script rather than a wallet approval per transaction.

Both paths produce the same on-chain result. A package deployed from the IDE can be upgraded from the CLI and vice versa, as long as the same account signs.
