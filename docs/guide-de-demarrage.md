# Guide de démarrage

Ce document prend le problème par l'usage : ce qu'il faut comprendre, dans quel
ordre agir, et comment lire ce qui sort. Le [`README`](../README.md) explique
les choix de conception ; les deux se lisent séparément.

Le classeur porte le même guide dans un onglet — menu **Applications tierces >
Guide complet** — pour l'avoir sous la main sans changer d'écran.

---

## Ce qu'il faut comprendre avant de commencer

**Une autorisation ne s'arrête jamais d'elle-même.** Quand un collaborateur
autorise une application tierce, Google lui remet un *jeton*. Ce jeton reste
valable jusqu'à ce que quelqu'un le révoque : ni la fin du projet, ni la fin du
contrat, ni le départ de la personne ne le ferment. C'est la raison d'être de cet
outil.

**Une portée n'est pas une application.** La *portée* (`scope`) est ce que
l'application a le droit de faire. Google les classe en trois niveaux :

| Niveau | Exemple | Ce que cela veut dire |
|---|---|---|
| restreinte | `drive`, `drive.readonly`, toute la famille `gmail.` | accès complet ou en lecture à Gmail ou à **tout** Drive |
| sensible | `calendar`, `documents`, `admin.directory.*` | données personnelles, sans atteindre le niveau restreint |
| basique | `drive.file`, `userinfo.email`, `openid` | identité, ou seulement les fichiers créés par l'application |

Le piège classique : **`drive` et `drive.file` n'ont rien à voir**. Le premier
ouvre tout le Drive de la personne, le second uniquement les fichiers que
l'application a elle-même créés. Confondre les deux, c'est punir la portée la
plus vertueuse — celle qu'on veut voir adopter par les développeurs internes.

**Deux sources, qui ne disent pas la même chose.** Retenez cette distinction,
tout le reste en découle :

| | Le journal | L'inventaire |
|---|---|---|
| Répond à | que s'est-il **passé** ? | qu'est-ce qui **existe** ? |
| Profondeur | 180 jours, pas un de plus | illimitée |
| Donne | dates, autorisations, refus, révocations, volumes | jetons encore valides, et leurs portées |
| Coût | quelques requêtes | **une requête par compte** |

Leur écart est ce qui compte : un jeton actif dont aucune autorisation
n'apparaît au journal a été accordé **avant** la fenêtre. C'est un accès que
personne n'a revu depuis plus de six mois.

---

## Installation, une fois

1. Créer un classeur Google Sheets vide.
2. **Extensions > Apps Script** : le projet créé est lié à ce classeur.
3. Y déposer les fichiers de `apps-script/`, puis remplacer le manifeste —
   ⚙️ Paramètres du projet, cocher *Afficher le fichier manifeste
   « appsscript.json »*.
4. Recharger le classeur. Le menu **Applications tierces** apparaît.

Aucun projet Google Cloud à créer, aucun fichier d'identifiants à distribuer :
les services avancés `AdminReports` et `AdminDirectory` suffisent, et le
manifeste les déclare.

**Le compte qui ouvre le classeur doit disposer du rôle d'administrateur** qui
donne accès aux rapports d'audit et à l'annuaire. Sans lui, le moissonnage
échoue — avec un message qui le dit.

### Vérifier le tenant avant d'investir

Depuis l'éditeur, lancer `sonde(180)`. Elle n'écrit rien et ne modifie rien. Elle
répond à trois questions : le journal OAuth répond-il, sur quelle profondeur, et
les événements portent-ils le volume de données extrait. Si elle échoue, tout le
reste échouera aussi — autant le savoir en trente secondes.

---

## Le déroulé

> **Si vous ne savez plus où vous en êtes**, ouvrez l'assistant : menu
> **Applications tierces > Ouvrir l'assistant**. Le panneau s'installe à droite
> et y reste. Il nomme la prochaine chose à faire — « Relever les jetons
> actifs », « Classer : 12 applications sans décision », « Terminer : 7
> courriels à envoyer » —, explique pourquoi, et la lance après confirmation. Il
> montre aussi, d'un coup d'œil, ce qui est collecté et ce qui ne l'est pas.
>
> Il ne se rafraîchit pas tout seul : l'état ne change que lorsque vous agissez.
> Après une action il se remet à jour ; sinon, le lien « Actualiser l'état » est
> en bas du panneau.
>
> Le déroulé ci-dessous est là pour reprendre la main, pas pour être mémorisé.


