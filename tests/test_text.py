from datetime import timezone

from engine import text as T


def test_fold_and_tokenize():
    assert T.fold("Türkiye è già à Città") == "Turkiye e gia a Citta"
    assert T.tokenize("dell'Iran, l'Ucraina") == ["dell", "Iran", "l", "Ucraina"]
    assert T.fold("U.S. and U.K. forces") == "US and UK forces"
    assert T.normalize("  Perché   Più ") == "perche piu"


def test_strip_html_and_first_sentence():
    assert T.strip_html("<p>Hello &amp; <b>world</b></p>") == "Hello & world"
    assert T.first_sentence("Prima frase. Seconda frase.") == "Prima frase."


def test_content_tokens_removes_stopwords():
    toks = T.content_tokens("The attack on the capital and il governo italiano")
    assert "the" not in toks and "il" not in toks and any(t.startswith("attack") for t in toks)


def test_parse_dt_formats():
    d1 = T.parse_dt("2026-03-09T17:57:46+00:00")
    d2 = T.parse_dt("Mon, 09 Mar 2026 16:45:04 +0000")
    d3 = T.parse_dt("Sun, 08 Mar 2026 21:51:48 GMT")
    d4 = T.parse_dt(1773079633)
    assert all(d.tzinfo is not None for d in (d1, d2, d3, d4))
    assert d1.hour == 17 and d2.day == 9 and d3.day == 8 and d4.year == 2026
    assert T.parse_dt("garbage") is None
    assert T.iso(d1) == "2026-03-09T17:57:46Z"
    assert d1.astimezone(timezone.utc) == d1


def test_term_matcher_longest_and_prefix_and_case():
    m = T.TermMatcher()
    m.add("trade", "t")
    m.add("trade war", "w")
    m.add("tariff*", "f")
    m.add("=US", "us")
    toks = T.tokenize("The trade war and tariffs: us vs US")
    got = [(" ".join(s), p) for _, _, s, p in m.scan([t.lower() for t in toks], toks)]
    assert ("trade war", ["w"]) in got
    assert ("tariffs"[:6], ["f"]) in got
    assert sum(1 for g in got if g[1] == ["us"]) == 1


def test_detect_lang():
    assert T.detect_lang("Il governo ha detto che la guerra non finisce") == "it"
    assert T.detect_lang("The government said the war will not end") == "en"
