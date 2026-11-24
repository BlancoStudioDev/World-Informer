#!/usr/bin/env python3
"""Genera engine/data/event_lexicon.json.

Formato sorgente: per ogni event_type blocchi ``peso: termine, termine, ...``.
* i termini sono minuscoli senza accenti; ``*`` finale = prefisso (stem) sull'ultima parola;
* piu' parole = frase (stessi token del testo; punteggiatura/apostrofi = separatori);
* ``re:...`` = espressione regolare (applicata al testo foldato/minuscolo).
Pesi: 3 = firma forte, 2 = indicativo, 1 = contestuale/debole.
Rilanciare: ``python3 engine/data/build_lexicon.py``.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

LABELS_IT = {
    "trade_policy": "Politica commerciale",
    "monetary_policy": "Politica monetaria",
    "fiscal_policy": "Politica fiscale",
    "regulatory_change": "Cambiamento normativo",
    "geopolitical_conflict": "Conflitto geopolitico",
    "sanctions": "Sanzioni",
    "supply_chain_disruption": "Interruzione della catena di fornitura",
    "pandemic_health": "Emergenza sanitaria",
    "natural_disaster": "Disastro naturale",
    "corporate_event": "Evento societario",
    "market_shock": "Shock di mercato",
    "technology_disruption": "Innovazione tecnologica",
    "labor_social": "Lavoro e questioni sociali",
    "environmental_climate": "Ambiente e clima",
    "other": "Altro",
}
LABELS_EN = {
    "trade_policy": "Trade policy", "monetary_policy": "Monetary policy", "fiscal_policy": "Fiscal policy",
    "regulatory_change": "Regulatory change", "geopolitical_conflict": "Geopolitical conflict", "sanctions": "Sanctions",
    "supply_chain_disruption": "Supply chain disruption", "pandemic_health": "Pandemic / health", "natural_disaster": "Natural disaster",
    "corporate_event": "Corporate event", "market_shock": "Market shock", "technology_disruption": "Technology disruption",
    "labor_social": "Labor & social", "environmental_climate": "Environment & climate", "other": "Other",
}

LEX = {}

LEX["trade_policy"] = """
3: tariff*, dazi, dazio, trade war, trade wars, guerra commerciale, guerra dei dazi, trade deal, trade deals, accordo commerciale, accordi commerciali,
   trade agreement, free trade, libero scambio, export ban, import ban, export controls, export restrictions, controlli sulle esportazioni,
   wto, omc, world trade organization, organizzazione mondiale del commercio, anti dumping, antidumping, trade barrier*, barriere commerciali,
   protectionis*, protezionis*, trade surplus, trade deficit, surplus commerciale, deficit commerciale, disavanzo commerciale, trade talks,
   negoziati commerciali, trade tensions, tensioni commerciali, reciprocal tariff*, dazi reciproci, retaliatory, ritorsion*, customs duties, dazi doganali,
   trade truce, tregua commerciale, trade dispute, controversia commerciale, trade partner*, partner commercial*
2: dogan*, customs, import duties, export duties, embargo on exports, quote import, usmca, nafta, mercosur, cptpp, rcep, trade bloc,
   trade ministers, ministro del commercio, commercio internazionale, international trade, trade policy, politica commerciale, trade relations,
   steel tariffs, aluminium tariffs, aluminum tariffs, dazi sull acciaio, trade representative, ustr, trade restrictions, restrizioni commerciali,
   rare earth exports, export licen*, supply of rare earths, terre rare
1: export*, import*, esportazion*, importazion*, exporters, importers, esportatori, importatori, trade, commercio, shipments to, made in
"""

LEX["monetary_policy"] = """
3: interest rate*, tassi di interesse, tasso di interesse, rate cut*, rate hike*, taglio dei tassi, tagli dei tassi, rialzo dei tassi, rialzi dei tassi,
   taglia i tassi, alza i tassi, taglio tassi, rialzo tassi, central bank*, banca centrale, banche centrali, federal reserve, fed, bce, ecb, boe, boj,
   monetary policy, politica monetaria, quantitative easing, quantitative tightening, inflation target, target di inflazione, rate decision,
   decisione sui tassi, fomc, powell, lagarde, bank of england, bank of japan, banca d inghilterra, banca del giappone, banca centrale europea,
   european central bank, hawkish, dovish, falchi, colombe, basis points, punti base, pivot, tapering, repo rate, refinancing rate, tasso di riferimento,
   benchmark rate, policy rate, key rate, tassi ufficiali, tasso ufficiale, rate path, dot plot, balance sheet reduction
2: inflation, inflazione, disinflation*, deflazione, deflation, cpi, pce, consumer prices, prezzi al consumo, price pressures, treasury yield*,
   rendimenti dei titoli, rendimento del btp, spread btp, spread, btp bund, bond yield*, yield curve, curva dei rendimenti, liquidity, liquidita,
   money supply, lending rates, mortgage rates, tassi sui mutui, mutui, currency intervention, intervento sui cambi, devaluation, svalutazione,
   exchange rate, tasso di cambio, forex reserves, riserve valutarie, money market, mercato monetario, rate*, tassi
