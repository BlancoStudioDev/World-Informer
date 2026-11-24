"""Costanti e parametri dell'engine.

SECTOR_SENSITIVITY e' copiata da News-Evaluator (newssystem/config.py).
COUNTRY_RISK e' indicizzato per iso2 (scala 0-10, stile Damodaran: 0 = rischio minimo).
"""

SECTOR_SENSITIVITY = {
    "trade_policy": {"energy": 0.6, "materials": 1.8, "industrials": 1.5, "consumer_discretionary": 1.2, "consumer_staples": 0.7, "health_care": 0.5, "financials": 0.8, "information_technology": 1.4, "communication_services": 0.6, "utilities": 0.3, "real_estate": 0.4},
    "monetary_policy": {"energy": 0.6, "materials": 0.5, "industrials": 0.7, "consumer_discretionary": 0.8, "consumer_staples": 0.9, "health_care": 0.7, "financials": 1.8, "information_technology": 0.8, "communication_services": 0.7, "utilities": 1.5, "real_estate": 1.7},
    "fiscal_policy": {"energy": 0.7, "materials": 0.8, "industrials": 1.2, "consumer_discretionary": 1.0, "consumer_staples": 0.8, "health_care": 1.3, "financials": 1.2, "information_technology": 0.9, "communication_services": 0.7, "utilities": 0.8, "real_estate": 1.1},
    "regulatory_change": {"energy": 0.7, "materials": 0.9, "industrials": 0.8, "consumer_discretionary": 0.9, "consumer_staples": 0.8, "health_care": 1.6, "financials": 1.5, "information_technology": 1.3, "communication_services": 1.2, "utilities": 0.8, "real_estate": 0.9},
    "geopolitical_conflict": {"energy": 1.7, "materials": 1.2, "industrials": 1.3, "consumer_discretionary": 1.2, "consumer_staples": 0.5, "health_care": 0.4, "financials": 1.4, "information_technology": 0.9, "communication_services": 0.8, "utilities": 0.4, "real_estate": 0.6},
    "sanctions": {"energy": 1.5, "materials": 1.7, "industrials": 1.4, "consumer_discretionary": 1.1, "consumer_staples": 0.6, "health_care": 0.4, "financials": 1.6, "information_technology": 1.3, "communication_services": 0.9, "utilities": 0.5, "real_estate": 0.7},
    "supply_chain_disruption": {"energy": 0.8, "materials": 1.4, "industrials": 1.7, "consumer_discretionary": 1.5, "consumer_staples": 1.0, "health_care": 1.1, "financials": 0.5, "information_technology": 1.5, "communication_services": 0.7, "utilities": 0.3, "real_estate": 0.4},
    "pandemic_health": {"energy": 1.5, "materials": 0.6, "industrials": 0.9, "consumer_discretionary": 1.6, "consumer_staples": 0.7, "health_care": 1.8, "financials": 0.8, "information_technology": 0.7, "communication_services": 0.8, "utilities": 0.4, "real_estate": 0.9},
    "natural_disaster": {"energy": 1.3, "materials": 0.9, "industrials": 0.8, "consumer_discretionary": 0.7, "consumer_staples": 0.6, "health_care": 0.8, "financials": 0.7, "information_technology": 0.4, "communication_services": 0.5, "utilities": 1.4, "real_estate": 1.3},
    "corporate_event": {"energy": 0.6, "materials": 0.7, "industrials": 0.8, "consumer_discretionary": 1.2, "consumer_staples": 1.0, "health_care": 1.1, "financials": 1.2, "information_technology": 1.1, "communication_services": 1.0, "utilities": 0.6, "real_estate": 0.8},
    "market_shock": {"energy": 1.2, "materials": 1.1, "industrials": 1.2, "consumer_discretionary": 1.3, "consumer_staples": 0.8, "health_care": 0.7, "financials": 1.8, "information_technology": 1.4, "communication_services": 1.2, "utilities": 0.8, "real_estate": 1.1},
    "technology_disruption": {"energy": 0.5, "materials": 0.6, "industrials": 1.1, "consumer_discretionary": 1.2, "consumer_staples": 0.5, "health_care": 1.3, "financials": 1.0, "information_technology": 1.8, "communication_services": 1.4, "utilities": 0.6, "real_estate": 0.5},
    "labor_social": {"energy": 0.8, "materials": 0.9, "industrials": 1.4, "consumer_discretionary": 1.3, "consumer_staples": 0.7, "health_care": 1.2, "financials": 0.6, "information_technology": 0.7, "communication_services": 0.8, "utilities": 0.9, "real_estate": 0.6},
    "environmental_climate": {"energy": 1.8, "materials": 1.3, "industrials": 1.0, "consumer_discretionary": 0.9, "consumer_staples": 0.7, "health_care": 0.5, "financials": 0.7, "information_technology": 0.5, "communication_services": 0.4, "utilities": 1.5, "real_estate": 1.0},
    "other": {"energy": 1.0, "materials": 1.0, "industrials": 1.0, "consumer_discretionary": 1.0, "consumer_staples": 1.0, "health_care": 1.0, "financials": 1.0, "information_technology": 1.0, "communication_services": 1.0, "utilities": 1.0, "real_estate": 1.0},
}