### 1. Moissonner le journal

**Menu > Collecter les données > Moissonner le journal d'audit — 180 jours.**

Lit le journal d'audit et remplit les onglets. Peu coûteux : quelques requêtes
pour tout le tenant. Sur un gros parc, la lecture se fait en plusieurs passes
qui s'enchaînent toutes seules — *Où en sont les collectes ?* vous le dira.

À la fin, l'agrégation s'exécute d'elle-même et vous avez déjà un rapport
complet.

### 2. Relever les profils des comptes

**Menu > Collecter les données > Relever les profils des comptes.**

Va chercher dans l'annuaire qui est administrateur, administrateur délégué, ou
suspendu. Rapide — dix-sept pages pour 8 500 comptes — et cela change la lecture
du rapport : une application autorisée par un administrateur délégué n'est pas
dans la même catégorie qu'une autre, et une autorisation portée par un compte
suspendu signale une personne partie dont l'accès est resté ouvert.

Relancer ensuite **Recalculer le rapport** pour que les colonnes se remplissent.

### 3. Inventorier les jetons actifs

**Menu > Collecter les données > Relever les jetons actifs — long…**

C'est l'étape longue : une requête par compte. Elle reprend toute seule jusqu'au
bout ; *Où en sont les collectes ?* donne l'avancement. Un nouvel inventaire
remplace le précédent — les mêler ferait passer pour actifs des jetons révoqués
entre-temps.

C'est elle qui remplit l'onglet **Dormants**, et elle seule.

> **Ce relevé peut être partiel, et il le dit.** Sur plusieurs milliers de
> comptes, quelques appels échouent — un 429, un 503, un compte supprimé pendant
> le parcours. Ils sont repassés une fois automatiquement ; ceux qui résistent
> sont nommés dans l'onglet `_Échecs`, et leur colonne « État du jeton » reste
> **vide** au lieu d'afficher « clos ». Vide veut dire *non mesuré*, jamais *rien
> trouvé*. Le compte de ces comptes figure dans la synthèse. Relancer
> l'inventaire les rattrape.

### 4. Classer

Ouvrir l'onglet **À instruire** : c'est votre file de travail, triée. La colonne
*Motifs* dit pourquoi chaque ligne y est.

Pour chaque application, inscrire un statut dans l'onglet **Décisions** :

| Statut | Ce qu'il engage |
|---|---|
| approuvée | usage légitime et connu ; ne sollicite plus personne |
| tolérée | pas souhaitable, pas assez grave pour agir ; ne sollicite plus |
| à instruire | on ne sait pas encore ; reste dans la file |
| à bloquer | décidé, pas encore appliqué en console |
| bloquée | appliqué |

**Renseignez toujours « Revoir avant ».** Passée cette date, la décision devient
caduque et l'application revient dans la file. Une approbation sans échéance est
une approbation définitive, ce qui n'existe pas en gouvernance des accès.

L'onglet Décisions est le seul que rien ne réécrit : vous pouvez remoissonner
autant que vous voulez, votre classement reste.

Pour présenter une application en comité : sélectionner sa ligne, puis
**Menu > Fiche de l'application sélectionnée**. La fiche s'imprime en PDF depuis
le navigateur. C'est elle qui circule — jamais l'inventaire complet.

### 5. Solliciter

**Menu > Écrire aux autorisants > 1. Préparer le plan d'envoi.** Rien n'est envoyé : un
plan s'écrit dans l'onglet *Sollicitations*, une ligne par personne.

Relire, supprimer les lignes qui n'ont pas lieu d'être, puis **S'envoyer un
exemple de courriel** — c'est le seul moyen de juger le ton et les règles tels
qu'un collègue les recevra.

Enfin **Envoyer pour de bon…**, qui annonce le nombre exact de
destinataires avant de partir.

Avant le premier envoi, ouvrir l'onglet **Modèle** et renseigner au minimum le
champ *Contact* : sans lui, les réponses arrivent dans votre boîte personnelle
plutôt que dans celle de l'équipe.

### 6. Révoquer, pour ce qui a été jugé « à bloquer »

**Menu > Révoquer des accès > 1. Préparer le plan de révocation.** Le plan ne retient que les
applications portant le statut `à bloquer` dans l'onglet Décisions, avec une
décision en vigueur. Une application non classée n'y entre pas : on ne révoque
pas ce qu'on n'a pas jugé.