1: monetary, monetaria, central bank governor, governatore, banker, banchiere
"""

LEX["fiscal_policy"] = """
3: budget, bilancio statale, legge di bilancio, manovra, finanziaria, fiscal policy, politica fiscale, tax cut*, tax hike*, tax increase*, taglio delle tasse,
   taglio delle imposte, aumento delle tasse, aumento delle imposte, tax reform, riforma fiscale, riforma delle pensioni, pension reform, stimulus package,
   pacchetto di stimoli, stimulus, recovery plan, pnrr, recovery fund, next generation eu, public debt, debito pubblico, government debt, national debt,
   debt ceiling, tetto al debito, deficit, government spending, spesa pubblica, public spending, austerity, austerita, fiscal deficit, deficit fiscale,
   stability pact, patto di stabilita, patto di stabilita e crescita, rating sovrano, sovereign rating, credit rating downgrade, downgrade, declassamento,
   government shutdown, shutdown, bond issuance, emissione di titoli, windfall tax, tassa sugli extraprofitti, extraprofitti, flat tax, rottamazione,
   cuneo fiscale, bonus, subsidies, sussidi, incentivi, incentives
2: tax*, tasse, imposta, imposte, fiscal*, fiscale, treasury, tesoro, ministero dell economia, mef, finance minister, ministro delle finanze,
   ministro dell economia, chancellor of the exchequer, exchequer, spending bill, spending cuts, tagli alla spesa, tagli, taglio, welfare, pensioni, pensions,
   sovereign debt, debito sovrano, public finances, conti pubblici, finanza pubblica, fiscal consolidation, eurobond, eurobonds, tariff revenue, tax credit,
   credito d imposta, iva, vat, irpef, ires, deficit spending
1: spending, spesa, fund*, fondi, funding, finanziamento, finanziamenti, billion, miliardi
"""

LEX["regulatory_change"] = """
3: regulation*, regolamento, regolamentazione, new law, nuova legge, law passed, bill passed, legislation, legislazione, antitrust, anti trust, competition authority,
   autorita garante, garante della concorrenza, consob, banca d italia vigilanza, sec charges, sec sues, sec fines, fined, fine of, multa, multato, sanzionata dall,
   gdpr, data protection, protezione dei dati, digital services act, digital markets act, dma, dsa, ai act, artificial intelligence act, regolamento europeo,
   european commission fines, commissione ue multa, ban on, divieto di, divieto, bans, vieta, vietato, outlaw*, approval, approvazione, approves, approva, approved,
   fda approval, fda approves, ema approval, ema approva, aifa, license revoked, licenza revocata, ruling, sentenza, supreme court ruling, corte suprema,
   court ruling, corte costituzionale, constitutional court, parliament passes, parlamento approva, decree, decreto, decreto legge, executive order, ordine esecutivo,
   mandate, compliance, conformita, crackdown, stretta, stretta normativa, deregulation, deregolamentazione, reform bill, riforma, riforme
1.5: law*, legge, leggi, lawmakers
2: legislatori, legislator*, senate vote, senato vota, parliament vote, voto in parlamento, bill, ddl, proposta di legge, rule*, regole,
   regulator*, regolatore, authority, autorita, watchdog, agency, agenzia, lawsuit, causa legale, class action, litigation, contenzioso, probe, indagine, investigation,
   investigato, court, tribunale, tribunali, judge, giudice, appeal, appello, antitrust probe, istruttoria, privacy, license, licenza, permit, permesso, standard*
1: policy, politica, norm*, normativa, directive, direttiva, treaty, trattato, ratif*, amendment, emendamento, vote, voto, votes
"""

LEX["geopolitical_conflict"] = """
3: war, wars, guerra, guerre, invasion, invasione, invade*, invade, airstrike*, air strike*, raid aereo, raid aerei, attacco aereo, attacchi aerei, bombardamento, bombardamenti,
   bombing, bombed, bombarda*, missile*, missili, drone attack*, attacco con droni, attacco di droni, drones, droni, rocket attack*, razzi, shelling, artillery,
   artiglieria, offensive, offensiva, ceasefire, cease fire, cessate il fuoco, tregua, truce, hostages, ostaggi, hostage, military operation, operazione militare,
   troops, truppe, soldiers, soldati, soldier, drone*, death toll, bilancio delle vittime,
   frontline, fronte, front line, battlefield, campo di battaglia, army, esercito, armed forces, forze armate, military, militare, militari, idf, nato, hamas, hezbollah,
   houthi, houthis, huthi, taliban, wagner, terror*, terrorismo, terrorista, terroristi, attentato, attentati, suicide bomber, kamikaze, car bomb, autobomba, coup, colpo di stato,
   golpe, insurgen*, ribelli, rebels, rebel, militia*, milizie, militants, miliziani, jihad*, genocide, genocidio, ethnic cleansing, pulizia etnica, war crimes, crimini di guerra,
   nuclear strike, attacco nucleare, nuclear threat, minaccia nucleare, escalation, escalate*, intensifies, intensifica, strait of hormuz, stretto di hormuz, naval blockade,
   blocco navale, blockade, blocco, fighter jets, caccia, jets, bomber*, bombardieri, tank*, carri armati, warship*, navi da guerra, aircraft carrier, portaerei, submarine, sottomarino