# Rischio paese 0-10 per iso2 (0 = minimo). "default" per i paesi non elencati.
COUNTRY_RISK = {
    "default": 2.0,
    # Nord America / Oceania / Europa occidentale
    "US": 0.0, "CA": 0.3, "MX": 2.0, "AU": 0.4, "NZ": 0.3,
    "DE": 0.2, "FR": 0.4, "GB": 0.3, "IT": 1.5, "ES": 1.0, "PT": 1.2, "NL": 0.3, "BE": 0.5,
    "LU": 0.1, "CH": 0.1, "AT": 0.3, "IE": 0.4, "DK": 0.2, "SE": 0.3, "NO": 0.3, "FI": 0.4,
    "IS": 0.5, "EU": 0.3, "MT": 1.5, "AD": 0.5, "LI": 0.3, "MC": 0.3, "SM": 0.8, "VA": 0.3,
    "GR": 2.5, "CY": 2.0,
    # Europa centro-orientale
    "PL": 1.5, "CZ": 1.0, "SK": 1.5, "SI": 1.2, "EE": 0.8, "LV": 1.0, "LT": 1.0, "HU": 2.5,
    "RO": 2.8, "BG": 2.5, "HR": 2.0, "RS": 4.0, "BA": 5.5, "AL": 4.0, "MK": 4.0, "ME": 3.5,
    "XK": 5.5, "MD": 5.5, "BY": 6.5, "UA": 8.5, "RU": 6.5,
    # Medio Oriente
    "IR": 8.5, "IL": 6.0, "PS": 9.0, "LB": 8.5, "SY": 9.0, "IQ": 8.0, "YE": 9.5, "JO": 4.0,
    "SA": 2.5, "AE": 2.0, "QA": 1.0, "KW": 1.5, "BH": 3.5, "OM": 3.0, "TR": 4.5, "EG": 6.0,
    # Asia
    "CN": 1.2, "JP": 0.3, "KR": 0.8, "TW": 2.5, "HK": 1.5, "KP": 7.5, "IN": 2.0, "PK": 7.0,
    "BD": 5.5, "LK": 7.0, "NP": 5.5, "BT": 3.5, "MV": 6.5, "AF": 9.0, "ID": 2.5, "MY": 1.5,
    "SG": 0.2, "TH": 2.5, "VN": 3.5, "PH": 3.0, "KH": 4.5, "LA": 7.5, "MM": 8.5, "BN": 1.5,
    "TL": 5.0, "MN": 4.5, "KZ": 3.5, "UZ": 4.5, "KG": 5.5, "TJ": 5.5, "TM": 5.5, "AZ": 4.0,
    "AM": 4.5, "GE": 4.0,
    # Africa
    "ZA": 3.0, "NG": 5.0, "KE": 4.5, "ET": 7.5, "GH": 5.5, "MA": 3.0, "TN": 5.5, "DZ": 4.0,
    "LY": 8.5, "SD": 9.5, "SS": 9.5, "SO": 9.5, "CD": 9.0, "CF": 9.0, "ML": 8.5, "BF": 8.5,
    "NE": 8.0, "TD": 8.0, "CM": 6.0, "MZ": 7.0, "ZW": 7.5, "ZM": 6.0, "AO": 5.5, "TZ": 4.0,
    "UG": 5.0, "RW": 4.5, "BI": 8.0, "ER": 8.0, "SN": 4.5, "CI": 4.0, "GN": 7.0, "GW": 7.5,
    "SL": 6.5, "LR": 6.5, "TG": 5.5, "BJ": 5.0, "MR": 6.0, "NA": 3.5, "BW": 2.5, "MG": 6.0,
    "MW": 6.5, "LS": 6.0, "SZ": 5.5, "GA": 5.0, "CG": 6.5, "GQ": 6.5, "DJ": 5.0, "KM": 6.0,
    "CV": 4.0, "ST": 6.0, "GM": 6.5, "MU": 2.5, "SC": 3.0, "EH": 6.0,
    # Americhe
    "BR": 3.5, "AR": 9.0, "CL": 1.5, "CO": 4.0, "PE": 4.0, "VE": 8.5, "EC": 6.5, "BO": 7.5,
    "UY": 2.0, "PY": 4.5, "CU": 7.5, "HT": 9.0, "DO": 3.5, "GT": 5.0, "HN": 6.5, "SV": 6.0,
    "NI": 7.0, "CR": 3.0, "PA": 3.0, "JM": 5.0, "TT": 3.5, "BS": 4.0, "BB": 4.0, "BZ": 5.5,
    "GY": 4.5, "SR": 6.5, "GL": 1.0, "AG": 4.0, "DM": 4.5, "GD": 4.0, "KN": 4.0, "LC": 4.0, "VC": 4.5,
    # Oceania
    "PG": 6.0, "FJ": 5.0, "WS": 4.0, "TO": 4.0, "VU": 4.5, "SB": 5.0, "KI": 5.0, "TV": 4.5,
    "NR": 4.5, "PW": 3.5, "MH": 4.0, "FM": 4.0,
}

