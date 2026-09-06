# Journal des modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.2.0] - 2026-09-06

> **L'angle croyance limitante :** *Partager le classeur en lecture seule à la direction ou au RSSI suffit pour communiquer sur la sécurité.*
> C'est une illusion : un lecteur peut copier le classeur et révéler dans sa copie les onglets masqués contenant le journal d'audit brut et les jetons nominatifs. La version 1.2.0 introduit une vue web de consultation en lecture seule (`WebApp.gs`), totalement étanche et anonymisée, déployable à l'échelle du domaine.

### Ajouté
- **Vue de consultation web en lecture seule** (`WebApp.gs`) : publication d'une interface HTML autonome présentant la synthèse globale, la file de travail priorisée et les fiches descriptives des applications.
- **Cloisonnement et anonymisation stricte** : la vue web ne divulgue aucun compte utilisateur nominatif, n'expose aucun onglet brut ou relevé individuel de jetons, et ne propose aucune action d'écriture ou d'administration (aucun `doPost`).
- **Résolution robuste du classeur** (`CLE_CLASSEUR_`) : mémorisation de l'identifiant du classeur actif via les Script Properties pour garantir l'accès aux données en mode webapp déconnectée.
- **Raccourci dans le menu du classeur** (`Menu.gs`) : entrée « Vue de consultation — obtenir le lien » pour obtenir et partager l'URL de l'application web.
- **Configuration du manifeste webapp** (`appsscript.json`) : déploiement sous l'identité du déployeur (`USER_DEPLOYING`) restreint aux membres du domaine (`DOMAIN`) avec portée d'identification `userinfo.email`.

---

## [1.1.1] - 2026-09-06

> **L'angle contre-intuitif :** *Donner tous les droits à un outil de sécurité pour auditer son domaine est le premier risque de sécurité.*
> On imagine souvent qu'un outil d'audit a besoin d'un accès large à Google Drive. C'est faux : le classeur qui porte le script est son unique livrable. Cette version 1.1.1 applique le principe du moindre privilège, neutralise les injections dans les attributs HTML et vectorise les écritures de décisions.

### Sécurité
- **Moindre privilège OAuth** (`appsscript.json`) : remplacement de la portée globale `spreadsheets` par `spreadsheets.currentonly`. Le script lié n'a accès qu'au classeur actif portant le rapport.
- **Échappement HTML complet** (`Commun.gs`) : conversion des guillemets doubles et simples (`&quot;`, `&#39;`) dans `echapper_` pour prévenir toute rupture de balise ou injection dans les attributs HTML des fiches et courriels.

### Performance
- **Vectorisation des décisions** (`Decision.gs`) : remplacement de la boucle d'appels unitaires `setValue` par une mise à jour en lot (`setValues`) sur l'ensemble de l'onglet Décisions, divisant le temps d'exécution de synchronisation par plus de dix sur les parcs à fort volume.
- **Écritures regroupées lors des révocations** (`Revocation.gs`) : mise à jour simultanée des 4 colonnes d'état en un seul appel par ligne au lieu de trois écritures dispersées.

### Documentation
- **Bilinguisme intégral** (`README.md`) : ajout de la documentation de référence en anglais (présentation, prérequis, installation, architecture et workflow).

---

## [0.7.0] - 2026-09-06

> **Le constat qui dérange :** *Ce qu'une application a le droit de lire n'a jamais convaincu personne. Ce qu'elle a lu, si.*
> Une portée restreinte est une capacité ; quatre gigaoctets extraits le mois dernier sont un fait. Cette version 0.7.0 exploite enfin `num_response_bytes`, que le journal fournit et que personne ne regarde.

### Ajouté
- **Onglet `Volumétrie`** (`Volumetrie.gs`) : une ligne par application et par service — Drive, Gmail, Agenda — avec les appels, le volume, la part du total et la date du dernier appel.
- **Deux fenêtres plutôt qu'un chiffre unique** : le total sur la période moissonnée dit l'ampleur historique, les 30 derniers jours disent ce qui se passe maintenant. Une application qui a beaucoup lu il y a cinq mois puis plus rien n'appelle pas la même réaction qu'une application qui lit aujourd'hui.
- **Palmarès des cinq plus consommatrices sur 30 jours** en Synthèse, et colonnes de volume dans l'onglet Applications.
- **Un motif de plus dans la file de travail** : au-delà d'un gigaoctet extrait sur 30 jours, l'application entre d'elle-même dans la file, avec le chiffre en clair — « 4,2 Go extraits sur 30 jours (+2) ». Ce qu'une application a réellement extrait pèse plus lourd que ce qu'elle aurait le droit d'extraire.
- **Quand il n'y a rien à mesurer, l'onglet le dit** en toutes lettres au lieu de rester vide. Une absence de mesure n'est pas une absence de trafic, et un tableau vide se lit à tort comme rassurant.