1.5: killed in, uccisi, uccisa, ucciso, killed, kills, morti, morto, vittime, casualties, feriti, wounded, injured
2.5: raid*
2: supreme leader, guida suprema, ayatollah, successore, successor, regime change, cambio di regime, strike*, attack*, attacco, attacchi, attaccato, attaccano, assault, assalto, clashes, scontri, clash, fighting, combattimenti, combat, battle, battaglia, conflict, conflitto,
   conflitti, defense minister, ministro della difesa, defence, difesa, pentagon, pentagono, weapons, armi, arms, armamenti, munitions, munizioni, ammunition, arms deal, fornitura di armi,
   military aid, aiuti militari, peace talks, colloqui di pace, negoziati di pace, peace deal, accordo di pace, peace plan, piano di pace, evacuat*, evacuazione, evacuate, refugees, rifugiati,
   displaced, sfollati, siege, assedio, occupation, occupazione, occupied, occupato, annex*, annessione, border clash*, scontri al confine, border, confine, incursion*, incursione,
   intercepted, intercettato, air defence, difesa aerea, air defense, explosion*, esplosione, esplosioni, explosions, blast, deflagrazione, gunmen, uomini armati, shooting, sparatoria, hijack*,
   dirottamento, abducted, rapito, kidnapp*, sequestro, sequestrato, civilians, civili, civilian, humanitarian corridor, corridoio umanitario, aid convoy, convoglio umanitario,
   ambassador summoned, ambasciatore convocato, tensions rise, tensioni, tension, escalation of tensions, red lines, linea rossa, deterrence, deterrenza, mobilization, mobilitazione,
   conscription, leva, martial law, legge marziale, state of emergency, stato di emergenza, curfew, coprifuoco
1: security, sicurezza, forces, forze, commander, comandante, general, generale, fire, fuoco, shot, spari, wounded, feriti, injured, ferito, dead, morte, hit, colpito, targets, obiettivo
"""

LEX["sanctions"] = """
3: sanction*, sanzione, sanzioni, sanzionat*, sanzionare, embargo, embargoes, blacklist*, lista nera, black list, asset freeze*, asset freezes, congelamento dei beni, congelamento degli asset,
   frozen assets, beni congelati, asset congelati, travel ban, divieto di viaggio, divieto di ingresso, price cap, tetto al prezzo, tetto al prezzo del petrolio, oil price cap, ofac, treasury sanctions,
   sanzioni del tesoro, secondary sanctions, sanzioni secondarie, sanctions relief, allentamento delle sanzioni, sanctions package, pacchetto di sanzioni, new sanctions, nuove sanzioni,
   sanctions on, sanzioni contro, sanzioni a, sanzioni alla, sanzioni all, sanctioned, sanctioning, snapback, export blacklist, entity list, restrictive measures, misure restrittive, swift,
   expelled from swift, esclusione dallo swift, shadow fleet, flotta ombra, embargo sul petrolio, oil embargo, arms embargo, embargo sulle armi
2: ban on imports, divieto di importazione, import ban, restrictions on, restrizioni, curbs on, penalt*, penalita, punitive measures, misure punitive, measures against, misure contro, isolate*, isolamento,
   isolation, diplomatic pressure, pressione diplomatica, pressure on, pressioni su, sanctions regime, regime sanzionatorio, eu sanctions, sanzioni ue, us sanctions, sanzioni usa, un sanctions, sanzioni onu,
   security council, consiglio di sicurezza, designat*, designazione, designation, delisting, rimozione dalla lista, waiver, deroga, licenza ofac, general license
