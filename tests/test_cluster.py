from datetime import datetime, timedelta, timezone

from engine import classify, cluster, geo

T0 = datetime(2026, 3, 9, 12, 0, tzinfo=timezone.utc).timestamp()


def mk(id, title, minutes=0, lang="en", summary=""):
    hits = geo.locate(title, summary)
    return cluster.Item(
        id=id, title=title, summary=summary, ts=T0 + minutes * 60, lang=lang,
        countries=frozenset(h.iso2 for h in hits if h.weight >= 0.3), event_type=classify.classify(title, summary)[0],
    )


def groups(items, **kw):
    return [[items[i].id for i in g] for g in cluster.cluster(items, **kw)]


def test_same_story_bbc_cnn_guardian_merge():
    items = [
        mk("bbc", "Israel strikes Iranian nuclear sites, at least 25 killed", 0),
        mk("cnn", "Israeli strikes hit Iran nuclear facilities as 25 killed", 30),
        mk("grd", "Israel launches strikes on Iran's nuclear sites; 25 dead", 90),
    ]
    assert groups(items) == [["bbc", "cnn", "grd"]]


def test_unrelated_stories_do_not_merge():
    items = [
        mk("a", "Israel strikes Iranian nuclear sites, at least 25 killed", 0),
        mk("b", "Fed holds interest rates steady as inflation persists", 10),
        mk("c", "Earthquake of magnitude 6.1 hits southern Turkey", 20),
        mk("d", "Sinner beats Alcaraz to win Turin title", 30),
    ]
    gs = groups(items)
    assert len(gs) == 4


def test_same_topic_different_country_not_merged():
    items = [
        mk("a", "Floods hit northern Italy, thousands evacuated", 0),
        mk("b", "Floods hit southern Brazil, thousands evacuated", 5),
    ]
    assert len(groups(items)) == 2


def test_time_window_respected():
    items = [
        mk("old", "Israel strikes Iranian nuclear sites, at least 25 killed", 0),
        mk("new", "Israel strikes Iranian nuclear sites, at least 25 killed", 60 * 60),  # +60h
    ]
    assert len(groups(items, window_hours=48)) == 2
    assert len(groups(items, window_hours=96)) == 1


def test_cross_language_merge_with_shared_entities():
    items = [
        mk("en", "Earthquake of magnitude 6.1 hits southern Turkey", 0, "en"),
        mk("it", "Terremoto di magnitudo 6.1 nel sud della Turchia", 20, "it"),
    ]
    assert groups(items) == [["en", "it"]]


def test_cross_language_no_merge_without_shared_entities():
    items = [
        mk("en", "Oil prices surge as Iran war disrupts Hormuz shipping", 0, "en"),
        mk("it", "Borsa: Tokyo crolla, Nikkei -5%", 10, "it"),
    ]
    assert len(groups(items)) == 2


def test_cluster_id_stable_earliest_article():
    items = [
        mk("z-late", "Israel strikes Iranian nuclear sites, at least 25 killed", 50),
        mk("a-early", "Israeli strikes hit Iran nuclear facilities as 25 killed", 0),
    ]
    gs = cluster.cluster(items)
    assert len(gs) == 1
    assert cluster.cluster_id(items, gs[0]) == "a-early"
    # stabile anche permutando l'ordine di input
    gs2 = cluster.cluster(list(reversed(items)))
    assert cluster.cluster_id(list(reversed(items)), gs2[0]) == "a-early"


def test_deterministic():
    items = [mk(f"i{k}", f"Borsa: Milano chiude in calo dello 0,{k}%", k) for k in range(5)]
    assert groups(items) == groups(items)


def test_empty():
    assert cluster.cluster([]) == []
