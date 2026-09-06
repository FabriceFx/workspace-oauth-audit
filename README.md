[English version below](#english-version)

# Audit des applications tierces et de l'IA fantôme

Inventorie **toutes les applications tierces connectées aux comptes de votre
tenant Google Workspace**, avec pour chacune : les portées obtenues, qui les a
autorisées, quand, et **quel volume de données elles ont réellement extrait**.

Objectif : rendre visible ce que la console d'administration montre mal — la
prolifération d'outils, en particulier d'outils d'IA, branchés sur Drive et
Gmail par les collaborateurs eux-mêmes.

## Par où commencer

Pour **installer et utiliser** l'outil : [`docs/guide-de-demarrage.md`](docs/guide-de-demarrage.md).
Il prend le problème par l'usage — ce qu'il faut comprendre, dans quel ordre
agir, comment lire ce qui sort. Le même guide vit dans le classeur, onglet
`Guide`, pour l'avoir sous la main sans changer d'écran.

Le présent document explique les **choix de conception** : ce qu'on a écarté, ce
que chaque décision coûte, et pourquoi. Les deux se lisent séparément.

## À qui cet outil s'adresse, et ce que cela n'excuse pas

À des administrateurs Workspace avertis. C'est l'hypothèse de conception, et
elle autorise à parler d'`admin.directory.user.security` ou de `client_id` sans
préambule.

**Elle n'autorise pas à se taire.** Averti ne veut pas dire au fait de ce
projet-ci : la distinction entre le journal et l'inventaire, la raison d'être des
échéances de décision, le piège de `drive` contre `drive.file` ne se devinent
pas. Un expert privé d'explication reconstruit un raisonnement approximatif, et
décide sur cette approximation.

L'explication se donne donc à trois endroits, et aucun ne dispense des autres :
le **code**, qui dit pourquoi et non quoi ; la **documentation**, ce README pour
la conception et le guide de démarrage pour l'usage ; l'**interface**, où
l'onglet `Guide`, l'entrée *Aide* du menu et les messages d'erreur — qui disent
quoi faire ensuite plutôt que ce qui a échoué — se lisent sans quitter l'écran.

Le destinataire d'un courriel de sollicitation, lui, n'est pas averti du tout :
ce qu'on lui écrit se traduit intégralement.

## Le constat

Autoriser une application prend un clic. Elle garde son accès jusqu'à ce que
quelqu'un le révoque — c'est-à-dire jamais. La console admin liste bien les
applications sous *Sécurité > Contrôles des API*, mais elle ne répond à aucune
des questions qu'un RSSI pose réellement :

- combien de personnes ont connecté cette application, et lesquelles ?
- depuis quand, et à la demande de qui ?
- quelles portées exactement, et sur quels services ?
- **combien d'octets cette application a-t-elle effectivement lus le mois dernier ?**
- un compte à privilèges figure-t-il parmi les autorisants ?

La dernière question est celle qui fait basculer un comité sécurité. La console
ne sait pas y répondre ; le journal d'audit, si.

## Périmètre

Le livrable est **un outil d'audit et de révocation à l'échelle du tenant**,
utilisé par un administrateur. Contrairement à l'audit des partages Drive, il
n'y a pas de version « chaque utilisateur voit la sienne » : les données sont
tenant-wide et l'audience est l'équipe IT/sécurité.

**Dans le périmètre**
- inventaire des jetons OAuth actifs, tous utilisateurs
- historique des autorisations, refus et révocations sur 6 mois glissants
- volumétrie d'accès par application (octets, méthodes API appelées)
- scoring de risque et classement des applications
- révocation de masse, en plan puis application
- restitution dans une Feuille dont l'ACL fait le contrôle d'accès — voir
  « Livraison du résultat »

**Hors périmètre**
- la modification de la liste *approuvées / limitées / bloquées* de la console —
  voir « Limites assumées »
- les extensions Chrome (autre journal, autre projet)
- les modules complémentaires Marketplace installés par l'admin pour tout le
  domaine, qui ne passent pas par un jeton utilisateur

## Deux sources, et il en faut deux

C'est le point d'architecture central. Ni l'une ni l'autre ne suffit.

| | `Directory API` — `users.tokens.list` | `Reports API` — application `token` |
|---|---|---|
| Donne | l'**état actuel** : quels jetons existent | l'**historique** : autorisations, refus, révocations, appels |
| Champs | `clientId`, `displayText`, `scopes[]`, `anonymous`, `nativeApp` | `app_name`, `client_id`, `client_type`, `scope`, `scope_data`, `requester_email`, `api_name`, `method_name`, `num_response_bytes`, `product_bucket` |
| Horodatage | **aucun** | oui |
| Profondeur | illimitée | **6 mois**, latence de quelques heures |
| Coût d'appel | 1 requête **par utilisateur** | requêtes paginées globales |

Le croisement produit l'information la plus utile de l'outil : **un jeton actif
sans trace d'autorisation dans les 6 derniers mois est un accès dormant de plus
de six mois** — statistiquement les plus oubliés, donc les plus à révoquer.

**Les deux sources ne coûtent pas le même prix.** Le journal s'interroge
globalement — `activity/users/all/applications/token` — soit quelques dizaines
de requêtes paginées pour tout le tenant. L'inventaire, lui, se paie une requête
par compte : **8 500 requêtes**. C'est un rapport de un à cent, et il dicte
l'ordre de construction : le journal d'abord, l'inventaire ensuite et ciblé sur
les applications à enjeu, pour lever les jetons antérieurs à la fenêtre de
6 mois.

Événements disponibles côté journal : `authorize`, `deny`, `request`, `revoke`,
et `activity` — ce dernier portant `num_response_bytes`, d'où la volumétrie.

## Portées OAuth nécessaires

| Portée | Pour quoi | Écriture ? |
|---|---|---|
| `admin.directory.user.readonly` | énumérer les comptes | non |
| `admin.directory.user.security` | lire **et révoquer** les jetons | **oui** |
| `admin.reports.audit.readonly` | journal OAuth | non |
| `spreadsheets` *(optionnel)* | export Sheets | oui, sur un fichier créé par l'outil |

`admin.directory.user.security` est la seule portée sensible : elle porte à la
fois la lecture et la suppression des jetons, sans variante lecture seule. Un
mode `--lecture-seule` refusant tout appel `DELETE` est donc appliqué **dans
l'outil**, et activé par défaut.

Pas de compte de service nécessaire : l'outil s'exécute sous l'identité d'un
administrateur disposant du rôle délégué adéquat.

## Contraintes et limites assumées

**Pas d'API pour le contrôle d'accès aux applications.** La liste
*approuvée / limitée / bloquée* de la console n'est pas exposée
programmatiquement. L'outil produit donc la décision et la liste à appliquer,
plus la révocation des jetons existants — mais poser le blocage préventif reste
un geste manuel en console. À vérifier périodiquement : Google peut ouvrir cette
API.

**Révoquer n'est pas bloquer.** `tokens.delete` supprime l'accès en cours ;
l'utilisateur peut réautoriser l'application dans la minute. La révocation seule
est un pansement — elle ne vaut que doublée du blocage en console, ou d'un
changement de politique. L'outil le dit explicitement dans son rapport.

**8 500 comptes : la contrainte ne mord que sur l'inventaire.** Le journal
s'interroge globalement et tient sans difficulté dans une exécution Apps Script.
L'inventaire, lui, se paie une requête par compte pour `tokens.list`, contre un
plafond d'exécution de 6 minutes et sans parallélisme possible en Apps Script.
Même au quota maximal de l'API Directory — 2 400 requêtes par minute et par
projet — le plancher théorique est de 3,5 minutes, sans marge pour la latence
réelle ni les rejeux.

Conséquence : **tout jusqu'à la v0.2 se fait sans réserve.** À partir de la
v0.3, l'inventaire demande un moissonnage par déclencheurs successifs avec
reprise d'état — la mécanique déjà éprouvée dans `gdrive-shares-audit` et dans
la file d'attente de la passerelle JSM. C'est du terrain connu, et c'est le
seul endroit du projet où le plafond des 6 minutes se paie.

**Disponibilité du journal OAuth selon l'édition.** Le journal est exploité par
l'outil de recherche de sécurité, réservé à certaines éditions. L'accès au même
journal par la Reports API paraît plus largement ouvert, mais **cela se vérifie
sur le tenant avant tout développement** — d'où la v0.1 ci-dessous. Si le
journal n'est pas accessible, l'outil perd l'historique et la volumétrie, et se
réduit à l'inventaire : il faut le savoir avant, pas après.

## Livraison du résultat

**Ce rapport n'a pas le statut de celui de l'audit Drive.** Là, chaque
utilisateur ouvrait une URL et ne voyait que son propre périmètre : le document
n'existait que pour lui. Ici, un seul document liste, pour 8 500 personnes, les
applications qu'elles ont connectées et les portées qu'elles ont accordées.
C'est une cartographie des points d'entrée du tenant — exactement ce qu'un
attaquant demanderait en premier.

Cela commande trois décisions.

**Pas de fichier HTML autonome téléchargeable.** C'est le format de l'audit
Drive, et il serait ici une faute : un fichier sorti de Workspace n'a plus
d'ACL, plus de journal d'accès, plus de révocation possible. Il vit dans des
dossiers de téléchargement et des pièces jointes, indéfiniment. L'ironie serait
complète pour un outil dont l'objet est de traquer les copies non maîtrisées.

**La Feuille est le livrable.** Elle est déjà le magasin — le moissonnage de la
v0.3 y écrit son état — donc en faire aussi la restitution évite un second
format à tenir. Son ACL est le contrôle d'accès, son historique de versions
donne la traçabilité, et elle se filtre et se trie sans qu'on ait à coder quoi
que ce soit. Quatre onglets, sur la logique de l'export à trois feuilles de
l'audit Drive :

| Onglet | Une ligne par | Sert à |
|---|---|---|
| Synthèse | palier de risque | la photographie, et le chiffre qu'on cite |
| Applications | application | décider : garder, restreindre, bloquer |
| Autorisants | couple compte × application | agir, et repérer les comptes à privilèges |
| Portées | portée demandée | comprendre le score, et le contester |

**Le tableau de bord ne détient rien.** En v1.0, une interface `HtmlService` lit
la Feuille et n'en garde pas de copie — filtres, tri, fiche par application.
Déployée en `executeAs: USER_DEPLOYING` avec `access: MYSELF` ou un groupe
nommé : **jamais `DOMAIN`**, contrairement à l'audit Drive où c'était le bon
choix. Si l'interface tombe, la Feuille reste ; l'inverse n'est pas vrai.

**Ce qui circule est la fiche, pas l'inventaire.** Pour un comité sécurité, on
exporte une fiche par application — portées, autorisants, volumétrie, score et
son calcul — en PDF depuis le tableau de bord. C'est ce document-là qu'on envoie.
L'inventaire complet, lui, ne quitte pas la Feuille.

**Le courriel notifie, il ne transporte pas.** La détection de dérive (v2.0)
écrit « 3 nouvelles applications depuis lundi, dont 1 au palier critique » et un
lien. Jamais la liste dans le corps du message : une boîte aux lettres n'est pas
un coffre, et les messages se transfèrent.

## Principes de conception

**Le référentiel n'est pas dans le code.** Le catalogue des portées et leur
sensibilité, les signatures de fournisseurs d'IA, les applications approuvées
par l'entreprise : des fichiers éditables, sur le modèle des
`domaines-internes.txt` de l'audit Drive. Ajouter un fournisseur d'IA ne demande
aucun développement.

**Plan puis application.** Toute révocation de masse est d'abord simulée. Le
plan liste les couples utilisateur × application visés, il est exporté et
validé, puis appliqué en rejouant la résolution : si un jeton a disparu ou
apparu entre-temps, on ne s'exécute pas sur une base périmée.

**Le score explique son calcul.** Un score de risque non justifié ne survit pas
à la première contestation en réunion. Chaque note affiche ses composantes et le
fait qui l'a déclenchée.

**Aucune donnée ne sort.** Rapport HTML autonome, ouvert localement, comme
l'audit Drive.

## Scoring de risque — première formulation

| Composante | Ce qui la nourrit |
|---|---|
| Sensibilité des portées | `admin.*`, Gmail ou Drive en accès complet = maximum ; lecture seule en dessous ; `drive.file`, agenda, profil, en bas |
| Étendue | nombre d'autorisants, **et présence de comptes à privilèges parmi eux** |
| Volumétrie | octets extraits sur 30 jours, via les événements `activity` |
| Confiance | éditeur vérifié, présence Marketplace, `anonymous`, `nativeApp`, `client_type` |
| Statut IA | correspondance avec le référentiel de signatures |
| Fraîcheur | dernier accès observé ; jeton actif sans autorisation tracée sur 6 mois |

Sortie en quatre paliers : **critique / élevé / modéré / toléré**, le palier
« toléré » étant celui du référentiel d'applications approuvées.

## Architecture

**Apps Script, et rien d'autre** — la contrainte qui s'applique déjà à la
passerelle JSM : pas de déploiement hors Workspace.

**Le script est lié au classeur**, non autonome. C'est le choix structurant :
le rapport vit là où on le consulte, `onOpen()` y pose le menu nativement, et
chaque action s'exécute sous l'identité de qui la déclenche. Un projet autonome
aurait dû créer un classeur puis y poser un déclencheur installable — lequel
s'exécute sous l'identité de celui qui l'a posé : toute personne à qui l'on
partage le rapport aurait alors pu relire le journal d'audit avec des droits
d'administrateur. Ici, un lecteur qui n'est pas administrateur se voit refuser
l'accès par Google lui-même. La bonne défense est celle qu'on n'a pas eu à
coder.

- `apps-script/` — services avancés `AdminReports` et `AdminDirectory`. Aucun
  projet GCP à créer, aucun `credentials.json` à distribuer.
- Code en **ES6+** : `const`/`let`, fonctions fléchées, gabarits de chaîne,
  `Map`/`Set`. Le moteur V8 d'Apps Script les accepte tous.

**Une convention tient lieu de portée.** Les points d'entrée sont des `function`
déclarées, l'interne s'écrit `const nom_ = (…) => …`. L'éditeur ne proposant au
menu d'exécution que les `function`, la séparation public/privé se lit dans la
forme même du code — et l'on ne lance plus par mégarde une fonction interne.

Il n'y a pas de seconde implémentation. Une variante Python n'apporterait que la
vitesse sur l'inventaire et l'historisation longue, au prix de deux chemins qui
divergeraient à la première correction.

Modules pressentis, sur le découpage de la passerelle : `Journal` (Reports),
`Inventaire` (jetons), `Correlation` (croisement des deux sources), `Catalogue`
(portées et signatures), `Score`, `Plan` / `Application` (révocation), `Rapport`,
`Export`, et `FileAttente` (moissonnage avec reprise) à partir de la v0.3.

## Découpage des versions

| Version | Contenu | Ce qu'elle prouve |
|---|---|---|
| ✅ **0.1** | sonde : le journal `token` répond-il sur ce tenant ? volumétrie brute, applications distinctes, coût mesuré de l'énumération | la faisabilité, avant d'investir |
| ✅ **0.2** | le journal seul : applications, autorisants, dates, révocations ; restitution en quatre onglets | un rapport complet pour quelques dizaines de requêtes |
| ✅ **0.3** | sollicitation des autorisants : plan, courriel, règles de nommage Apps Script | l'audit cesse d'être un constat et devient une démarche |
| ✅ **0.4** | référentiel de décisions qui survit aux campagnes ; profils des comptes autorisants | le classement devient possible, et cumulatif |
| ✅ **0.5** | catalogue de sensibilité des portées, file « à instruire », priorité expliquée | on sait par où commencer |
| ✅ **0.6** | inventaire des jetons actifs sur les 8 500 comptes ; croisement des deux sources | les accès dormants de plus de 6 mois apparaissent |
| ✅ **0.7** | volumétrie par application et par service, sur deux fenêtres | l'argument qui fait décider |
| ✅ **1.0** | guide dans le classeur, guide de démarrage, fiche imprimable, menu réorganisé | le livrable |
| ✅ **1.1** | révocation en plan puis application | on passe du constat à l'acte |
| ✅ **1.2** | vue web de consultation, en lecture seule | il y a enfin quelque chose à montrer à qui n'a pas le classeur |
| ✅ **1.3** | menu qui dit lui-même la prochaine étape | on ne se perd plus dans ses propres actions |
| ✅ **1.4** | bilinguisme de ce qui sort du classeur — courriel, vue, fiche | on peut écrire à qui ne lit pas le français |
| **1.5** | bilinguisme du classeur — menu, dialogues, guide, onglets et colonnes | l'outil lui-même se lit en anglais |
| **2.0** | historisation au-delà des 6 mois, détection de dérive, nouvelle application signalée | la surveillance continue |

La v0.1 est un script de quelques dizaines de lignes. Elle est là pour tuer le
projet tôt s'il doit l'être.

## Mise en œuvre

Créer un classeur vide, puis **Extensions > Apps Script** : le projet ainsi
créé est lié à ce classeur. Y déposer les fichiers, remplacer le manifeste,
recharger le classeur. Aucun projet GCP, aucun `credentials.json` : les services
avancés `AdminReports` et `AdminDirectory` suffisent, et le manifeste les
déclare.

Le classeur doit être ouvert par un compte disposant du rôle d'administrateur
qui donne accès aux rapports d'audit — sans quoi le moissonnage échouera, avec
un message qui le dit.

| Fichier | Rôle |
|---|---|
| `Commun.gs` | constantes et fonctions partagées |
| `Sonde.gs` | v0.1 — le journal répond-il, et que contient-il |
| `Journal.gs` | v0.2 — moissonnage du journal, avec reprise |
| `Feuille.gs` | v0.2 — agrégation en quatre onglets |
| `Menu.gs` | v0.2 — menu du classeur |
| `Sollicitation.gs` | v0.3 — courriels aux autorisants |
| `Decision.gs` | v0.4 — référentiel de classement |
| `Comptes.gs` | v0.4 — profils des comptes, depuis l'annuaire |
| `Portees.gs` | v0.5 — catalogue de sensibilité, file de travail |
| `Inventaire.gs` | v0.6 — relevé des jetons actifs, accès dormants |
| `Volumetrie.gs` | v0.7 — ce que les applications extraient réellement |
| `Guide.gs` | v1.0 — le guide dans le classeur, et l'aide du menu |
| `Fiche.gs` | v1.0 — la fiche d'une application, imprimable |
| `Revocation.gs` | v1.1 — révocation, en plan puis application |
| `WebApp.gs` | v1.2 — vue de consultation, en lecture seule |
| `Langues.gs` | v1.4 — réglages de langue et dictionnaire |
| `banc/test.js` | banc d'essai hors Google, `node banc/test.js` |

Tout se pilote depuis le menu **Applications tierces** du classeur. Depuis
l'éditeur, les mêmes points d'entrée :

```
sonde(180)                    vérifier le tenant, sans rien écrire
moissonner(180)               moissonner le journal, puis agréger
etatMoisson()                 où en est la campagne
annulerMoisson()              abandonner ; le moissonné reste
reagreger()                   rejouer l'agrégation sans redemander le journal
rafraichirComptes()           relever les profils depuis l'annuaire
inventorierJetons()           relever les jetons actifs — une requête par compte
etatInventaire()              où en est le relevé
annulerInventaire()           abandonner le relevé en cours
preparerSollicitations()      construire le plan d'envoi — n'envoie rien
envoyerSollicitationExemple() s'envoyer un exemplaire à soi-même
envoyerSollicitations()       envoyer, après confirmation
```

`moissonner()` est le seul point d'entrée normal : il crée le classeur, le
remplit, puis agrège de lui-même. `reagreger()` ne sert qu'à rejouer
l'agrégation après une modification du code, sans redemander le journal à
Google — et se lance depuis le classeur, pas depuis le projet.

Tout le reste est privé, suffixé d'un souligné : les fonctions ainsi nommées
n'apparaissent pas dans le menu d'exécution de l'éditeur, et ne peuvent donc pas
être lancées par mégarde à la place de `moissonner()`.

### Le menu du classeur

`onOpen` étant un déclencheur simple sur un script lié, le menu apparaît de
lui-même, sans rien à installer : moissonner sur 180 ou 30 jours, rejouer
l'agrégation, suivre ou annuler la campagne, afficher ou masquer l'onglet brut.

Relancer un moissonnage vide d'abord le brut : deux fenêtres empilées dans un
même onglet produiraient un rapport faux sans le dire. La question est posée
avant, et l'écrasement annoncé.

Les comptes rendus partent dans un dialogue plutôt que dans le journal
d'exécution, que l'utilisateur d'un classeur ne voit pas — et les erreurs y
arrivent lisibles, avec la raison la plus probable, plutôt qu'en rouge.

Le moissonnage écrit un événement par ligne dans un onglet `_Brut`, puis agrège.
S'il atteint son budget de temps, il enregistre son état — jeton de page,
compteurs, identifiant du classeur — et programme sa propre reprise une minute
plus tard. Le nombre de reprises dépend du volume du journal ; le résultat, non.

Une seule campagne à la fois : relancer `moissonner(30)` pendant une campagne de
180 jours la poursuit sans changer sa fenêtre. Mélanger deux périodes dans un
même classeur produirait un rapport qui ment sans le dire.

`_Brut` est masqué en fin d'agrégation, jamais supprimé : c'est la pièce
justificative, et elle ne doit pas circuler plus largement que le rapport.

## Solliciter les autorisants

Un audit qui s'arrête au constat ne change rien. La v0.3 écrit aux comptes
concernés pour leur demander à quoi sert l'application qu'ils ont autorisée,
leur rappeler qu'ils peuvent en retirer l'accès eux-mêmes, et leur transmettre
les règles de nommage des projets Apps Script.

**Ces règles ne sont pas un supplément, elles sont le cœur du problème.** La
sonde, sur un tenant d'atelier, a remonté des applications nommées « Projet sans
titre », « test » et « fabrice@… 's Apps ». À 8 500 comptes, ces noms-là sont la
première cause d'illisibilité de l'audit : un projet anonyme est un accès que
personne ne peut rattacher à un usage. Sept règles sont proposées par défaut,
éditables dans l'onglet `Modèle` — jamais de projet sans titre, une forme
`ÉQUIPE — Objet — ÉTAT`, trois états seulement, aucun nom de personne dans le
titre, un projet pour un usage.

**Trois protections, parce qu'un courriel parti ne se rappelle pas.**

| | |
|---|---|
| Plan puis envoi | `Préparer les sollicitations` remplit un onglet et n'envoie rien. On le relit, on supprime ce qui n'a pas lieu d'être, puis on envoie — l'ordre de la passerelle JSM. |
| Un courriel par personne | jamais un par application : qui a autorisé six outils reçoit un seul message listant les six. |
| Marquage immédiat | l'état passe à « envoyé » juste après l'envoi, ligne par ligne : une interruption ne peut pas produire de doublon à la reprise. |

S'y ajoutent un plafond de 500 destinataires — un cran d'arrêt, pas une limite
technique : au-delà, on envoie par vagues — et la lecture du quota d'envoi
restant, l'envoi s'arrêtant avant de l'épuiser plutôt qu'en échouant à
mi-parcours. Le reste part le lendemain, sans risque de doublon.

Avant tout envoi réel, `S'envoyer un exemple de courriel` en expédie un à
soi-même, avec deux applications fictives : c'est le seul moyen de juger le ton,
le délai et les règles telles qu'un collègue les recevra.

**Deux onglets référentiels**, créés au premier usage : `Modèle` porte l'objet,
le délai, le contact, la signature et les règles de nommage ; `Approuvées` liste
les applications qui ne doivent solliciter personne. Les modifier ne demande
aucun déploiement.

**Ce que le destinataire lit n'est pas ce que l'administrateur lit.** Le rapport
nomme les familles de portées — `drive`, `admin`, `spreadsheets` — parce que
l'administrateur les connaît et les filtre. Le courriel, lui, les traduit :
« l'administration du domaine, vos projets Apps Script et vos feuilles de
calcul ». On demande à quelqu'un de juger si un accès se justifie ; lui
présenter le jargon des portées reviendrait à lui demander de juger sans
comprendre. Et deux identifiants OAuth portant le même nom — projet déployé deux
fois — ne font qu'une ligne : le destinataire ne peut pas les distinguer.

`MailApp` est employé plutôt que `GmailApp` : il ne sait qu'envoyer. Aucune
portée de lecture de la messagerie n'est demandée, et aucune ne pourrait l'être.

## Classer les applications

Tout le classeur est reconstruit à chaque moissonnage — **sauf l'onglet
`Décisions`**, qui ne l'est jamais. C'est le verrou de tout le reste : on ne
peut pas classer ce qui s'efface au rafraîchissement suivant. La
synchronisation n'y fait qu'une chose, ajouter les applications nouvelles avec
un statut vide ; elle ne réécrit jamais un statut, un motif, un décideur ni une
échéance. Le jugement appartient à l'administrateur, le code n'en produit pas.

| Statut | Ce qu'il engage |
|---|---|
| approuvée | usage légitime et connu ; ne sollicite plus personne |
| tolérée | pas souhaitable, pas assez grave pour agir ; ne sollicite plus |
| à instruire | on ne sait pas encore ; reste dans la file de travail |
| à bloquer | décidé, pas encore appliqué en console |
| bloquée | appliqué |

Un statut vide vaut « non classée » — l'état de départ, et le chiffre à faire
décroître. Il est en tête de la Synthèse.

**Une décision a une date de péremption.** Une application approuvée en 2026 ne
l'est pas pour toujours : elle change de mains, de portées, d'éditeur. Passée
l'échéance de la colonne « Revoir avant », la décision devient caduque —
l'application réapparaît comme `approuvée (périmée)`, retombe dans la file de
travail et redevient sollicitable. Une approbation sans échéance serait une
approbation définitive, ce qui n'existe pas en gouvernance des accès.

L'onglet Applications se lit désormais de haut en bas : les non classées
d'abord, puis celles qu'un compte à privilèges a autorisées, puis les plus
répandues.

**Il n'y a plus de liste d'exclusion séparée.** Une application qu'on ne
sollicite plus est une application qu'on a jugée, et ce jugement porte son
motif, son auteur et son échéance. Deux listes auraient fini par diverger.

### La sensibilité des portées, sur deux axes

Google classe ses portées en **restreintes**, **sensibles** et **basiques**.
S'appuyer sur sa nomenclature plutôt que sur une échelle maison évite d'avoir à
la défendre en comité : elle est publiée, opposable, et l'éditeur de
l'application la connaît déjà.

**Mais elle ne suffit pas.** Cette classification protège l'utilisateur final
d'une application publiée, pas le tenant : `admin.directory.user` n'y est pas
« restreinte », alors qu'elle permet de créer et de supprimer des comptes. Une
seconde colonne marque donc les portées qui donnent prise sur **l'administration
du domaine**, indépendamment du niveau de Google. Les deux se lisent ensemble.

Le catalogue vit dans l'onglet `Catalogue portées`, amendable sans déploiement ;
le code n'y met qu'un jeu de départ. Une entrée terminée par un point vaut
préfixe — `…/auth/gmail.` couvre toute la famille — une entrée sans point final
ne vaut que pour elle-même. **Cette distinction n'est pas un détail** :
`…/auth/drive` est restreinte, mais `…/auth/drive.file`, qui ne donne accès
qu'aux fichiers créés par l'application, ne l'est pas. Les confondre reviendrait
à punir la portée la plus vertueuse — celle qu'on veut voir adopter.

Une portée absente du catalogue est traitée comme **sensible** et signalée comme
telle, en tête de l'onglet Portées : sous-estimer un accès inconnu serait la
pire des erreurs, et un trou qu'on ne voit pas ne se comble jamais.

### La file « À instruire »

L'onglet `À instruire` est la soustraction qui fait gagner du temps : ce qui
appelle un examen, **moins** ce qui porte déjà une décision en vigueur. Une
application dont la décision a expiré y revient — c'est tout l'intérêt d'une
échéance.

| Motif | Poids |
|---|---|
| portée restreinte | +3 |
| administration du domaine | +3 |
| autorisée par un compte à privilèges | +2 |
| autorisée par un compte suspendu | +2 |
| au moins dix autorisants | +1 |
| portée hors catalogue | +1 |

Aucun de ces chiffres n'a de vertu scientifique : ce sont des poids relatifs,
choisis pour que l'ordre de lecture soit défendable. **C'est pourquoi la colonne
Motifs les affiche un par un** — « portée restreinte (+3) · autorisée par
2 comptes à privilèges (+2) ». Un rang qui ne sait pas dire pourquoi il est ce
qu'il est ne survit pas à la première contestation en réunion.

### Ce que l'annuaire ajoute au journal

Une application autorisée par un administrateur délégué n'est pas dans la même
catégorie qu'une autre : ses portées s'exercent sur un compte qui peut lui-même
agir sur le tenant. Et une autorisation portée par un **compte suspendu** est un
cas à part — la personne est partie, l'accès peut être resté ouvert.

Ni l'un ni l'autre ne se lit dans le journal d'audit. « Relever les profils des
comptes » interroge l'annuaire — 17 pages de 500 comptes pour 8 500, sans
commune mesure avec la requête par compte qu'exigera l'inventaire des jetons —
et n'en retient **que** les comptes hors du commun : administrateurs,
administrateurs délégués, comptes suspendus. Sur 8 500 comptes ils se comptent
en dizaines ; recopier tout l'annuaire dans un classeur n'aurait servi à rien et
l'aurait exposé sans raison.

Les onglets Applications et Autorisants portent alors les colonnes « dont à
privilèges », « dont suspendus » et « Profil ». Sans ce relevé, elles restent
vides : le reste du rapport fonctionne, il est seulement moins tranchant.

## L'inventaire des jetons, et l'écart qui compte

Le journal dit ce qui s'est passé sur 180 jours. L'inventaire dit ce qui existe
aujourd'hui. Leur écart porte l'information que ni l'un ni l'autre ne pouvait
donner seul :

> un jeton actif dont aucune autorisation n'apparaît au journal a été accordé
> **avant** la fenêtre — c'est un accès que personne n'a revu depuis plus de six
> mois.

L'onglet `Dormants` ne contient que ceux-là. Et l'agrégation verse le relevé
dans les mêmes tableaux que le journal : une application autorisée il y a deux
ans et restée silencieuse depuis **n'apparaissait nulle part** ; elle apparaît
maintenant, avec ses portées et ses autorisants.

**Un fait ne se mélange pas à une présomption.** La colonne `Jeton` — *actif* ou
*clos* — dit ce que l'inventaire a constaté ; la colonne `État présumé` dit ce
que le journal laisse supposer. Elles restent séparées. Et sans relevé, la
colonne `Jeton` reste **vide** : ne pas avoir inventorié n'est pas la même chose
que n'avoir trouvé aucun jeton, et les confondre ferait passer tout le parc pour
révoqué.

### Ce que cette version coûte, et qu'il faut assumer

**Le prix en requêtes.** Le journal s'interroge globalement ; l'inventaire se
paie une requête par compte — 8 500. Un rapport de un à cent, et la raison pour
laquelle il arrive en sixième : on ne dépense cela qu'une fois le dépouillement,
le classement et la file de travail en place. Le relevé se fait en deux phases
reprenables — recensement du parc, puis parcours par blocs de 50 comptes — et
reprend là où il s'est arrêté.

**Le prix en portée.** `Tokens.list` exige `admin.directory.user.security`, qui
porte la lecture **et** la suppression des jetons. Google n'en publie aucune
variante en lecture seule, et rien dans Apps Script ne permet de la restreindre.
Cette portée entre donc au manifeste, définitivement — la maquiller en la
retirant après chaque campagne serait du théâtre, l'inventaire étant appelé à
être relancé.

La seule compensation honnête est vérifiable : **aucun appel à `Tokens.remove`
n'existe dans le projet**, et cela se contrôle d'un `grep`. La révocation viendra
en v1.1, en plan puis application, et se verra dans le journal d'audit du tenant
comme toute suppression.

**Repartir de zéro à chaque relevé.** Un nouvel inventaire remplace le
précédent : les mêler ferait passer pour actifs des jetons révoqués entre-temps.
Un inventaire abandonné en cours de route laisse un relevé partiel, et le dit.

## La volumétrie : ce qu'une application fait de son accès

Les événements `activity` portent `num_response_bytes` — le volume que Google a
réellement rendu à l'application, appel par appel. C'est la seule mesure de ce
qu'une application **fait** de son accès, par opposition à ce qu'elle a le droit
de faire.

L'écart entre les deux est tout l'intérêt de la chose. Une application qui
détient une portée restreinte et n'a jamais rien lu se discute ; la même qui a
extrait quatre gigaoctets de Drive le mois dernier ne se discute plus.

**Deux fenêtres, parce qu'une seule induirait en erreur.** Le total sur la
période moissonnée dit l'ampleur historique ; les 30 derniers jours disent ce qui
se passe *maintenant*. Une application qui a beaucoup lu il y a cinq mois puis
plus rien n'appelle pas la même réaction qu'une application qui lit aujourd'hui,
et un chiffre unique confondrait les deux.

L'onglet `Volumétrie` détaille par **application et par service** — Drive, Gmail,
Agenda — avec les appels, le volume, la part du total et la date du dernier
appel. La Synthèse en tire le palmarès des cinq plus consommatrices sur 30 jours.
Au-delà d'un gigaoctet extrait sur cette fenêtre, l'application entre d'elle-même
dans la file de travail, avec le chiffre en clair dans ses motifs.

**Quand il n'y a rien à mesurer, l'onglet le dit.** Certains tenants ne
journalisent aucun événement `activity` ; le tableau porte alors une phrase
explicite plutôt que de rester vide. Une absence de mesure n'est pas une absence
de trafic, et un tableau vide se lit à tort comme rassurant.

## Révoquer

C'est la seule partie de l'outil qui détruit quelque chose. Elle est bâtie
autour de trois refus.

**On ne révoque que ce qu'on a jugé.** Le plan ne se construit pas à partir d'un
filtre ni d'un score, mais à partir du référentiel : n'y entrent que les
applications portant le statut `à bloquer`, décision en vigueur. Une application
non classée, ou dont l'échéance est passée, ne produit aucune ligne. L'ordre est
délibéré — la décision précède l'acte, et elle porte le nom de qui l'a prise, qui
se retrouve dans le plan.

**On rejoue la résolution avant d'agir.** Entre le plan et son application, le
monde a pu changer : décision révisée, échéance franchie, jeton déjà retiré par
son propriétaire. Chaque ligne est revérifiée au moment de l'exécution, et une
ligne dont la décision ne tient plus est marquée « ignoré » plutôt qu'exécutée
sur une base morte.

**On refuse d'aller vite.** Confirmation annonçant le nombre exact de jetons et
d'applications ; plafond de 200, qui est un cran d'arrêt et non une limite
technique ; écriture de l'état ligne à ligne, immédiatement — une interruption ne
doit pas laisser croire qu'un jeton vit encore alors qu'il a disparu. Et une
seconde confirmation, distincte, si l'un des jetons visés est celui de
l'opérateur : se retirer à soi-même le jeton de l'outil, c'est s'enfermer dehors.

### Ce que cette version change à la garantie précédente

Jusqu'en v1.0, le projet promettait qu'aucun appel de suppression de jeton n'y
figurait, et cela se vérifiait d'un `grep`. **Cette version en introduit un**, dans
`Revocation.gs` et nulle part ailleurs. La garantie change de forme : elle n'est
plus l'absence de l'appel, mais son encadrement — décision préalable inscrite au
référentiel, plan relu, résolution rejouée, confirmation chiffrée, plafond, trace
ligne à ligne. Et toute suppression apparaît dans le journal d'audit du tenant,
comme n'importe quelle autre.

### Révoquer n'est pas bloquer

`Tokens.remove` supprime l'accès en cours ; l'utilisateur peut réautoriser
l'application dans la minute. La révocation seule est un pansement : elle ne vaut
que doublée du blocage dans la console, sous *Sécurité > Contrôles des API*,
qu'aucune API ne pilote.

Le plan le rappelle, le compte rendu le rappelle, le guide du classeur le
rappelle. C'est l'illusion la plus coûteuse que cet outil pourrait entretenir :
un administrateur qui croirait avoir fermé une porte alors qu'il l'a seulement
poussée.

## La vue de consultation

Il manquait un destinataire : le RSSI, le comité, la direction — des gens qui
doivent voir l'état du parc **sans recevoir l'inventaire**, et qui ne sont pas
administrateurs Workspace.

**Partager le classeur en lecture ne suffit pas.** Un lecteur peut en faire une
copie et récupérer dans cette copie les onglets masqués : le journal brut et le
relevé des jetons. Le partage en lecture n'est pas une frontière, c'est un
ralentisseur.

D'où une page web, bornée par quatre règles :

| | |
|---|---|
| Elle n'agit pas | pas de moissonnage, pas d'envoi, pas de révocation, et **pas de `doPost`**. Elle ne sait que lire un classeur déjà produit |
| Elle s'exécute sous l'identité du déployeur | seule façon de servir des lecteurs sans droits — acceptable **uniquement** parce qu'elle n'agit pas. Une page qui agirait ainsi rendrait à quiconque possède l'URL les droits d'administrateur du déployeur, soit exactement la faille que le script lié avait supprimée |
| Accès limité au domaine | jamais « toute personne disposant du lien » |
| Elle ne publie que le résumé | synthèse, file de travail, et fiches **sans la liste des comptes autorisants**. Ni onglet brut, ni relevé de jetons, ni onglet Dormants, qui sont tous nominatifs |

La dernière règle est celle que le banc d'essai vérifie nommément : aucune
adresse de compte ne doit figurer dans une page publiée. Un comité statue sur
une application, pas sur des personnes nommées.

La page rappelle en pied la **date de la dernière collecte** : elle ne rafraîchit
rien, et un chiffre lu là n'est pas l'état du tenant à l'instant présent. Elle
rappelle aussi au lecteur qu'il est identifié.

Le déploiement reste manuel — *Déployer > Nouveau déploiement > Application web*
— et le menu donne le lien une fois que c'est fait.

## Deux langues, deux publics qui n'ont rien à voir

L'administrateur a **choisi** cet outil : il en accepte la langue, et un réglage
unique lui suffit. Le destinataire d'un courriel de sollicitation, lui, n'a rien
choisi — on lui écrit sans lui demander son avis, pour lui reprocher poliment un
accès qu'il a accordé. Lui écrire dans une langue qu'il ne lit pas serait à la
fois inefficace et discourtois.

**La langue des courriels se règle donc par destinataire**, dans cet ordre : la
colonne `Langue` du plan d'envoi, qui se corrige à la main ; sinon la règle de
domaine de l'onglet `Paramètres` ; sinon le défaut. Jamais une déduction à partir
d'un nom ou d'un prénom.

L'onglet `Modèle` porte **un jeu de règles de nommage par langue**. Un classeur
créé avant cette version n'a que le bloc français : le bloc anglais lui est
ajouté à la première lecture, plutôt que d'obliger à recréer l'onglet et à perdre
les amendements déjà faits.

### Ce qui est traduit en v1.4, et ce qui ne l'est pas

Traduit : **ce qui sort du classeur** — le courriel de sollicitation, la vue de
consultation, la fiche d'application. Ce sont les surfaces lues par des gens qui
n'ont pas choisi l'outil.

Pas encore : **le classeur lui-même** — menu, dialogues, guide, noms d'onglets et
d'en-têtes de colonnes. Ce n'est pas un oubli mais un ordre de travail. Les noms
d'onglets et les en-têtes servent de **clés de lecture en cinquante-trois
endroits** : les traduire demande une couche de résolution qui accepte les deux
langues, sans quoi un classeur commencé en français cesserait de fonctionner le
jour où l'on bascule. C'est la v1.5.

## Ce que le journal permet de dire, et ce qu'il ne permet pas

L'onglet Autorisants porte une colonne « État présumé ». Le mot est choisi : le
journal ne connaît que la fenêtre qu'on lui a demandée, et **rien de ce qu'il
dit d'un accès aujourd'hui n'est un fait**. Cinq valeurs :

| Valeur | Ce qu'on a vu | Ce qu'on en déduit |
|---|---|---|
| présumé actif | une autorisation, aucune révocation depuis | l'accès existe probablement encore |
| révoqué depuis | une autorisation puis une révocation | l'accès a été fermé |
| révoqué | une révocation sans autorisation visible | fermé, accordé avant la fenêtre |
| refusé | un refus, jamais d'autorisation | la politique ou l'utilisateur a bloqué |
| **antérieur à la fenêtre** | des appels d'API, aucune autorisation | **accordé il y a plus longtemps que ne porte le journal** |

La dernière ligne est celle qui justifie la v0.3. Une application qui appelle
les API pour un compte sans qu'aucune autorisation n'apparaisse a forcément été
autorisée avant — c'est un accès que personne n'a revu depuis plus de six mois,
et le journal seul ne peut ni le dater ni confirmer qu'il vit encore. Seul
l'inventaire des jetons le peut.

## Points à trancher

1. Le journal OAuth répond-il sur le tenant, et les événements `activity`
   portent-ils bien `num_response_bytes` ? *(v0.1)*
2. Le tenant mêlant plusieurs éditions, la journalisation est-elle homogène sur
   les 8 500 comptes, ou les comptes des éditions basses sont-ils absents du
   journal ? Un inventaire ciblé sur quelques comptes de chaque édition tranche.
3. Le référentiel des applications approuvées existe-t-il déjà quelque part, ou
   l'outil le crée-t-il ?

## Licence

**Elastic License 2.0** — voir [`LICENSE`](LICENSE). Identifiant SPDX : `Elastic-2.0`.

**Ce qui est permis :** utiliser, copier, modifier et **redistribuer** l'outil, y
compris au sein d'une entreprise à but lucratif. Auditer votre tenant, adapter le
code à vos référentiels, le déployer pour votre équipe sécurité, publier un fork
corrigé : tout cela est couvert.

**Ce qui ne l'est pas :** fournir le logiciel à des tiers **en tant que service
hébergé ou infogéré**, et retirer ou masquer les mentions de licence, de droit
d'auteur ou d'auteur. Pour une offre de service, contactez l'auteur.

Ce n'est pas une licence open source au sens de l'OSI — elle restreint un champ
d'utilisation — mais elle est **reconnue par le registre SPDX** et affichée sous
son nom par GitHub.


---

# English Version

## Third-Party Applications and Shadow AI Audit for Google Workspace

Inventories **all third-party applications connected to your Google Workspace domain accounts**, detailing for each: granted OAuth scopes, authorizing accounts, timestamps, and **the actual data volume extracted**.

**Goal:** Bring full visibility to what the Google Admin console obscures — the proliferation of external tools, especially Shadow AI tools, connected to Drive and Gmail by employees.

### Key Principles & Problem Statement

Authorizing an app takes one click. The token remains valid until revoked — which rarely happens organically. The Admin Console (*Security > API Controls*) does not easily reveal:
- How many employees authorized an application, and who they are.
- When it was authorized, and whether privileged administrators are among them.
- Exact OAuth scopes and corresponding APIs.
- **How many megabytes or gigabytes the app actually pulled last month.**

This bound Google Sheets Apps Script answers these questions without exporting domain secrets or deploying complex external cloud infrastructure.

### Two Data Sources

| | `Directory API` (`Tokens.list`) | `Reports API` (`token` application) |
|---|---|---|
| **Provides** | **Current state**: which tokens currently exist | **Historical activity**: authorizations, denials, revocations, API calls |
| **Depth** | Unlimited | Rolling **180 days** (Google limit) |
| **Cost** | 1 query per user account | Fast paginated domain-wide queries |

Their cross-referencing reveals the most critical finding: **active tokens with no authorization events in the last 180 days are dormant access grants** (granted over 6 months ago, untouched and unreviewed).

### Prerequisites

1. A Google Workspace domain with administrator access.
2. An administrator account with privileges to access Google Workspace Audit Reports and Directory Users.
3. A blank Google Sheet.

### Installation & Setup

1. Create a blank Google Sheet in your Google Workspace domain.
2. Open **Extensions > Apps Script** (the project is bound to this spreadsheet).
3. Copy all files from `apps-script/` into the Apps Script editor.
4. In Project Settings (⚙️), check **Show "appsscript.json" manifest file in editor**, and replace its content with `apps-script/appsscript.json`.
5. Reload the Google Sheet. The custom menu **Applications tierces** will appear.
6. Optional but recommended: from the Apps Script editor, run `sonde(180)` to verify domain API readiness in 30 seconds without modifying anything.

### Typical Workflow

1. **Harvest audit log (180 days)**: *Applications tierces > Collecter les données > Moissonner le journal d'audit — 180 jours*. Reads the OAuth audit log and generates the synthesis tabs.
2. **Collect account profiles**: *Collecter les données > Relever les profils des comptes*. Identifies admins, delegated admins, and suspended users.
3. **Inventory active tokens**: *Collecter les données > Relever les jetons actifs*. Exhaustive per-account token census revealing dormant accesses older than 6 months.
4. **Classify & decide**: Review apps in the *À instruire* and *Décisions* tabs. Assign statuses (`approuvée`, `tolérée`, `à instruire`, `à bloquer`, `bloquée`) and expiration review dates (`Revoir avant`).
5. **Campaign emails**: *Écrire aux autorisants > 1. Préparer le plan d'envoi*, review the drafted plan, then send emails to employees asking for justification.
6. **Revoke blocked apps**: *Révoquer des accès > 1. Préparer le plan de révocation*, review candidate tokens, and apply revocations with built-in safety ceilings.

### Architecture & Security Highlights

- **Bound script model**: Runs under the active user's identity — non-admin viewers of the spreadsheet cannot execute administrative API calls.
- **Least privilege**: Manifest requests `spreadsheets.currentonly` instead of broad Google Drive access.
- **Quota & timeout resilience**: Automatically checkpoints execution state in `PropertiesService` and schedules continuation triggers before reaching the 6-minute GAS wall (`BUDGET_MS = 4.5 min`).
- **Two-phase guardrails**: Destructive operations (email notifications and token removals) generate a spreadsheet plan first, re-validate decisions upon execution, and enforce hard limits (`PLAFOND_REVOCATION_ = 200`, `PLAFOND_ENVOI_ = 500`).

### Testing

Run the automated test suite locally (simulating Google Apps Script environment):
```bash
node banc/test.js
```

### License

Licensed under the **Elastic License 2.0** (`Elastic-2.0`). See [`LICENSE`](LICENSE).
Developer: Fabrice Faucheux ([faucheux.bzh](https://faucheux.bzh))
