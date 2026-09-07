# Journal des modifications (Changelog)

Toutes les modifications notables apportées à ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

---

## [1.5.0] - 2026-09-07

> **Le constat qui dérange :** *Une confirmation qui referme le compte rendu ne confirme rien du tout.*
> Cette version part d'un remaniement d'interface — assistant en panneau latéral, dialogues à la place des alertes natives — dont l'intention était juste et dont trois branchements ne l'étaient pas. Un onglet brut qui ne se vidait plus, un rapport de révocation qui se fermait tout seul, une proposition d'action qui bouclait sans fin. Aucun des trois ne se voyait : le rapport restait plausible. C'est ce qui les rend chers.

### Ajouté
- **Assistant en panneau latéral** (`Sidebar.gs`) : l'étape suivante, ce qui la motive et l'avancement des quatre collectes restent sous les yeux pendant qu'on travaille, au lieu de tenir sur une ligne de menu lue à l'ouverture puis oubliée.
- **Le panneau ne sonde pas le classeur.** L'état ne change que lorsque l'utilisateur agit : la relecture se fait au chargement, après chaque action et sur demande explicite. Un rafraîchissement périodique aurait relu intégralement l'onglet des décisions plusieurs centaines de fois par heure, pour rien.
- **Nouvelle étape « préparer le plan de révocation »**, proposée dès qu'une décision « à bloquer » n'est couverte par aucun plan — le seul moment du déroulé que rien ne rappelait.
- **Table d'actions nommées** (`ACTIONS_`, `Commun.gs`) : une fermeture ne traverse pas `google.script.run`, l'assistant désigne donc ses actions par leur nom. Le banc parcourt la table et vérifie qu'aucune étape ne nomme une action inexistante — sans quoi un nom mal orthographié ferait un bouton qui ne fait rien, en silence.
- **Statuts de décision bilingues** : la liste déroulante s'écrit dans la langue de l'interface, et `estStatut_` reconnaît les deux. Un classeur classé en français ne perd pas une décision en basculant en anglais.
- **Menu, assistant et dialogues de confirmation traduits.** Les noms d'onglets cités dans les messages sont ceux du classeur : citer « _Brut » à qui possède un onglet « _Raw » l'envoie chercher ce qui n'existe pas.

### Corrigé
- **L'onglet brut n'était plus vidé au démarrage d'une campagne.** Le vidage vivait dans l'appelant du menu ; l'assistant et le nouveau dialogue de confirmation ne passaient plus par lui. Or le moissonnage écrit **en ajout**, à partir de `getLastRow()` : une seconde campagne empilait sa fenêtre sur la précédente. Volumes doublés, premières apparitions avancées, aucune erreur affichée. Le vidage appartient désormais à `moissonner()`, seul à savoir distinguer une campagne neuve d'une reprise — une reprise, elle, ne doit surtout pas vider.
- **Le compte rendu se fermait tout seul.** Le bouton de confirmation demandait la fermeture de sa fenêtre au retour du serveur, alors que le serveur venait d'ouvrir par-dessus le dialogue du résultat. Pour une révocation, c'est le seul endroit où l'on apprend ce qui a été supprimé. L'action déclare maintenant si elle produit son propre compte rendu, et le client ne ferme que dans le cas contraire.
- **L'étape « à bloquer » bouclait sans fin.** Le statut ne change pas quand le plan est appliqué : l'assistant reproposait indéfiniment de préparer un plan déjà exécuté, sur un inventaire devenu périmé. La proposition ne vaut désormais que pour les décisions qu'aucun plan ne couvre.
- **Avertissement de révocation de son propre jeton remis en évidence** : il occupe son propre bloc, en tête et en rouge, au lieu d'être ajouté à la suite d'un texte long dans une fenêtre trop courte pour l'afficher.
- **`etatDuTravail_` ne lit plus qu'une fois chaque onglet.** Il tourne à chaque ouverture du classeur et à chaque rafraîchissement de l'assistant ; il lisait deux fois l'onglet des décisions.
- **Commentaires de conception rétablis** dans `WebApp.gs` et `Fiche.gs`, dont celui qui explique pourquoi `XFrameOptionsMode` vaut `DEFAULT` et qu'il n'existe pas de `DENY`. Sans lui, la correction de 1.2.1 se refait.