### Corrigé
- **La feuille créée d'office avec le classeur ne traînait plus qu'à moitié.** `brutCourant_` la renommait lorsqu'elle était seule dans un classeur neuf, mais dès qu'un autre onglet existait déjà elle survivait indéfiniment. Un ménage a lieu désormais en fin d'agrégation, avec deux garde-fous : seulement si la feuille est vide, et jamais la dernière du classeur.
- **Le jeu d'essai comportait une date figée qui tombait sur la limite des 30 jours** au moment de son exécution. Les appels du banc sont désormais ancrés par rapport à maintenant : un test dont le résultat dépend du jour où on le lance ne prouve rien.

---

## [0.6.0] - 2026-09-06

> **Le constat qui dérange :** *L'accès le plus dangereux est celui dont il ne reste aucune trace.*
> Le journal d'audit ne remonte qu'à six mois. Une application autorisée il y a deux ans, qui n'a rien fait de bruyant depuis, n'y figure pas — et n'a donc jamais figuré dans ce rapport. Elle a pourtant toujours accès. Cette version 0.6.0 va chercher ce que le journal ne peut pas savoir, et le paie au prix fort : une requête par compte.

### Ajouté
- **Inventaire des jetons actifs** (`Inventaire.gs`) : relevé de `Tokens.list` pour chaque compte du parc, en deux phases reprenables — recensement, puis parcours par blocs de 50 comptes, avec reprise par déclencheur. Le curseur n'avance qu'après écriture : une interruption fait au pire recommencer un bloc, jamais en sauter un.
- **Onglet `Dormants`** : les jetons vivants dont aucune autorisation n'apparaît au journal. L'autorisation est donc antérieure à la fenêtre — un accès que personne n'a revu depuis plus de six mois. C'est la seule chose que ni le journal ni l'inventaire ne pouvaient dire seuls, et ce qui justifiait la dépense.
- **Les deux sources sont fusionnées.** Une application connue du seul inventaire entre dans les onglets Applications, Autorisants et Portées avec ses portées et ses autorisants. L'omettre aurait fait perdre exactement ce que l'inventaire coûte à établir.
- **Colonne `Jeton`** — *actif* ou *clos* — tenue **séparée** de « État présumé ». La première dit ce que l'inventaire a constaté, la seconde ce que le journal laisse supposer ; un fait et une présomption ne se mélangent pas dans une même cellule. Sans relevé, la colonne reste vide : ne pas avoir inventorié n'est pas n'avoir rien trouvé.
- **Un motif de plus dans la file de travail** : des jetons actifs sans autorisation au journal valent +2.

### Modifié
- **La portée `admin.directory.user.security` entre au manifeste, définitivement.** Elle porte la lecture et la suppression des jetons, sans variante en lecture seule chez Google ni moyen de la restreindre dans Apps Script. La retirer après chaque campagne serait du théâtre. La compensation est vérifiable plutôt que déclarative : aucun appel à `Tokens.remove` n'existe dans le projet, et cela se contrôle d'un `grep`.

---

## [0.5.0] - 2026-09-06

> **Le constat qui dérange :** *Un inventaire sans hiérarchie se lit une fois, puis plus jamais.*
> Deux cents applications alignées dans un onglet, c'est un document qu'on ouvre par acquit de conscience et qu'on referme sans avoir rien décidé. Cette version 0.5.0 dit par où commencer — et dit surtout pourquoi, motif par motif, parce qu'un classement qui ne sait pas se justifier ne survit pas à la première réunion.

