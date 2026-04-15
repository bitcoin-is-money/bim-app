# A self-custodial Bitcoin wallet, unlocked by your fingerprint.

BIM (Bitcoin is money) lets anyone send and receive Bitcoin — on-chain, on the Lightning Network, or as WBTC on Starknet — using nothing but a passkey. No seed phrase to write down. No browser extension. No gas to pre-fund.

## Why BIM?

Using Bitcoin as money for day-to-day payments has historically been difficult because of network constraints and complexity.

- Bitcoin doesn't allow the instant transfers required for day-to-day payments;
- Lightning does, but non-custodial Lightning wallets require managing channel liquidity, which often creates poor UX and occasional L1 fees;
- Neither Bitcoin nor Lightning supports the passkey signature scheme.

BIM takes a new path: a **smart-contract wallet on Starknet**, unlocked by **WebAuthn / passkeys** (the same biometric auth your phone and browser already speak). The cryptographic heavy lifting happens inside the Starknet account contract; the user only has to touch a fingerprint sensor.

## License

BIM is licensed under the [GNU General Public License v3.0 or later](https://www.gnu.org/licenses/gpl-3.0.html). That means you're free to use, modify, and redistribute BIM, but derivative works must also be open-source under a compatible license.
