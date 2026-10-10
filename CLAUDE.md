# Conventions du projet

## Dates et horodatages

**Sheets convertit en objets `Date` les chaînes ISO qu'on lui écrit.** Un
horodatage écrit `2026-05-14T08:00:00.000Z` revient de `getValues()` sous forme
d'objet `Date`, et `String(valeur)` rend alors `Thu May 14 2026 02:00:00
GMT+0200`.

Cela a déjà coûté un défaut en production, et l'affichage n'en était que le
symptôme visible : **ces chaînes se comparent alphabétiquement, sur le nom du
jour**. La période observée et les premières / dernières apparitions étaient
fausses, sans qu'aucune erreur ne s'affiche.

Trois règles, non négociables :

1. **Toute date passe par `jour_()`** (`Commun.gs`), qui accepte une `Date`, une
   chaîne ISO ou n'importe quoi d'autre, et rend toujours `yyyy-MM-dd`.
2. **Jamais de `String(valeur).slice(0, 10)` sur un horodatage.** La règle se
   vérifie d'un grep : hors de `jour_` elle-même, aucun `slice(0, 10)` ne doit
   porter sur une date.
3. **Normaliser à la lecture, jamais à l'écriture.** On ne maîtrise pas ce que
   Sheets fait d'une valeur en la stockant ; on maîtrise ce qu'on en fait en la
   relisant. Cela vaut aussi pour les classeurs déjà remplis.

Corollaire pour le banc d'essai : **il injecte de vrais objets `Date`**. Un faux
classeur qui rend les chaînes qu'on lui a données ne prouve rien — c'est
précisément pourquoi le défaut a survécu à 93 vérifications au vert.

## ES6+

Tout le code est en ES6+ : `const` / `let`, fonctions fléchées, gabarits de
chaîne, déstructuration, `Map` / `Set`. Le moteur V8 les accepte, à condition que
`runtimeVersion` vaille `V8` dans `appsscript.json`. Ne pas retomber sur le style
Rhino sous prétexte qu'il s'agit d'Apps Script.

## Public et privé

L'éditeur Apps Script ne propose au menu d'exécution que les `function`
déclarées. La convention en tire parti :

- **points d'entrée** : `function nom() { … }` — ils apparaissent au menu ;
- **tout l'interne** : `const nom_ = (…) => …` — invisible du menu.

Un jour, l'agrégation exposée en `function` a été lancée à la place du
moissonnage et a échoué sur un onglet vide. La forme du code porte désormais la
distinction.

Les liaisons globales mutables traversent mal les fichiers en V8 : l'état
partagé passe par un objet `const` muté en place — voir `CR_` dans `Commun.gs`.

## Le script est lié au classeur

Il n'est **pas** autonome, et ne doit pas le redevenir. Le rapport vit dans le
classeur qui porte le script, `onOpen()` y pose le menu nativement, et chaque
action s'exécute sous l'identité de qui la déclenche.

Un projet autonome devrait poser un déclencheur installable, lequel s'exécute
sous l'identité de celui qui l'a posé : toute personne à qui l'on partage le
rapport pourrait alors relire le journal d'audit avec des droits
d'administrateur. Ici, un lecteur non administrateur se voit refuser l'accès par
Google lui-même. La bonne défense est celle qu'on n'a pas eu à coder.

## Les deux sources ne disent pas la même chose

Le journal (Reports API) dit ce qui s'est passé sur 180 jours ; l'inventaire
(`Tokens.list`) dit ce qui existe aujourd'hui. Ne jamais présenter l'un pour
l'autre :

- ce que le journal permet de supposer va dans « État présumé » ;
- ce que l'inventaire constate va dans « Jeton » ;
- une colonne vide veut dire « non mesuré », jamais « rien trouvé ».

Toute nouvelle source suit la même règle : une valeur du rapport ne doit jamais
se donner pour plus certaine qu'elle n'est.

## Plan puis application

Toute opération irréversible se fait en deux temps : on écrit le plan dans un
onglet, on le relit, puis on l'applique. Cela vaut pour les sollicitations par
courriel — un message parti ne se rappelle pas — et vaudra pour la révocation
des jetons.

Corollaires appliqués : marquage de l'état **immédiatement** après chaque envoi,
pour qu'une interruption ne produise pas de doublon ; lecture du quota avant de
commencer ; plafond de destinataires qui est un cran d'arrêt, non une limite
technique.

## Le référentiel n'est pas dans le code

Tout ce qui relève du jugement ou de la politique vit dans un onglet éditable —
`Décisions`, `Modèle` — jamais dans une constante. Le code ne produit aucun
jugement : il ajoute les applications nouvelles avec un statut vide et ne
réécrit jamais un statut, un motif, un décideur ni une échéance.

L'onglet `Décisions` est **le seul que l'agrégation ne reconstruit jamais**. On
ne peut pas classer ce qui s'efface au rafraîchissement suivant.

## Ce que le rapport dit, et à qui

L'onglet `Applications` nomme les familles de portées — `drive`, `admin`,
`spreadsheets` — parce que l'administrateur les connaît et les filtre. Le
courriel, lui, les traduit : « l'administration du domaine, vos projets Apps
Script ». On ne demande pas à quelqu'un de juger un accès en lui présentant le
jargon des portées.

Aucune valeur du rapport ne doit se donner pour plus certaine qu'elle n'est. Le
journal ne connaît que la fenêtre demandée : d'où « État **présumé** », et la
valeur « antérieur à la fenêtre » plutôt qu'une date inventée.

## À qui s'adresse cet outil

À des **administrateurs Workspace avertis** — c'est l'hypothèse de conception, et
elle autorise à parler d'`admin.directory.user.security` ou de `client_id` sans
préambule.

Elle n'autorise pas à se taire. Averti ne veut pas dire au fait de ce projet-ci :
la distinction entre le journal et l'inventaire, la raison d'être des échéances de
décision, le piège de `drive` contre `drive.file` ne se devinent pas. Chaque
version doit donc livrer son explication en même temps que sa fonction — dans le
code, dans le `README`, et **dans le classeur lui-même**, où l'onglet `Guide` et
le menu Aide se lisent sans quitter l'écran.

Le destinataire d'un courriel de sollicitation, lui, n'est pas averti du tout :
ce qu'on lui écrit se traduit intégralement.

## Le banc d'essai

```bash
node banc/test.js
```

Il charge les `.gs` dans un contexte où Sheets est simulé et rejoue des
événements de la forme exacte que rend la Reports API. À lancer avant chaque
`clasp push`. Toute correction de défaut s'accompagne du cas qui l'aurait
attrapé — c'est ainsi qu'ont été ajoutés le cas « antérieur à la fenêtre », les
horodatages en objets `Date`, la fusion des applications homonymes et le
chargement dans l'ordre de clasp.

## Ordre de chargement

clasp pousse les fichiers par ordre alphabétique, et Apps Script exécute leur
premier niveau dans cet ordre. **Le premier niveau d'un fichier ne lit jamais un
nom déclaré dans un fichier qui le suit** : `Decision.gs` lisait `ORDRE_STATUTS_`
de `Langues.gs`, et de la v1.5.0 à la v1.7.0 le projet entier ne s'est plus
chargé. Une lecture dans le corps d'une fonction ne pose aucun problème.

Le banc charge les fichiers dans ce même ordre, lu sur le répertoire : jamais
de liste tenue à la main, et pas de `filePushOrder` dans `.clasp.json`.
