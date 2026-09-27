# Wheelers Connect — TestFlight

Cette copie est préparée pour un build iOS de production via Expo EAS puis un envoi TestFlight.

## Séquence de démarrage
- image d'introduction : 5 secondes
- affiche sécurité : 3 secondes
- ouverture automatique de l'application

## Contrôles avant envoi
1. `npm ci`
2. `npm run typecheck`
3. `npm run doctor`
4. Vérifier que les migrations SQL du dossier `supabase/migrations` ont été appliquées au projet Supabase.
5. `npx testflight`

Le premier lancement de `npx testflight` demande la connexion Expo et Apple Developer, crée/valide les certificats et le provisioning, construit l'IPA sur EAS puis l'envoie à App Store Connect/TestFlight.

Identifiant iOS actuel : `fr.gardowheelers.wheelersconnect`.