### Ajouté
- **Catalogue de sensibilité des portées** (`Portees.gs`), onglet `Catalogue portées` amendable sans déploiement. Il reprend la nomenclature publiée par Google — restreintes, sensibles, basiques — plutôt qu'une échelle maison : elle est opposable, et l'éditeur de l'application la connaît déjà.
- **Un second axe, l'administration du domaine.** La classification de Google protège l'utilisateur final d'une application publiée, pas le tenant : `admin.directory.user` n'y est pas « restreinte », alors qu'elle permet de créer et supprimer des comptes. Une colonne distincte marque ces portées, quel que soit leur niveau chez Google.
- **Correspondance par préfixe explicite** : une entrée terminée par un point couvre une famille, une entrée sans point ne vaut que pour elle-même. `…/auth/drive` est restreinte, `…/auth/drive.file` ne l'est pas — les confondre reviendrait à punir la portée la plus vertueuse, celle qu'on veut voir adopter.
- **Une portée hors catalogue est tenue pour sensible et signalée**, en tête de l'onglet Portées et dans la Synthèse. Sous-estimer un accès inconnu serait la pire des erreurs, et un trou qu'on ne voit pas ne se comble jamais.
- **Onglet `À instruire`** : ce qui appelle un examen moins ce qui porte une décision en vigueur. Une décision expirée y ramène l'application — c'est tout l'intérêt d'une échéance.
- **Priorité expliquée motif par motif.** Six critères pondérés, dont la colonne Motifs affiche le détail : « portée restreinte (+3) · autorisée par 2 comptes à privilèges (+2) ». Aucun de ces chiffres n'a de vertu scientifique ; c'est précisément pourquoi ils sont montrés plutôt que résumés en une note.
- L'onglet Applications porte désormais la priorité, le niveau maximal, l'indicateur d'administration et les motifs ; l'onglet Portées, le niveau, l'indicateur d'administration et l'appartenance au catalogue.

---

## [0.4.1] - 2026-09-06

> **Le constat qui dérange :** *Un premier envoi réel apprend plus que dix relectures.*
> Le courriel reçu par son auteur affichait « Thu May 14 » là où on attendait une date, et annonçait à son destinataire qu'une application accédait à « admin, script, spreadsheets ». Deux défauts qu'aucun banc d'essai ne pouvait révéler, parce que l'un tient au comportement de Sheets et l'autre au regard de celui qui lit.

### Corrigé
- **Les horodatages étaient lus comme des chaînes alors que Sheets les rend en objets `Date`.** Le symptôme visible était l'affichage — « Thu May 14 », en anglais et sans année. Le défaut réel était ailleurs : ces chaînes se comparaient alphabétiquement sur le nom du jour, si bien que la période observée, les premières et les dernières apparitions étaient fausses **sans que rien ne le signale**. Une fonction unique normalise désormais toute forme d'horodatage en `yyyy-MM-dd`, et le banc d'essai injecte de vrais objets `Date` pour que le cas ne repasse plus.
- **Deux identifiants OAuth portant le même nom faisaient deux lignes dans le courriel.** Cas courant d'un projet déployé deux fois : le destinataire voyait « workspace-console » deux fois sans pouvoir les distinguer. Ils sont désormais réunis en une ligne, portées confondues et date la plus ancienne retenue.

### Ajouté
- **`CLAUDE.md`** : les conventions du projet, écrites pour ne plus être réapprises — la règle des dates en tête, puis l'ES6+, la séparation public/privé par la forme du code, le lien au classeur, le plan-puis-application, le référentiel hors du code, et le banc d'essai. Toute date passe par `jour_()` ; hors de cette fonction, aucun `slice(0, 10)` ne doit porter sur un horodatage, et cela se vérifie d'un grep.

### Amélioré
- **Le courriel dit les accès en français, non en familles de portées.** « admin, script, spreadsheets » devient « l'administration du domaine, vos projets Apps Script et vos feuilles de calcul ». L'onglet Applications, lui, garde les familles techniques : l'administrateur les connaît et les filtre, le destinataire du courriel non — et c'est pourtant à lui qu'on demande de juger si l'accès se justifie.
- La colonne du courriel s'intitule « Autorisée depuis » plutôt que « Vue depuis », plus juste pour ce qu'elle montre.

---

## [0.4.0] - 2026-09-06