1: sanctioned, restricted, vietato, vietate, banned, blocked, bloccato, bloccati, tough measures, misure dure
"""

LEX["supply_chain_disruption"] = """
3: supply chain*, catena di approvvigionamento, catene di approvvigionamento, catena di fornitura, catene di fornitura, supply disruption*, interruzione delle forniture, interruzioni delle forniture,
   shortage*, carenza, carenze, scarsita, penuria, chip shortage, carenza di chip, semiconductor shortage, port congestion, congestione portuale, congestione nei porti, shipping disruption*, shipping delays,
   ritardi nelle spedizioni, container shortage, carenza di container, freight rates, tariffe di nolo, costi di spedizione, shipping costs, red sea attacks, attacchi nel mar rosso, suez canal, canale di suez, panama canal,
   canale di panama, strait of hormuz, stretto di hormuz, closure of the strait, chiusura dello stretto, bottleneck*, colli di bottiglia, logistics, logistica, supply crunch, stretta sull offerta, supply squeeze,
   production halt, stop alla produzione, production halted, factory closure*, chiusura di stabilimenti, plant shutdown, stabilimento chiuso, plants idled, rerouting, rotte alternative, rerouted, reroute, deviazione delle rotte,
   cape of good hope, capo di buona speranza, tanker*, petroliera, petroliere, cargo ships, navi cargo, container ship*, portacontainer, ship stranded, nave bloccata, grounded ship, vessel grounded
2: supply, fornitura, forniture, supplies, approvvigionamento, approvvigionamenti, delivery delays, ritardi nelle consegne, delays, ritardi, disruption*, interruzione, interruzioni, disrupted, disrupt*, stockpil*, scorte, scorta,
   stocks, inventories, inventory, magazzino, rationing, razionamento, ration, rare earth, terre rare, critical minerals, minerali critici, raw materials, materie prime, commodity supplies, grain exports, esportazioni di grano,
   grain deal, accordo sul grano, black sea, mar nero, red sea, mar rosso, shipping, spedizioni, shipping lanes, rotte marittime, freight, trasporto merci, cargo, carico, port*, porto, porti, pipeline, gasdotto, oleodotto,
   gas flows, flussi di gas, oil flows, flussi di petrolio, nord stream, rail freight, trasporto ferroviario, trucking, autotrasporto, blockade of ports, blocco dei porti, lorry drivers, camionisti
1: transport*, trasporto, trasporti, logistic*, maritime, marittimo, vessels, navi, ships, nave, containers, container, warehouse, magazzini
"""

LEX["pandemic_health"] = """
3: pandemic, pandemia, epidemic, epidemia, outbreak*, focolaio, focolai, virus, viral, virale, covid, covid 19, coronavirus, sars, mers, ebola, marburg, cholera, colera, measles, morbillo, mpox, monkeypox, vaiolo delle scimmie,
   bird flu, avian flu, influenza aviaria, aviaria, h5n1, flu, influenza, swine flu, influenza suina, dengue, malaria, zika, polio, plague, peste, tuberculosis, tubercolosi, hiv, aids, hepatitis, epatite, meningitis, meningite,
   vaccine*, vaccino, vaccini, vaccinazione, vaccination, immunization, immunizzazione, quarantine, quarantena, lockdown, public health emergency, emergenza sanitaria, emergenza di salute pubblica, who declares, oms dichiara, oms,
   world health organization, organizzazione mondiale della sanita, health emergency, cdc, ecdc, infection*, infezione, infezioni, contagio, contagi, contagious, contagioso, infected, infetti, infettati, case count, casi confermati,
   confirmed cases, nuovi casi, new cases, hospitalizations, ricoveri, ricoverati, hospitalized, death toll from, morti per, mortality rate, tasso di mortalita, super bug, superbug, antibiotic resistance, antibiotico resistenza,
   health crisis, crisi sanitaria, contaminat*, contaminazione, food poisoning, intossicazione alimentare, listeria, salmonella, e coli, drug shortage, carenza di farmaci, medicine shortage
2: health, salute, sanita, sanitario, sanitaria, hospital*, ospedale, ospedali, doctors, medici, medico, nurses, infermieri, patients, pazienti, disease*, malattia, malattie, illness, symptoms, sintomi, treatment, trattamento, cure,
   cura, drug, farmaco, farmaci, pharmaceutical*, farmaceutic*, clinical trial*, sperimentazione clinica, trial results, fda, ema, medicine*, medicina, healthcare, assistenza sanitaria, cancer, cancro, tumore, tumori, obesity,
   obesita, diabetes, diabete, heart attack, infarto, mental health, salute mentale, epidemiolog*, pathogen*, patogeno, mutation, mutazione, variant*, variante, varianti, lab leak, vaccine mandate, obbligo vaccinale