### Non fait, et pourquoi
- **Les comptes rendus d'exécution restent en français** — les 332 appels à `dire_` et les titres de leurs dialogues. Traduire le titre au-dessus d'un texte français produirait un résultat pire que l'état actuel : c'est un bloc à traiter d'un tenant, avec le guide (39 paragraphes) et l'aide.
- **Le vocabulaire des statuts n'est pas retraduit dans les classeurs existants.** Les valeurs déjà tapées restent telles quelles et continuent d'être reconnues ; seule la liste déroulante suit la langue. Réécrire des décisions humaines pour les uniformiser serait exactement ce que le référentiel interdit.

---

## [1.4.0] - 2026-09-06

> **Le constat qui dérange :** *Celui à qui l'on écrit n'a pas choisi la langue de l'outil — ni l'outil.*
> On lui adresse un reproche poli à propos d'un accès qu'il a accordé, sans lui demander son avis. Le lui écrire dans une langue qu'il ne lit pas serait à la fois inefficace et discourtois. Cette version 1.4.0 traduit d'abord ce qui sort du classeur ; le classeur lui-même suivra.

### Ajouté
- **Réglages de langue** (`Langues.gs`) dans un nouvel onglet `Paramètres` : langue de l'outil, langue par défaut des courriels, et **règles par domaine**.
- **La langue du courriel se décide par destinataire**, dans cet ordre : la colonne `Langue` du plan d'envoi, modifiable à la main ; sinon la règle du domaine ; sinon le défaut. Jamais déduite d'un nom ou d'un prénom.
- **Dictionnaire à clés explicites**, avec substitution par `{nom}` plutôt que par concaténation — l'ordre des mots n'est pas le même d'une langue à l'autre. Une clé absente s'affiche entre chevrons dans le rendu, au lieu de produire un blanc que personne ne remarque. Le banc vérifie que **chaque clé existe dans les deux langues**.
- **Courriel de sollicitation entièrement traduit**, y compris les sept règles de nommage : l'onglet `Modèle` porte désormais un jeu par langue, et le bloc anglais est ajouté à un classeur existant sans lui faire perdre ses amendements.
- **Dates dans la langue du lecteur** : le français met le mois en minuscule et un ordinal au premier du mois, l'anglais capitalise et n'en met pas. Deux règles typographiques que seule la langue décide — d'où deux rendus, et non un format paramétré.
- **Vue de consultation et fiche d'application traduites**, en suivant la langue de l'outil.

### Non fait, et pourquoi
- **Le classeur lui-même reste en français** : menu, dialogues, guide, noms d'onglets et en-têtes de colonnes. Ces derniers servent de clés de lecture en cinquante-trois endroits ; les traduire demande une couche de résolution acceptant les deux langues, faute de quoi un classeur commencé en français cesserait de fonctionner à la bascule. C'est la v1.5, et c'est un ordre de travail, pas un abandon.

### Corrigé
- **Collision de nom évitée avant tout déploiement** : le réglage s'appelait `parametres_`, nom déjà pris par l'aplatissement des paramètres d'un événement du journal. Deux sens, un seul nom global — le projet entier aurait cessé de se charger, et **toutes** les fonctions seraient devenues introuvables. Le contrôle par concaténation des `.gs`, ajouté en 1.2.1, l'a attrapé.

---

## [1.3.1] - 2026-09-06

### Corrigé
- **Les en-têtes de fichier annonçaient des versions fausses.** `Feuille.gs` disait « v0.2, enrichie en v0.4 » alors qu'il avait changé en 0.5, 0.6, 0.7 et 1.3 ; `Inventaire.gs` disait v0.6 après avoir été retouché en 1.1 ; deux fichiers n'annonçaient rien. C'était de l'état dupliqué, qui ne pouvait que dériver. Chaque en-tête dit désormais la version où le module est **apparu** — un fait qui ne change plus — et rien d'autre.
- **La version du projet n'apparaissait nulle part dans le code déployé.** Un déploiement Apps Script sert une copie figée : sans numéro affiché, impossible de savoir ce qui tourne, et c'est exactement ce qui avait rendu le `doGet` introuvable incompréhensible. Une constante unique, `VERSION_`, est désormais montrée dans « À propos » — avec le rappel qu'un écart signifie qu'il faut créer une nouvelle version du déploiement — et en pied de la vue de consultation.
- **La synchronisation est vérifiée, non promise.** Le banc d'essai compare `VERSION_` au contenu du fichier `VERSION`, contrôle que chaque en-tête porte une version d'introduction, et refuse tout en-tête qui prétendrait porter une version courante. Une version affichée et fausse serait pire que pas de version du tout.