> **Le constat qui dérange :** *Un classement qui s'efface à chaque rafraîchissement n'est pas un classement.*
> Jusqu'ici, tout jugement porté sur une application disparaissait au moissonnage suivant : l'administrateur pouvait lire son parc, jamais le trier. Cette version 0.4.0 lui donne un référentiel qui lui survit — et une décision qui, comme toute décision de sécurité, porte une date de péremption.

### Ajouté
- **Référentiel de décisions** (`Decision.gs`), onglet `Décisions` indexé sur le `client_id`, seul onglet du classeur que l'agrégation ne reconstruit jamais. Cinq statuts — approuvée, tolérée, à instruire, à bloquer, bloquée — posés par menu déroulant, avec motif, décideur, date et échéance. La synchronisation n'ajoute que les applications nouvelles ; elle ne réécrit aucun jugement.
- **Péremption des décisions.** Passée la date « Revoir avant », la décision devient caduque : l'application réapparaît comme « approuvée (périmée) », retombe dans la file de travail et redevient sollicitable. Une approbation sans échéance serait définitive, ce qui n'existe pas en gouvernance des accès.
- **Profils des comptes** (`Comptes.gs`) : relevé de l'annuaire, ne retenant que les administrateurs, administrateurs délégués et comptes suspendus — quelques dizaines sur 8 500. Les onglets Applications et Autorisants portent désormais « dont à privilèges », « dont suspendus » et « Profil ». Une application autorisée par un compte à privilèges, ou par un compte suspendu dont l'accès a survécu au départ, n'est pas dans la même catégorie qu'une autre.
- **L'onglet Applications se lit de haut en bas** : non classées d'abord, puis celles qu'un compte à privilèges a autorisées, puis les plus répandues. La file de travail n'a plus à être triée à la main.
- **Le classement en tête de la Synthèse** : combien d'applications sans décision, combien par statut, combien de décisions périmées, combien apparues depuis la dernière campagne.

### Modifié
- **La liste d'exclusion `Approuvées` disparaît**, absorbée par le référentiel de décisions. Une application qu'on ne sollicite plus est une application qu'on a jugée, et ce jugement porte son motif, son auteur et son échéance. Deux listes auraient fini par diverger, et l'on aurait tu une application sans savoir qui l'avait décidé ni quand.

---

## [0.3.0] - 2026-09-06

> **Le constat qui dérange :** *Un audit qui s'arrête au constat n'a rien changé.*
> Savoir que trois cents comptes ont connecté des outils inconnus ne réduit aucun risque tant que personne n'a demandé pourquoi. Cette version 0.3.0 écrit aux intéressés — et leur donne au passage les règles de nommage sans lesquelles la moitié des projets Apps Script du tenant resteront des « Projet sans titre » que nul ne peut rattacher à un usage.

### Ajouté
- **Sollicitation des autorisants** (`Sollicitation.gs`) : courriel au compte ayant autorisé une application, lui demandant à quoi elle sert, si elle est encore nécessaire, et qui d'autre s'en sert. Le message rappelle qu'une autorisation ne s'arrête jamais d'elle-même et indique comment retirer un accès soi-même, sur myaccount.google.com/permissions.
- **Règles de nommage des projets Apps Script**, transmises dans le même courriel : jamais de « Projet sans titre », forme `ÉQUIPE — Objet — ÉTAT`, trois états seulement, aucun nom de personne dans le titre, un projet pour un usage, et le rappel qu'un renommage tardif laisse subsister l'ancien nom sur les autorisations déjà accordées. Sept règles par défaut, éditables sans déploiement.
- **Plan puis envoi.** `preparerSollicitations()` remplit un onglet et n'envoie rien ; on le relit, on l'élague, puis on envoie. L'ordre est celui de la passerelle JSM, pour la même raison : un courriel parti ne se rappelle pas.
- **Un courriel par personne**, listant toutes ses applications — jamais un courriel par application.
- **Marquage immédiat après envoi**, ligne par ligne : une interruption ne peut pas produire de doublon à la reprise.
- **Plafond de 500 destinataires** et lecture du quota d'envoi restant : l'envoi s'arrête avant d'épuiser le quota plutôt que d'échouer à mi-parcours, et le reste part le lendemain.
- **Exemplaire d'essai** (`envoyerSollicitationExemple()`) envoyé à soi-même avec deux applications fictives, seul moyen de juger le ton et les règles tels qu'un collègue les recevra.
- **Deux onglets référentiels**, créés au premier usage : `Modèle` (objet, délai, contact, signature, règles) et `Approuvées` (applications qui ne sollicitent personne).
- `MailApp` plutôt que `GmailApp` : il ne sait qu'envoyer, et aucune portée de lecture de la messagerie n'est demandée.