1: medical, medico, medici, clinic*, clinica, therapy, terapia, wellness, benessere, drugmaker, casa farmaceutica, biotech
"""

LEX["natural_disaster"] = """
3: earthquake*, terremoto, terremoti, sisma, sismico, scossa, scosse, aftershock*, tremor*, magnitude, magnitudo, richter, seismic, tsunami, maremoto, volcano*, vulcano, vulcani, eruption, eruzione, erupts, erutta, erupt*,
   hurricane*, uragano, uragani, typhoon*, tifone, tifoni, cyclone*, ciclone, cicloni, tropical storm*, tempesta tropicale, tornado*, tornadoes, storm*, tempesta, tempeste, maltempo, nubifragio, nubifragi, bomba d acqua,
   flood*, alluvione, alluvioni, inondazione, inondazioni, esondazione, esondato, flash flood*, landslides, landslide in, landslide kills, landslide hits, deadly landslide, frana, frane, smottamento, mudslide*, avalanche*, valanga, valanghe, wildfire*, incendio boschivo, incendi boschivi,
   incendi, bushfire*, forest fire*, heatwave*, ondata di caldo, ondata di calore, caldo record, cold snap, ondata di freddo, blizzard, bufera, snowstorm, nevicata, nevicate, drought*, siccità, siccita, famine, carestia,
   natural disaster*, disastro naturale, calamita naturale, calamita, state of emergency declared, stato di emergenza, evacuation orders, ordine di evacuazione, evacuated, evacuati, evacuate*, rescue*, soccorsi, soccorritori,
   rescuers, search and rescue, ricerche dei dispersi, rubble, macerie, collapsed buildings, edifici crollati, death toll rises, bilancio sale, sinkhole, voragine
2: disaster*, disastro, disastri, devastat*, devastazione, devastating, devastante, destroyed, distrutto, destroyed homes, case distrutte, damage, danni, danneggiato,
1: victims, vittime, dead, morti, killed, uccisi, injured, feriti,
2:
   survivors, sopravvissuti, relief efforts, aiuti umanitari, emergency services, protezione civile, civil protection, firefighters, vigili del fuoco, red alert, allerta rossa, allerta meteo, weather warning, avviso meteo,
   rainfall, piogge, heavy rain, pioggia intensa, rains, monsoon, monsone, el nino, la nina, sea level, innalzamento del mare, coastal, costiero, power outages, blackout, blackouts, crisi idrica, water crisis
1.5: missing, dispersi, dispersa
1: weather, meteo, rain, pioggia, wind, vento, snow, neve, fire, incendio, fires, quake, scossa di terremoto, emergency, emergenza
"""

LEX["corporate_event"] = """
3: merger*, fusione, fusioni, acquisition*, acquisizione, acquisizioni, takeover*, opa, offerta pubblica, offerta pubblica di acquisto, offerta pubblica di scambio, ops, buyout, leveraged buyout, acquires, acquisisce, acquista,
   acquired, acquisita, buys, to buy, to acquire, bid for, offerta per, bids, hostile bid, offerta ostile, ipo, quotazione in borsa, debutto in borsa, listing, delisting, going public, spin off, spin-off, scorporo, divestiture,
   cessione, cede, sells unit, vende la divisione, bankruptcy, bancarotta, bankrupt, fallimento, fallita, chapter 11, insolvency, insolvenza, administration, amministrazione controllata, liquidation, liquidazione, default on,
   earnings, utili, profit*, profitto, profitti, quarterly results, risultati trimestrali, conti trimestrali, trimestrale, semestrale, annual results, bilancio annuale, revenue, ricavi, fatturato, guidance, outlook, profit warning,
   profit alert, avviso sugli utili, beats estimates, batte le attese, misses estimates, delude le attese, share buyback, buyback, riacquisto di azioni, dividend*, dividendo, dividendi, ceo, amministratore delegato, chief executive,
   resigns, si dimette, steps down, lascia, appointed ceo, nuovo ceo, nuovo amministratore delegato, layoffs, licenziamenti, job cuts, tagli di personale, tagli al personale, restructuring, ristrutturazione, plant closure,
   chiusura dello stabilimento, recall*, richiamo, ritiro dal mercato, data breach, violazione dei dati, cyberattack on, attacco informatico a
2: company, azienda, aziende, societa, group, gruppo, shares, azioni, titolo, titoli, stock, stocks, investors, investitori, investor, investitore, shareholders, azionisti, shareholder, board, cda, consiglio di amministrazione,
   chairman, presidente, executive, dirigente, managers, manager, startup*, start up, unicorn, funding round, round di finanziamento, venture capital, private equity, fondo, fondi, stake, quota, partecipazione, joint venture,
   partnership, partnership with, partnership con, accordo con, deal, accordo, contract, contratto, order, ordine, orders, ordini, plant, stabilimento, factory, fabbrica, production, produzione, launch, lancia, lancio, launches,
   brand, marchio, retailer*, distribuzione, bank*, banca, banche, insurer*, assicurazion*, airline*, compagnia aerea, carmaker*, casa automobilistica, automaker, oil major, big oil, energy giant, colosso, giant, big tech