# Rischio dei paesi dell'ex config (chiavi testuali) -> iso2, per compatibilita'.
LEGACY_COUNTRY_KEYS = {
    "italy": "IT", "uae": "AE", "saudi_arabia": "SA", "iran": "IR", "israel": "IL", "usa": "US", "china": "CN",
    "united_kingdom": "GB", "germany": "DE", "france": "FR", "japan": "JP", "india": "IN", "brazil": "BR",
    "russia": "RU", "turkey": "TR", "south_korea": "KR", "australia": "AU", "canada": "CA", "mexico": "MX",
    "indonesia": "ID", "south_africa": "ZA", "nigeria": "NG", "argentina": "AR", "european_union": "EU",
    "ukraine": "UA",
}

ALL_SECTORS = [
    "energy", "materials", "industrials", "consumer_discretionary",
    "consumer_staples", "health_care", "financials", "information_technology",
    "communication_services", "utilities", "real_estate",
]

ALL_EVENT_TYPES = [
    "trade_policy", "monetary_policy", "fiscal_policy", "regulatory_change",
    "geopolitical_conflict", "sanctions", "supply_chain_disruption",
    "pandemic_health", "natural_disaster", "corporate_event", "market_shock",
    "technology_disruption", "labor_social", "environmental_climate", "other",
]