### Corrigé
- **Le courriel relit sa source au moment de l'envoi**, au lieu de réinterpréter la colonne texte du plan. Un nom d'application contenant une parenthèse ou une barre verticale aurait suffi à faire dérailler cette relecture, et le message serait parti avec du charabia.

---

## [0.2.0] - 2026-09-06

> **Le constat qui dérange :** *Autoriser une application prend un clic. Cette autorisation, elle, ne s'arrête jamais toute seule.*
> La console d'administration sait dire quelles applications sont connectées. Elle ne sait dire ni qui les a autorisées, ni quand, ni sur quelles portées, ni ce qu'elles ont lu depuis. On gouverne donc une liste de noms, pas des accès. Cette version 0.2.0 ouvre le journal d'audit et rend au tenant la mémoire qu'il avait déjà, mais que personne ne consultait.

### Ajouté
- **Moissonnage du journal OAuth avec reprise d'état** (`Journal.gs`) : lecture paginée de l'application `token` de la Reports API sur `users/all`, un événement par ligne dans un onglet brut. Si le budget d'exécution est atteint, l'état — jeton de page, compteurs, identifiant du classeur — est mis de côté et un déclencheur relance la fonction. Le nombre de reprises dépend du volume du journal ; le résultat, non.
- **Agrégation en quatre onglets** (`Feuille.gs`) : Synthèse, Applications, Autorisants, Portées. Relecture du brut par lots de 20 000 lignes, jamais d'un bloc, pour tenir sur un journal de production.
- **Colonne « État présumé » à cinq valeurs**, dont **`antérieur à la fenêtre`** : une application qui appelle les API pour un compte sans qu'aucune autorisation n'apparaisse sur la période a forcément été autorisée avant. C'est un accès que personne n'a revu depuis plus de six mois, et c'est la raison d'être de l'inventaire des jetons prévu en v0.3.
- **Ventilation des refus par `rejection_type`** : un refus imposé par la politique du tenant signale une application que des utilisateurs cherchent à connecter et que le contrôle d'accès bloque — une demande en attente autant qu'un risque évité.
- **Pilotage de campagne** : `etatMoisson()` pour l'avancement, `annulerMoisson()` pour abandonner sans perdre le classeur. Une seule campagne à la fois, pour qu'un rapport ne mélange jamais deux fenêtres sans le dire.
- **Banc d'essai hors Google** (`banc/test.js`) : les fichiers `.gs` sont chargés dans un contexte où Sheets est simulé, puis on rejoue des événements de la forme exacte que renvoie l'API. C'est ce banc qui a révélé le cas `antérieur à la fenêtre`.
- **Menu dans le classeur** (`Menu.gs`) : rafraîchir sur 180 ou 30 jours, rejouer l'agrégation, suivre ou annuler la campagne, afficher ou masquer l'onglet brut. Le rafraîchissement travaille dans le classeur courant, après avoir vidé le brut. Le projet n'étant pas lié au classeur, le menu s'attache par un déclencheur installable, posé à la création ou ajouté après coup par `installerMenu()`.
- **Garde-fou sur le menu.** Un déclencheur installable s'exécute sous l'identité de celui qui l'a posé, pas de celui qui ouvre le classeur : sans contrôle, toute personne à qui l'on partage le rapport pourrait relancer une lecture du journal d'audit avec des droits d'administrateur. Chaque action vérifie donc que celui qui clique est celui qui a installé le menu.
- **Licence Elastic 2.0**, alignée sur les autres projets.