Relire, puis **Appliquer le plan…**. La confirmation annonce le nombre
exact de jetons. Une décision révisée depuis la préparation est ignorée plutôt
qu'exécutée.

> **Révoquer n'est pas bloquer.** Le jeton disparaît, mais l'utilisateur peut
> réautoriser l'application dans la minute. Allez ensuite la bloquer dans la
> console — *Sécurité > Contrôles des API > Gérer l'accès des applications
> tierces* — puis passez son statut à `bloquée`. Sans ce second geste, vous avez
> poussé la porte sans la fermer.

Relancez l'inventaire après coup pour vérifier ce qui reste ouvert.

---

## Donner à voir sans donner le classeur

Le RSSI, le comité sécurité ou la direction doivent voir l'état du parc sans
recevoir l'inventaire. **Ne partagez pas le classeur en lecture pour cela** : un
lecteur peut en faire une copie et y retrouver les onglets masqués, c'est-à-dire
le journal brut et le relevé des jetons.

Déployez plutôt la vue de consultation, une fois : depuis l'éditeur,
**Déployer > Nouveau déploiement > Application web**, avec *Exécuter en tant
que : moi* et *Accès : votre domaine*.

> **Jamais « toute personne disposant du lien ».** Cette page montre la
> cartographie des accès de votre tenant.

Puis **Menu > Partager la vue de consultation**.

> **« Fonction de script introuvable : doGet »** — le déploiement sert une
> *version figée* du code, pas le code courant. Si la vue a été déployée avant
> l'ajout du fichier `WebApp.gs`, elle ne le verra jamais, quel que soit le
> nombre de `clasp push`. Allez dans *Déployer > Gérer les déploiements*,
> modifiez le déploiement (crayon), choisissez **Version : nouvelle version**,
> puis *Déployer*.

Cette page ne publie que la synthèse, la file de travail et les fiches — **sans
les comptes autorisants**. Elle n'agit sur rien : ni collecte, ni courriel, ni
révocation. C'est précisément ce qui rend acceptable son exécution sous votre
identité.

---

## Lire le rapport sans se tromper

**« État présumé » est une supposition, « Jeton » est un constat.** Le premier
vient du journal, qui ne connaît que 180 jours ; le second vient de
l'inventaire, qui a regardé. Ils sont dans deux colonnes séparées exprès.

**Une colonne vide veut dire « non mesuré », jamais « rien trouvé ».** Si vous
n'avez pas lancé l'inventaire, la colonne *Jeton* est vide : cela ne signifie pas
que les accès sont fermés.

**La priorité est une somme de points, pas une note.** Les poids sont arbitraires
et assumés ; la colonne *Motifs* en donne le détail, précisément pour qu'on
puisse les contester en réunion.

**Les portées hors catalogue sont vos angles morts.** Elles apparaissent en tête
de l'onglet *Portées*, marquées `NON` dans la colonne *Au catalogue ?*. Une
portée inconnue est traitée comme sensible — sous-estimer un accès qu'on n'a pas
classé serait la pire des erreurs. Complétez le catalogue au fur et à mesure.

---

## Ce que l'outil ne fait pas

- **Bloquer une application.** La liste *approuvée / limitée / bloquée* de la
  console d'administration n'est pas pilotable par API. La décision se prend
  ici, la révocation des jetons aussi, mais le blocage se fait en console, sous
  *Sécurité > Contrôles des API*.
- **Voir au-delà de 180 jours dans le journal.** Google ne conserve pas plus
  longtemps. Seul l'inventaire des jetons franchit cette limite.
- **Distinguer un projet Apps Script interne d'un logiciel tiers.** Aucune API ne
  donne l'éditeur ni son statut de vérification. C'est pourquoi le courriel de
  sollicitation pose la question à l'intéressé.

---

## Diffusion du classeur

Ce classeur cartographie les points d'entrée du tenant. Ne le partagez pas plus
largement que vous ne partageriez la console d'administration. Son partage
**est** le contrôle d'accès.

Les onglets dont le nom commence par un souligné contiennent les données brutes
qui justifient le rapport. Ils sont masqués, jamais supprimés : ce sont les
pièces justificatives.

Les actions du menu s'exécutent sous l'identité de qui les déclenche. Une
personne sans droits d'administrateur peut donc lire le rapport, mais pas le
rafraîchir — refus prononcé par Google lui-même, et non par une règle qu'il
aurait fallu écrire.
