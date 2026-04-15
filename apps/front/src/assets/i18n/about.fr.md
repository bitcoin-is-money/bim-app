# Un portefeuille Bitcoin auto-custodial, déverrouillé par votre empreinte digitale.

BIM (Bitcoin is money) permet à chacun d'envoyer et de recevoir des bitcoins — on-chain, sur le Lightning Network ou sous forme de WBTC sur Starknet — avec pour seul outil une passkey. Pas de phrase de récupération à noter. Pas d'extension de navigateur. Pas de gas à provisionner.

## Pourquoi BIM ?

Utiliser Bitcoin comme monnaie pour les paiements du quotidien a toujours été difficile, à cause des contraintes des réseaux et de leur complexité.

- Bitcoin ne permet pas les transferts instantanés nécessaires aux paiements du quotidien ;
- Lightning le permet, mais les portefeuilles Lightning non-custodial imposent de gérer la liquidité des canaux, ce qui crée souvent une mauvaise UX et des frais L1 occasionnels ;
- Ni Bitcoin ni Lightning ne prennent en charge le schéma de signature des passkeys.

BIM emprunte une autre voie : un **portefeuille à contrat intelligent sur Starknet**, déverrouillé par **WebAuthn / passkeys** (la même authentification biométrique que votre téléphone et votre navigateur parlent déjà). Le gros du travail cryptographique a lieu dans le contrat de compte Starknet ; l'utilisateur n'a qu'à poser le doigt sur le capteur.

## Licence

BIM est distribué sous [GNU General Public License v3.0 ou ultérieure](https://www.gnu.org/licenses/gpl-3.0.html). Vous êtes donc libre d'utiliser, de modifier et de redistribuer BIM, mais les travaux dérivés doivent également être open-source sous une licence compatible.