---

## [1.3.0] - 2026-09-06

> **Le constat qui dérange :** *Un menu rangé par étapes suppose qu'on sache où l'on en est. C'est précisément ce qu'on oublie.*
> Collecter, suivre, solliciter : l'ordre était logique, et il déplaçait toute la charge sur l'utilisateur, qui devait tenir l'état de tête. Le journal a-t-il été relu depuis ? les profils sont-ils à jour ? reste-t-il un plan d'envoi en attente ? Le menu répond désormais lui-même.

### Modifié
- **La première entrée du menu nomme la prochaine chose à faire** : « Commencer : moissonner le journal », « Relever les jetons actifs », « Classer : 12 applications sans décision », « Terminer : 7 courriels à envoyer ». Elle explique pourquoi avant de lancer quoi que ce soit — un menu qui déciderait à votre place sans le dire serait pire que celui qu'il remplace.
- **Le diagnostic se lit dans les onglets du classeur**, sans rien demander à Google et sans lire l'état des campagnes : `onOpen` est un déclencheur simple aux droits étroits, et il est enveloppé d'un `try` — s'il échoue, le menu apparaît quand même. Un outil sans menu est un outil perdu.
- **On finit ce qu'on a commencé** : un plan de révocation ou de sollicitation en attente passe devant toute collecte manquante. Un plan préparé puis laissé en plan est ce qui se perd le plus facilement, rien ne le rappelle à personne.
- **Le reste est rangé par intention** — Collecter les données, Écrire aux autorisants, Révoquer des accès — et non par étape du traitement. Les sous-menus « Suivre » et « Annuler » disparaissent : ils ne concernaient que les collectes, ils y sont rentrés.
- **La numérotation ne subsiste que là où les gestes s'enchaînent vraiment** : préparer, essayer, envoyer.
- Les chemins de menu ont été repris dans le `README`, le guide de démarrage et l'onglet `Guide`.

### Corrigé
- **« Où en sont les collectes ? » enchaînait deux dialogues, donc n'en montrait qu'un** — le second effaçait le premier sans prévenir. Les comptes rendus d'état et d'annulation sont devenus composables : ils écrivent, et c'est l'appelant qui décide quand afficher. Même correction pour « Arrêter les collectes ».

---

## [1.2.2] - 2026-09-06

### Amélioré
- **Les dates de la vue de consultation et de la fiche s'écrivent en français** : « 6 septembre 2026 », « 1er mai 2026 », « 6 septembre 2026 à 09 h 31 ». Une période entière est convertie d'un coup — « 29 mai 2026 → 5 septembre 2026 » — même noyée dans une phrase, sans qu'il faille savoir d'avance ce que la chaîne contient.
- **Le classeur, lui, conserve `yyyy-MM-dd`**, et ce n'est pas une incohérence : c'est le seul format qui se trie correctement en tant que texte, et tout le reste de l'outil en dépend. La conversion n'intervient qu'à l'affichage, pour des pages destinées à des lecteurs qui ne trient rien. Le banc vérifie les deux : aucune date ISO ne subsiste sur la page publiée, et l'onglet Applications garde les siennes.
- La ligne « Vue du » de la fiche devient « Observée du », plus juste pour des bornes relevées dans un journal.

---

## [1.2.1] - 2026-09-06

### Corrigé
- **`HtmlService.XFrameOptionsMode.DENY` n'existe pas.** L'énumération ne comporte que `ALLOWALL` et `DEFAULT` ; `DENY` valait donc `undefined`, et le vrai service refusait un mode nul — la page ne s'affichait pas du tout. `DEFAULT` est déjà la valeur protectrice, qui pose l'en-tête `X-Frame-Options` normal : c'est `ALLOWALL` qu'il faut se garder d'écrire. Vérifié sur la documentation plutôt que corrigé de mémoire.
- **Le banc d'essai validait ce code faux**, parce que son faux `HtmlService` acceptait n'importe quoi. Il refuse désormais un mode nul, avec le message exact de Google, et son énumération ne porte que les deux valeurs réelles. Réintroduire le défaut dans une copie du projet fait bien échouer le banc : la vérification a été faite.
- **`Portees.gs` déclarait `const A`** pour préfixer les URL de portées. Ce n'était pas un défaut actif, mais un piège : une redéclaration dans un autre fichier aurait fait échouer le chargement du projet entier, et **toutes** les fonctions seraient devenues « introuvables » d'un coup. Renommée `AUTH_`.

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