SECTOR_LABELS_IT = {
    "energy": "Energia",
    "materials": "Materiali",
    "industrials": "Industriali",
    "consumer_discretionary": "Beni di consumo discrezionali",
    "consumer_staples": "Beni di consumo di base",
    "health_care": "Sanità",
    "financials": "Finanza",
    "information_technology": "Tecnologia",
    "communication_services": "Servizi di comunicazione",
    "utilities": "Servizi di pubblica utilità",
    "real_estate": "Immobiliare",
}

EVENT_LABELS_IT = {
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

# Persistenza tipica dell'impatto (giorni) per tipo di evento.
PERSISTENCE_DAYS = {
    "trade_policy": 90,
    "monetary_policy": 45,
    "fiscal_policy": 90,
    "regulatory_change": 120,
    "geopolitical_conflict": 90,
    "sanctions": 120,
    "supply_chain_disruption": 45,
    "pandemic_health": 90,
    "natural_disaster": 14,
    "corporate_event": 30,
    "market_shock": 7,
    "technology_disruption": 60,
    "labor_social": 14,
    "environmental_climate": 180,
    "other": 3,
}

# Severita' di partenza (0-10) per tipo, prima dei boost/attenuatori lessicali.
SEVERITY_PRIOR = {
    "geopolitical_conflict": 5.0,
    "sanctions": 4.0,
    "natural_disaster": 4.5,
    "pandemic_health": 4.2,
    "market_shock": 4.2,
    "trade_policy": 3.6,
    "monetary_policy": 3.3,
    "fiscal_policy": 2.8,
    "regulatory_change": 2.6,
    "supply_chain_disruption": 3.6,
    "corporate_event": 2.4,
    "technology_disruption": 2.6,
    "labor_social": 2.8,
    "environmental_climate": 3.0,
    "other": 1.5,
}

SEVERITY_BANDS = [(2.0, "minimal"), (4.0, "low"), (6.0, "moderate"), (8.0, "high"), (10.01, "severe")]

# Autorevolezza della fonte (0-1) per scegliere il titolo rappresentativo di un evento.
SOURCE_AUTHORITY = {
    "reuters": 1.0, "ap": 1.0, "associated press": 1.0, "bbc": 1.0, "afp": 0.95,
    "guardian": 0.9, "aljazeera": 0.9, "al jazeera": 0.9, "nyt": 0.9, "new york times": 0.9,
    "dw": 0.85, "france24": 0.85, "ansa": 0.85, "cnn": 0.8, "corriere": 0.8,
    "sole24ore": 0.8, "il sole 24 ore": 0.8, "ansa_ultima_ora": 0.8, "repubblica": 0.8,
    "telegram": 0.3,
}
DEFAULT_SOURCE_AUTHORITY = 0.6

# Parametri di scoring / ranking (vedi docs/ARCHITECTURE.md, sezione Algoritmi).
WINDOW_HOURS = 48
MAX_EVENTS = 600
# Calibrazione: la formula originale satura a 100 per quasi tutti gli eventi seri;
# x viene moltiplicato per GLOBAL_SCORE_CALIB prima del clamp per mantenere discriminazione.
GLOBAL_SCORE_CALIB = 0.28
SECTOR_SCORE_CALIB = 0.8

# Calibrazione pannello mercati (markets.json)
MARKET_SECTOR_K = 30.0     # score = 100*(1-exp(-somma(global/100*sector)/K))
MARKET_COUNTRY_K = 6.0     # attivita' paese = 100*(1-exp(-somma/K)); risk = 0.3*baseline + 0.7*attivita'
TREND_DELTA = 3.0          # soglia (punti) per trend up/down
COVERAGE_COEF = 0.08        # extra boost per il numero di articoli nel cluster (ln)

# ---------------------------------------------------------------------------------------------------
# Ruoli geografici (attore / luogo / bersaglio) e qualita' dei titoli
# ---------------------------------------------------------------------------------------------------
# Moltiplicatori del "focus" (punto primario dell'evento) per paese; i pesi di ``countries[]`` NON cambiano.
GEO_ROLE_MULT = {
    "place": 1.8,       # "in/at/near/off Libya", dateline "Gaza: ..."
    "target": 1.6,      # "on/against Yemen", oggetto di un verbo d'attacco, vittime ("10 Palestinians")
    "local": 1.4,       # "Lebanese media", "Ukrainian city", "Polish airspace"
    "actor": 0.4,       # soggetto di un'azione ("Saudi strikes", "Israel kills", "Il Pakistan bombarda")
    "subject": 0.85,    # soggetto d'apertura / "Iran says"
    "topic": 0.8,       # "Ukraine war/conflict/talks": paese come argomento
    "referent": 0.6,    # "Poland blames Russia": paese chiamato in causa, non luogo dell'evento
    "subordinate": 0.75,  # dopo "after/dopo/following/since" (clausola secondaria)
}

# Titoli generici / non-notizia: confronto sul titolo normalizzato (minuscolo, senza accenti/punteggiatura),
# dopo aver tolto data e numeri finali. GENERIC_TITLE_ACTION: "drop" (scarta l'articolo) | "demote" (severita' x GENERIC_TITLE_FACTOR).
GENERIC_TITLE_ACTION = "drop"
GENERIC_TITLE_FACTOR = 0.2
GENERIC_TITLES_EXACT = frozenset("""
morning update|morning updates|morning briefing|morning brief|morning news|evening update|evening updates|evening briefing|
evening brief|afternoon update|afternoon briefing|midday update|daily update|daily briefing|daily brief|daily digest|
daily news|news briefing|news update|news updates|news digest|news roundup|news round up|weekly roundup|weekly briefing|
live updates|live update|live blog|live news|live|latest updates|latest news|top stories|top news|headlines|todays headlines|
the briefing|the daily|the morning|the evening|newsletter|podcast|the podcast|quiz|news quiz|weekly quiz|crossword|
horoscope|horoscopes|photos of the day|pictures of the day|in pictures|cartoon|sign up|
le notizie del giorno|le notizie di oggi|notizie del giorno|notizie di oggi|ultime notizie|ultima ora|rassegna stampa|
la rassegna stampa|le prime pagine|prime pagine|prima pagina|la prima pagina|oroscopo|oroscopo di oggi|cruciverba|
buongiorno|buonasera|la newsletter|il podcast|il quiz|il meteo|meteo|in diretta|diretta live
""".replace("\n", "").split("|"))
# Prefissi (regex sul titolo normalizzato): se il titolo INIZIA cosi' e' non-notizia.
GENERIC_TITLE_PREFIX = [
    r"(?:newsletter|podcast|quiz|crossword|cruciverba|oroscopo|horoscope|weekly quiz|news quiz)\b",
]
# Prefissi di "formato" da togliere dal titolo mostrato (non cambiano il significato).
DISPLAY_STRIP_PREFIX = r"^\s*(?:watch|video|listen|photos?|gallery|pictures|guarda|ascolta|foto|il video)\s*[:|]\s*"

# Opinione / analisi / podcast: severita' x OPINION_SEVERITY_FACTOR.
OPINION_SEVERITY_FACTOR = 0.6
# Etichetta iniziale seguita da ":" / "|" / "-" ("Opinion: ...", "Analisi - ...").
OPINION_TITLE_PREFIX = [
    r"opinion|comment|commentary|analysis|editorial|view|viewpoint|column|perspective|letters?|"
    r"opinione|opinioni|commento|analisi|editoriale|punto di vista|lettere|retroscena|il commento|l'analisi",
]
# Parole che da sole in apertura indicano un pezzo d'analisi (it).
OPINION_BARE_WORDS = frozenset("analisi editoriale commento opinione".split())
OPINION_TITLE_SUFFIX = [r"(?:podcast|video|opinion|analysis|editorial|review|newsletter)$"]
OPINION_HINTS = frozenset("opinion opinions comment commentary analysis editorial editoriale editoriali commento commenti "
                          "analisi opinioni idee e commenti podcast".split())
OPINION_QUESTION_TITLES = True   # titoli che finiscono con "?"
