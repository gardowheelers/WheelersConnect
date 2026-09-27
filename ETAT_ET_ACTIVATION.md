# Wheelers Connect — état vérifiable de cette version

## Ajouts de cette session

- Administration : compteurs serveur des comptes, profils synchronisés, sorties publiées, participations et comptes ayant une connexion récente (7 jours). Ce dernier compteur n'est pas un compteur de présence en ligne.
- Journal anonyme des créations/suppressions de comptes, connexions, publications/retraits/mises à jour de sorties, inscriptions/retraits de participations et synchronisations.
- Le tableau de bord lit les données toutes les 10 secondes lorsqu'il est ouvert au premier plan. Il ne produit pas de notifications push.
- Recherche des membres et sorties de la communauté, par nom, pseudo, ville, titre, description et type ; recherche insensible aux accents. Elle porte sur les lignes chargées par les API existantes, pas encore sur un index paginé de toute une grande communauté.
- Accès depuis un résultat à la fiche de sortie ou au destinataire de messagerie.
- Envoi protégé contre les doubles appuis, brouillons séparés par destinataire et conservés en cas d'échec ; erreur visible dans la conversation.
- Les requêtes périodiques des messages s'arrêtent en arrière-plan ou en quittant l'écran.

## Tests reproductibles, sans toucher au serveur réel

Depuis le dossier du projet :

```sh
npm ci
npm run typecheck
npm run test:database
npm run test:ui
npm run preflight
npx expo export --platform all --output-dir dist-verified
```

Les tests de base utilisent un PostgreSQL jetable en mémoire (PGlite), avec des rôles simulant Supabase. Ils couvrent les migrations, refus d'accès, impossibilité de s'attribuer les droits, compteurs, événements et révocation. Les tests de composants simulent le pont natif : ce ne sont pas des essais tactiles sur un véritable iPhone.

## Activation serveur encore nécessaire

Ne pas remettre une base existante à zéro. Ne pas rejouer les migrations déjà appliquées.

1. Vérifier l'état des trois migrations existantes dans le projet Supabase.
2. Appliquer uniquement la nouvelle migration `202609120004_admin_dashboard.sql` si elle n'est pas encore installée. Elle ajoute les tables et fonctions ; elle ne supprime pas les données existantes.
3. Vérifier l'identité du compte de Stéphane dans Authentication / Users. Un opérateur autorisé de Supabase doit ajouter cet UUID précis à `public.app_admins`. Ne pas utiliser une adresse supposée, un prénom ou une clé publique pour accorder les droits. Aucune attribution automatique n'est incluse.
4. Tester deux comptes : l'administrateur doit voir les chiffres ; un membre ordinaire doit recevoir un refus. Le journal commence à l'installation et ne reconstitue pas le passé.
5. Tester la création d'une sortie et l'inscription depuis un second appareil. Vérifier les événements depuis Mon compte > Espace administrateur.

La clé publique embarquée sert à l'application, pas à installer des migrations ni à attribuer les droits. Aucun secret d'administration n'a été ajouté. Les fonctions privilégiées vérifient l'identité côté serveur. Les messages privés ne sont pas lus par le tableau de bord.

Le journal conserve uniquement le type et la date, sans identité ni contenu. Avant un lancement public, définir sa durée de conservation et une purge serveur adaptée au volume. Les suppressions en cascade de sorties/comptes peuvent produire des événements de retrait de participation.

## Ce qui n'est PAS terminé ni déployé

- Activation de la migration sur le vrai Supabase et attribution vérifiée du rôle administrateur.
- Notifications push lorsque l'application est fermée et chaîne d'envoi serveur.
- Carte géographique avec consentement aux positions ; l'écran actuel est un annuaire.
- Dons : aucun lien de paiement bénéficiaire vérifié n'a été fourni, aucun encaissement n'est activé.
- Régie publicitaire administrable, signalements/modération et gestion complète des comptes.
- Traduction intégrale des écrans : la base multilingue existante ne traduit pas encore tous les textes, notamment les nouveaux écrans.
- Parcours de récupération de mot de passe, suppression de compte et validation de lancement public.
- Publication TestFlight/App Store/Google Play et tests sur appareils réels.

