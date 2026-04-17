## Général

### Qu'est-ce que BIM ?
BIM est un portefeuille minimaliste pour payer et recevoir en bitcoin, construit sur Starknet. BIM est sans seed : il utilise des passkeys pour authentifier les utilisateurs, il n'y a donc aucune phrase de récupération à sauvegarder.

[En savoir plus sur Starknet.](https://www.starknet.io)

### Qui construit BIM ?
Trois passionnés de Bitcoin et de technologie.

### Que se passe-t-il si BIM cesse de fonctionner ou si nous disparaissons ?
Vous ne pourriez plus accéder à vos fonds via BIM (nous non plus d'ailleurs).

Pour limiter ce risque :

- Utilisez BIM comme **portefeuille de paiement**, pas comme coffre-fort. Si vous recevez un montant important, transférez-le vers un portefeuille plus adapté au stockage long terme. Comme pour votre portefeuille physique, n'y laissez pas toutes vos économies.
- Le code de BIM est source-available : si nous arrêtions un jour d'opérer le service, n'importe qui pourrait le forker et lancer sa propre instance.

### Quels sont les frais ?
Un taux unique de **0,3 %** sur chaque transaction d'envoi. C'est tout.

### Puis-je acheter du bitcoin depuis BIM ?
Non. BIM se concentre uniquement sur les transactions en bitcoin et ne gère pas les monnaies fiat. Vous devez alimenter votre portefeuille BIM depuis un autre portefeuille contenant déjà du bitcoin.

## Paiements

### Comment effectuer mon premier paiement avec BIM ?
BIM ne permet pas d'échanger directement des monnaies fiat contre du bitcoin. Vous devez donc d'abord alimenter votre portefeuille BIM depuis un autre portefeuille Bitcoin que vous possédez (Ledger, Phoenix, Braavos, etc.).

Pour alimenter votre compte :

1. Ouvrez BIM et créez une facture de réception.
2. Payez cette facture depuis votre autre portefeuille.
3. Une fois votre solde BIM positif, vous pouvez commencer à payer.

### Y a-t-il un montant minimum pour recevoir ?
Sur Starknet, il n'y a aucun minimum. Les paiements Lightning nécessitent un minimum de **1 000 sats**, et les paiements Bitcoin on-chain un minimum variable (généralement autour de **10 000 sats**) pour couvrir les frais de swap et de réseau.

### Quelle est la confidentialité de mes paiements sur BIM ?
Les paiements sont pseudonymes : nous ne savons pas qui vous êtes, mais les transferts sont enregistrés en clair sur la blockchain. Nous étudions activement des pistes pour améliorer cet aspect.

### Puis-je annuler un paiement en attente sur BIM ?
Non. Dès que vous signez une transaction, elle est diffusée et irréversible.

## Dépannage

### J'ai perdu mon téléphone. Que puis-je faire ?
Pas grand-chose, sauf si vous avez sauvegardé votre passkey au préalable. C'est pour cette raison que nous recommandons d'utiliser BIM comme portefeuille du quotidien plutôt que comme coffre-fort long terme.

### Qu'est-ce qu'une passkey ?
Une passkey est une clé numérique stockée sur votre téléphone ou votre ordinateur qui remplace entièrement votre mot de passe. Au lieu de taper une longue suite de lettres et de chiffres que vous risquez d'oublier, vous déverrouillez vos comptes comme vous déverrouillez votre téléphone : avec votre **visage (FaceID)**, votre **empreinte digitale** ou votre **code PIN**.

BIM s'appuie sur cette technologie pour sécuriser la connexion au compte et la signature des transactions.

### Comment sauvegarder mes passkeys ?
Vous pouvez utiliser des gestionnaires de mots de passe tels que KeePass, Bitwarden, 1Password ou ProtonPass pour sauvegarder vos passkeys.

### Recevoir ou payer avec BIM échoue systématiquement. Que faire ?
BIM a besoin d'une connexion fiable pour fonctionner correctement. Vérifiez que votre Wi-Fi ou votre 4G/5G est stable et bien configurée, puis réessayez.

### Comment contacter l'équipe ?
Écrivez-nous pour toute demande à **contact@bitcoinismoney.app**.
