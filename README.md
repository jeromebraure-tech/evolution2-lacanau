# Evolution2 Lacanau

Application web installable pour enregistrer les séances et les centraliser dans Google Sheets.

## Mise en ligne sur GitHub Pages

1. Créer un dépôt GitHub public.
2. Copier le contenu du dossier `dist` à la racine du dépôt.
3. Dans **Settings > Pages**, choisir **Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Ouvrir l'adresse fournie par GitHub, puis utiliser **Ajouter à l'écran d'accueil** sur le téléphone.

## Google Sheets

1. Créer une Google Sheet, puis ouvrir **Extensions > Apps Script**.
2. Remplacer le code par le contenu de `google-apps-script.gs`.
3. Exécuter `initialiserTableau` une première fois et accepter les autorisations.
4. Déployer comme application web, exécutée en tant que propriétaire, accessible à tous.
5. Coller l'URL `/exec` dans les réglages de l'application.

Pour éviter que chaque moniteur colle cette adresse, renseigner une seule fois `sheetEndpoint` dans `dist/config.js` avant la publication GitHub.

Le responsable autorise un moniteur en remplaçant `EN_ATTENTE` par `ACTIF` dans la feuille `Moniteurs`. `INACTIF` révoque immédiatement les nouveaux envois.

La commande **Evolution2 Lacanau > Générer une facture moniteur** crée un PDF dans Google Drive. Compléter d'abord la feuille `Configuration` et les informations administratives du moniteur.