1: firm, impresa, imprese, business, industry, industria, corporate, aziendale, sales, vendite, growth, crescita, expansion, espansione, plan, piano
"""

LEX["market_shock"] = """
3: crash*, crollo, crolla, crollano, crollate, collapse of, plunge*, plunges, plunged, tonfo, tonfi, tracollo, tracollano, sell off, selloff, sell-off, vendite, vendite massicce, panic selling, panico, panic, rout, bloodbath, carneficina,
   black monday, lunedi nero, black friday crash, circuit breaker, sospensione delle contrattazioni, trading halted, trading halt, volatility, volatilita, vix, flight to safety, fuga verso i beni rifugio, safe haven, bene rifugio,
   beni rifugio, bank run, corsa agli sportelli, bank failure, fallimento di una banca, liquidity crisis, crisi di liquidita, credit crunch, stretta del credito, contagion, contagio finanziario, financial crisis, crisi finanziaria,
   recession, recessione, slump, depression, depressione, stock market, borsa, wall street, piazza affari, ftse mib, dax, cac 40, nikkei, hang seng, s&p 500, nasdaq, dow jones, dow, ftse, stoxx, euro stoxx, indici, indice,
   oil price*, prezzo del petrolio, prezzi del petrolio, petrolio, brent, wti, crude, greggio, gas price*, prezzo del gas, ttf, gas naturale, natural gas, gold price, prezzo dell oro, bitcoin, crypto*, criptovalute, ether,
   ethereum, spread btp bund, spread, rendimenti, yield*, rally, impennata, surge*, soar*, soars, schizza, tumble*, tumbles, slumps, ribasso, ribassi
1.5: rialzo, rialzi, rialza, balzo, balza, impenna, vola, falls, cade, cadono, cala, calo, cali, perde, perdono, slide*, slides, drop*, drops, dropped, sinks, affonda, affondano
2: stocks fall, stocks rise, borsa in calo, borsa in rialzo, borse europee, borse asiatiche, chiusura, chiude in calo, chiude in rialzo, apertura, apre in calo, apre in rialzo, listini, listino, trading,
   traders, trader, trading session, seduta, sedute, seduta di borsa, bull market, bear market, correction, correzione, selling pressure, pressione sui mercati, risk off, risk on, investors flee, investitori fuggono, investors dump,
   capital flight, fuga di capitali, bond market, mercato obbligazionario, credit default swap, cds, junk, spazzatura, rating cut, taglio del rating, billion wiped, miliardi bruciati, bruciati, in fumo, market cap, capitalizzazione,
   capitalizzazione di borsa, market value, valore di mercato, commodit*, materie prime, futures, future, derivati, derivatives, hedge fund*, margin call, short selling, vendite allo scoperto, liquidation, liquidazioni
1.5: borse, mercato, mercati, markets
1: euro, dollar, dollaro, yen, sterlina, franco svizzero, yuan, renminbi, oro, percent, per cento, percentuale, points, punti, index, price, prezzo, prezzi, costs, costi, rise, sale, rises, aumenta, fall, scende, decline, calano, gain, guadagna, loss, perdita
"""

LEX["technology_disruption"] = """
3: artificial intelligence, intelligenza artificiale, ai model*, modello ai, modelli ai, generative ai, ai generativa, chatgpt, openai, anthropic, gemini, llm, large language model*, deepfake*, machine learning, apprendimento automatico,
   chatbot, ai chip*, chip ai, semiconductor*, semiconduttori, semiconduttore, chip, chips, microchip, gpu, nvidia, tsmc, asml, intel, amd, qualcomm, arm holdings, quantum computing, calcolo quantistico, quantum, quantistico,
   cyberattack*, attacco informatico, attacchi informatici, cyber attack, cyber attacks, hack*, hacker, hackers, hackeraggio, ransomware, malware, data breach, data leak, fuga di dati, violazione di dati, cybersecurity,
   sicurezza informatica, cyber security, cyber, zero day, vulnerability, vulnerabilita, outage, interruzione del servizio, blackout informatico, global outage, down, crowdstrike, 5g, 6g, satellite*, satelliti, starlink, spacex,
   rocket launch, lancio di un razzo, lancio del razzo, space mission, missione spaziale, nasa, esa, artemis, moon landing, allunaggio, robot*, robotica, humanoid, umanoide, autonomous vehicle*, guida autonoma, self driving,
   electric vehicle*, veicoli elettrici, auto elettriche, auto elettrica, battery, batteria, batterie, solid state battery, fusion energy, fusione nucleare, nuclear fusion, breakthrough, scoperta, svolta tecnologica, innovation, innovazione
2: tech, tecnologia, tecnologico, tecnologica, technology, technological, digital, digitale, digitalizzazione, software, hardware, app, apps, platform*, piattaforma, piattaforme, cloud, data center, data centre, datacenter,
   internet, online, web, social network, social media, tiktok, meta, facebook, instagram, x corp, twitter, youtube, google, alphabet, microsoft, apple, iphone, samsung, huawei, amazon, aws, tesla, byd, drone*, droni,
   space, spazio, spaziale, orbit*, orbita, telecom*, telecomunicazioni, broadband, banda larga, fibra, fiber, streaming, gaming, videogiochi, videogame, console, metaverse, blockchain, nft, fintech, edtech, biotech, biotecnologie,
   crispr, gene editing, editing genetico, lab grown, carne coltivata, 3d printing, stampa 3d, cybercrime, crimine informatico, cyberspionage, spionaggio informatico