### Modifié
- **Le script est désormais lié à un classeur**, et non autonome. Il n'en crée plus : il écrit dans le classeur qui le porte, et renomme au passage la « Feuille 1 » d'un classeur neuf plutôt que d'y ajouter un onglet et de laisser une feuille orpheline. Le rapport vit là où on le consulte.
- **Le menu passe par `onOpen`, déclencheur simple**, au lieu d'un déclencheur installable. Ce dernier se serait exécuté sous l'identité de celui qui l'aurait posé : toute personne à qui l'on partage le rapport aurait pu relire le journal d'audit avec des droits d'administrateur. Chaque action s'exécute maintenant sous l'identité de qui la déclenche, et un lecteur non administrateur se voit refuser l'accès par Google lui-même — le garde-fou que nous avions écrit devient inutile, et disparaît avec la portée `userinfo.email`.
- **Tout le code passe en ES6+** — `const`/`let`, fonctions fléchées, gabarits de chaîne, `Map`/`Set`. Les points d'entrée restent des `function` déclarées et l'interne s'écrit en `const nom_ = (…) => …` : l'éditeur ne proposant au menu d'exécution que les `function`, la séparation public/privé se lit désormais dans la forme même du code.

### Amélioré
- **Sonde** : nombre de comptes distincts et leurs domaines affichés en tête de rapport — ce qui suffit à reconnaître en une ligne un tenant d'atelier d'un tenant de production.
- **Sonde** : les refus sont ventilés par motif.
- **Facteurs communs** extraits dans `Commun.gs`, partagés par la sonde et le moissonnage.
- **Journal vide traité pour lui-même.** Lorsque la fenêtre ne rend aucun événement, le moissonnage le dit et énumère les trois causes possibles — fenêtre trop courte, rôle d'administrateur insuffisant, tenant qui ne journalise pas — au lieu de laisser l'agrégation échouer en accusant un onglet manquant, qui n'était pas le problème.
- **Surface publique réduite au strict nécessaire.** L'éditeur Apps Script propose par défaut la première fonction du fichier ouvert : l'agrégation, exposée, se lançait donc à la place du moissonnage et échouait faute de données. Elle est devenue privée. Ne subsistent au menu que `sonde`, `sondeEnumeration`, `moissonner`, `etatMoisson`, `annulerMoisson`, `reprendreMoisson` — cible du déclencheur, qui ne peut être privée — et `reagreger`, qui guide au lieu d'échouer lorsqu'il n'y a rien à agréger.

### Corrigé
- **La sonde concluait trop vite sur la volumétrie.** En l'absence d'octets, elle annonçait que la mesure du volume extrait était impossible. Elle distingue désormais deux cas très différents : des événements `activity` existent mais ne portent pas `num_response_bytes` — là, la fonction est bel et bien hors de portée ; ou bien il n'y a aucun événement `activity` du tout, et alors rien n'est démontré, faute d'occasion de mesurer.

### Connu
- L'agrégation lit le brut par lots mais reste dans une seule exécution. Sur un journal très volumineux elle peut atteindre son budget : elle s'arrête alors avec un message explicite, sans rien détruire, le brut restant intact. La rendre reprenable suppose de persister les accumulateurs — à faire seulement si la production le réclame.
- La colonne « Volume » reste vide tant que le tenant ne journalise pas d'événements `activity`.

---

## [0.1.0] - 2026-09-05

> **Le constat qui dérange :** *Un outil qu'on n'a pas d'abord cherché à tuer est un outil qu'on découvre impossible après l'avoir écrit.*
> Le journal d'audit OAuth est adossé à des fonctions réservées à certaines éditions de Workspace, et rien ne garantissait qu'il réponde. Cette version 0.1.0 n'est pas un livrable : c'est une sonde, écrite pour être jetée une fois son verdict rendu.

### Ajouté
- **Sonde de faisabilité** (`Sonde.gs`) : le journal `token` répond-il sur ce tenant, sur quelle profondeur, et les événements portent-ils le volume de données extrait.
- **Mesure du coût d'énumération** (`sondeEnumeration()`) : latence médiane de `Tokens.list` sur un échantillon réparti dans l'annuaire, extrapolée au parc complet et confrontée au quota de l'API Directory.
- **Cadrage du projet** (`README.md`) : périmètre, portées OAuth, limites assumées, principes de conception, découpage des versions.
- **Portée `admin.directory.user.security` volontairement absente du manifeste.** Elle porte la lecture *et* la suppression des jetons, sans variante en lecture seule : elle s'ajoute à la main pour le seul test d'énumération, et se retire ensuite. Aucune suppression n'est jamais appelée.