Un export réussi prouve la compilation, pas le fonctionnement de chaque parcours sur le serveur de production. Aucun pourcentage global fiable n'est déduit des exports.

## Sources techniques consultées

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [Supabase — contrôles d'accès par ligne](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Corrections du 12/09/2026 — sécurité et compte
- Suppression sécurisée du compte depuis l'écran Mon compte via `delete_my_account()`.
- Bouton Administration visible uniquement après vérification serveur du rôle administrateur.
- Règles RLS des sorties et messages optimisées avec `(select auth.uid())`.
- Inscription à une sortie refusée pour l'organisateur et lorsque la sortie est complète.
- Index d'organisateur ajouté pour les sorties communautaires.
- Exécution directe de `rls_auto_enable()` retirée aux rôles clients.
- Migrations locales alignées avec les modifications déjà appliquées au projet Supabase.

## 2026-09-12 — Récupération de mot de passe mobile
- `Mot de passe oublié ?` envoie maintenant vers `wheelersconnect://reset-password`.
- Nouvel écran `reset-password` : récupération de session depuis le lien Supabase, saisie et confirmation du nouveau mot de passe, puis `auth.updateUser`.
- Prise en charge des liens implicites (`access_token` / `refresh_token`) et du code PKCE (`code`).
- L'introduction est ignorée lorsqu'un lien de récupération ouvre directement l'application.
- Traductions FR / EN / PT / ES ajoutées pour cet écran.
- À finaliser dans la configuration Auth Supabase avant test réel : autoriser l'URL de redirection `wheelersconnect://reset-password` (ou le motif de schéma correspondant).
- Le typecheck complet n'a pas pu être exécuté dans cet environnement car `node_modules/.bin/tsc` n'est pas présent dans l'archive.


## Contrôle final du 12/09/2026 — version 95 %
- Audit syntaxique de 38 fichiers TypeScript/TSX : aucune erreur de syntaxe.
- Écran Sorties internationalisé en français, anglais, portugais et espagnol.
- 149 clés de traduction présentes dans chacune des quatre langues, sans clé manquante sur l'écran Sorties.
- Audit Supabase relancé : les tables administrateur restent volontairement sans politique d'accès direct et passent par les RPC protégées.
- Les avertissements SECURITY DEFINER correspondent aux RPC nécessaires à l'application et doivent conserver leurs contrôles d'identité internes.
- Protection Supabase contre les mots de passe compromis encore à activer dans la configuration Auth avant lancement public.
- Les tests complets Expo/React nécessitent une installation node_modules complète ; l'environnement de construction actuel ne permet pas de la terminer.


## Finition du 12/09/2026 — version 98 %
- Accueil, Communauté et Profil raccordés au système multilingue FR/EN/PT/ES.
- Contrôle syntaxique de 38 fichiers TypeScript/TSX : aucune erreur de syntaxe.
- Dictionnaires de traduction alignés dans les quatre langues ; contrôle automatique des clés utilisées.
- Les derniers points avant 100 % nécessitent des validations externes/réelles : configuration Auth Supabase (URL de récupération + protection des mots de passe compromis), installation complète des dépendances et essai sur appareil iOS/Android.


## Finition locale du 12/09/2026 — version 99 %
- Accueil, Communauté, Profil et messages de compte internationalisés FR/EN/PT/ES.
- 240 clés de traduction alignées dans les quatre langues.
- Contrôle syntaxique global des 38 fichiers TypeScript/TSX : aucune erreur.
- Les éléments restant avant validation 100 % sont externes à la finition locale : configuration Auth Supabase, installation complète des dépendances et test réel iOS/Android.