1: innovat*, startup, ricerca, research, scientists, scienziati, scientific, scientifico, study, studio, discovery, scoperta, new, nuovo
"""

LEX["labor_social"] = """
3: strike action, sciopero, scioperi, scioperare, sciopero generale, general strike, walkout, walk out, picket*, picchetti, industrial action, azione sindacale, trade union*, sindacato, sindacati, union*, unions, cgil, cisl, uil, usb,
   labor dispute, labour dispute, vertenza sindacale, vertenza, labor market, mercato del lavoro, unemployment, disoccupazione, jobless, jobless claims, richieste di sussidio, nonfarm payrolls, payrolls, non farm payrolls, jobs report,
   rapporto sul lavoro, occupazione, employment, posti di lavoro, job losses, perdita di posti di lavoro, lay offs, licenziamenti, esuberi, cassa integrazione, minimum wage, salario minimo, wage*, salari, stipendi, stipendio, pay rise,
   aumento salariale, pay cut, taglio dello stipendio, collective bargaining, contrattazione collettiva, contratto collettivo, rinnovo contrattuale, protest*, proteste, protesta, protestors, manifestanti, demonstrat*, manifestazione,
   manifestazioni, corteo, cortei, riot*, rivolta, rivolte, disordini, unrest, civil unrest, tumulti, clashes with police, scontri con la polizia, strike*, workers, lavoratori, lavoratrici, labor*, labour, lavoro, riders, rider,
   gig workers, immigration, immigrazione, migranti, migrants, migrant, asylum, asilo, refugee crisis, crisi dei rifugiati, deportation*, deportazioni, deportati, expulsion, espulsioni, human rights, diritti umani, discrimination,
   discriminazione, inequality, disuguaglianza, poverty, poverta, cost of living, costo della vita, caro vita, housing crisis, emergenza abitativa, pensions protest, strike over
2: employees, dipendenti, staff, personale, workforce, forza lavoro, hiring, assunzioni, recruitment, jobs, lavoro, job, occupati, worker, lavoratore, pilots strike, scioperi dei piloti, rail strike, sciopero dei treni,
   transport strike, sciopero dei trasporti, teachers strike, sciopero degli insegnanti, doctors strike, sciopero dei medici, uber, deliveroo, amazon workers, labour party, welfare, reddito di cittadinanza, assegno unico, bonus,
   social security, previdenza, school, scuola, university, universita, education, istruzione, students, studenti, women's rights, diritti delle donne, abortion, aborto, lgbt*, gender, genere, equal pay, parita salariale, racism,
   razzismo, police brutality, violenza della polizia, vigil, veglia, petition, petizione, campaign, campagna
1: social, sociale, sociali, society, societa, community, comunita, citizens, cittadini, public, pubblico, people, persone, families, famiglie, youth, giovani
"""

LEX["environmental_climate"] = """
3: climate change, cambiamento climatico, cambiamenti climatici, crisi climatica, global warming, riscaldamento globale, emissions, emissioni, co2, carbon dioxide, anidride carbonica, carbon*, carbonio, greenhouse gas*, gas serra,
   net zero, zero emissioni, carbon neutral*, neutralita carbonica, cop28, cop29, cop30, cop31, cop, climate summit, vertice sul clima, climate conference, conferenza sul clima, paris agreement, accordo di parigi, ipcc,
   renewable*, rinnovabili, rinnovabile, solar, solare, fotovoltaico, wind farm*, parco eolico, eolico, wind power, energia eolica, offshore wind, hydrogen, idrogeno, green hydrogen, idrogeno verde, green energy, energia verde,
   clean energy, energia pulita, energy transition, transizione energetica, green deal, ets, emissions trading, carbon tax, carbon market, mercato del carbonio, fossil fuel*, combustibili fossili, coal, carbone, phase out,
   phase-out, coal plant, centrale a carbone, deforestation, deforestazione, biodiversity, biodiversita, extinction, estinzione, endangered, in via di estinzione, pollution, inquinamento, polluted, inquinato, air quality, qualita dell aria,
   plastic*, plastica, microplastics, microplastiche, oil spill, sversamento di petrolio, marea nera, toxic, tossico, tossici, sea level rise, glacier*, ghiacciaio, ghiacciai, ice sheet, calotta, arctic, artico, antarctic*, antartide,
   permafrost, melting, scioglimento, coral, corallo, coral bleaching, sbiancamento, sustainab*, sostenibilita, sostenibile, esg, greenwashing, activists, attivisti, extinction rebellion, fridays for future, just stop oil, ultima generazione,
   environmentalists, ambientalisti, nuclear waste, scorie nucleari, radioactive, radioattivo, radioattiva, nuclear plant, centrale nucleare, nuclear power, energia nucleare
