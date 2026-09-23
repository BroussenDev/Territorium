<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/images/TerritoriumLogo.svg">
    <source media="(prefers-color-scheme: light)" srcset="brand/images/TerritoriumLogoLight.svg">
    <img src="brand/images/TerritoriumLogoLight.svg" alt="Territorium" width="420">
  </picture>
</p>

<p align="center">
  <strong>Conquiers le monde, une frontière à la fois.</strong><br>
  Jeu de stratégie territoriale multijoueur en temps réel, directement dans le navigateur.
</p>

<p align="center">
  <a href="https://www.gnu.org/licenses/agpl-3.0"><img src="https://img.shields.io/badge/Code-AGPL%20v3-10b981.svg" alt="License: AGPL v3"></a>
  <a href="https://creativecommons.org/licenses/by-sa/4.0/"><img src="https://img.shields.io/badge/Assets-CC%20BY--SA%204.0-lightgrey.svg" alt="Assets: CC BY-SA 4.0"></a>
  <img src="https://img.shields.io/badge/Node-22-339933.svg" alt="Node 22">
</p>

---

## ✨ Le jeu

- **Stratégie en temps réel** : étends ton territoire case par case et grignote les frontières de tes voisins.
- **Alliances** : forme des pactes, trahis-les au bon moment.
- **Cartes du monde réel** : Europe, Asie, Afrique, Amériques et bien d'autres.
- **Économie et constructions** : villes, ports, défenses, missiles…
- **Solo contre des bots** ou **multijoueur** en salon privé.

## 🚀 Démarrage rapide

Prérequis : [Node.js 22](https://nodejs.org/) et npm.

```bash
git clone https://github.com/BroussenDev/Territorium.git
cd Territorium
npm run inst # installe les dépendances (npm ci) — ne pas utiliser npm install
npm run dev  # client + serveur avec rechargement à chaud
```

Puis ouvre **http://localhost:9000**.

> En local, les erreurs `404` / `ECONNREFUSED` vers `localhost:8787` dans les logs sont normales :
> elles concernent l'API de comptes/cosmétiques, qui n'est pas incluse dans ce dépôt.
> Le mode solo fonctionne sans elle.

## 🛠️ Commandes utiles

| Commande                          | Rôle                                   |
| --------------------------------- | -------------------------------------- |
| `npm run dev`                     | Client + serveur en mode développement |
| `npm test`                        | Toute la suite de tests (Vitest)       |
| `npx vitest NomDuTest --run`      | Un seul fichier / motif de test        |
| `npm run lint` / `npm run format` | Lint (Oxlint + ESLint) / Prettier      |
| `npm run build-prod`              | Build de production                    |

## 🏗️ Structure du projet

```
src/core/     Simulation du jeu, déterministe (tourne dans un Web Worker)
src/client/   Rendu (Pixi.js/WebGL) et interface (Lit + Tailwind CSS 4)
src/server/   Serveur de jeu : salons, relais des actions (Node/Express/ws)
resources/    Cartes, images, traductions (resources/lang/en.json)
brand/        Identité visuelle et sons de Territorium
tests/        Tests Vitest
```

La simulation tourne **sur chaque client** : le serveur ne fait que relayer les actions
des joueurs (voir [docs/Architecture.md](docs/Architecture.md)).

## 📜 Licence et crédits

Territorium est un fork d'[OpenFront](https://github.com/openfrontio/OpenFrontIO),
lui-même issu de [WarFront.io](https://github.com/WarFrontIO). Merci à leurs équipes et contributeurs.

- **Code** : [GNU AGPL v3.0](LICENSE). Toute version modifiée mise en ligne doit publier son code source.
  Conformément à la section 7 de la licence, la mention **« © OpenFront and Contributors »**
  reste visible dans le pied de page et sur l'écran de chargement.
- **Assets du dossier `resources/`** : [CC BY-SA 4.0](LICENSE-ASSETS), attribution « OpenFront ».
- **Dossier `brand/`** : nom, emblème, logos et sons de Territorium, **tous droits réservés**.
  Le nom « Territorium » et ses logos ne peuvent pas être utilisés par un fork ou un autre projet
  (voir [brand/LICENSE](brand/LICENSE)). Les forks sont les bienvenus sous AGPL, avec leur propre nom et leurs propres assets.
  Police [Chakra Petch](brand/fonts/OFL.txt) sous licence SIL OFL 1.1.
  Aucun asset propriétaire d'OpenFront n'est inclus.

Historique complet des licences : [LICENSING.md](LICENSING.md).