2: environment, ambiente, ambientale, climate, clima, climatico, green, verde, ecological, ecologico, eco, wildlife, fauna, flora, forest*, foresta, foreste, ocean*, oceano, oceani, sea, mare, water, acqua, waste, rifiuti, recycl*,
   riciclo, riciclaggio, circular economy, economia circolare, energy, energia, electricity, elettricita, power grid, rete elettrica, grid, oil, petrolio, gas, lng, gnl, rigassificatore, opec, opec+, drilling, trivellazione,
   trivelle, fracking, shale, pipeline, gasdotto, mining, estrazione, miniera, lithium, litio, cobalt, cobalto, nickel, zinc, rare earth
1: nature, natura, planet, pianeta, earth, terra, future generations, generazioni future, temperature, temperature record, record di temperatura, hottest, piu caldo
"""

LEX["other"] = """
3: football, calcio, serie a, champions league, europa league, premier league, la liga, bundesliga, ligue 1, coppa italia, world cup, mondiali, mondiale, euro 2028, olympic*, olimpiadi, olimpico, olimpiade, formula 1, f1, motogp,
   gran premio, grand prix, tennis, wimbledon, roland garros, us open, australian open, atp, wta, nba, nfl, mlb, nhl, super bowl, basket, pallacanestro, volley, pallavolo, rugby, cycling, ciclismo, giro d italia, tour de france,
   golf, boxing, boxe, ufc, marathon, maratona, transfer window, calciomercato, mercato dei trasferimenti, derby, scudetto, serie b, playoff, finale, semifinale, quarti di finale, trofeo, trophy, medal*, medaglia, medaglie, gold medal,
   oscar, oscars, academy awards, golden globe*, grammy*, emmy*, cannes, festival di cannes, venice film festival, mostra del cinema, festival di sanremo, sanremo, eurovision, concert*, concerto, concerti, tour, album, singolo,
   movie, film, cinema, box office, incassi, netflix series, serie tv, tv series, reality show, grande fratello, x factor, amici, celebrity, celebrita, gossip, royal family, famiglia reale, wedding, matrimonio, nozze, divorce, divorzio,
   obituary, necrologio, muore, dies aged, died aged, e morto, e morta
2: horoscope, oroscopo, recipe, ricetta, ricette, travel, viaggi, vacanze, holiday, holidays, tourism, turismo, fashion, moda, sfilata, fashion week, lifestyle, food, cibo, cucina, chef, restaurant, ristorante, wine, vino, music, musica,
   art, arte, museum, museo, exhibition, mostra, theatre, teatro, book, libro, libri, novel, romanzo, author, autore, writer, scrittore, poet, poeta, award, premio, prize, nobel, literature, letteratura, anniversary, anniversario,
   weather forecast, previsioni del tempo, lottery, lotto, superenalotto, jackpot, crime, cronaca nera, cronaca, murder, omicidio, trial, processo, arrested, arrestato, police, polizia, carabinieri, court case, caso giudiziario,
   election*, elezioni, elettorale, ballot, ballottaggio, campaign trail, campagna elettorale, polls, sondaggi, sondaggio, poll shows, primary, primarie, candidate, candidato, candidati, mayor, sindaco, referendum, parliament, parlamento
0.5: government crisis, crisi di governo, cabinet reshuffle, rimpasto, reshuffle, resignation, dimissioni, coalition, coalizione, opposition, opposizione, majority, maggioranza, minister, ministro, ministri, summit, vertice, meeting, incontro,
   visit, visita, talks, colloqui, press conference, conferenza stampa, interview, intervista, statement, dichiarazione, declares, dichiara, says, dice, said, ha detto
1: sport, sports, match, partita, partite, team, squadra, game, giochi, player, giocatore, coach, allenatore, fans, tifosi, star, stella, season, stagione, win, vittoria, loss, sconfitta
"""

def main():
    types = {}
    for etype, block in LEX.items():
        terms = []
        seen = {}
        cur_w = 1.0
        for line in block.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            head = line.split(":", 1)[0]
            if head.isdigit() or head.replace(".", "", 1).isdigit():
                cur_w = float(head)
                rest = line.split(":", 1)[1]
            else:
                rest = line
            for t in rest.split(","):
                t = t.strip().lower()
                if not t:
                    continue
                # tieni il peso massimo se duplicato
                if t in seen:
                    seen[t] = max(seen[t], cur_w)
                else:
                    seen[t] = cur_w
        terms = [[t, w] for t, w in seen.items()]
        types[etype] = terms
    doc = {"version": 2, "labels_it": LABELS_IT, "labels_en": LABELS_EN, "types": types}
    out = os.path.join(HERE, "event_lexicon.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=0)
    for k, v in types.items():
        print(f"{k:26s}{len(v)}")
    print("->", out)


if __name__ == "__main__":
    main()
