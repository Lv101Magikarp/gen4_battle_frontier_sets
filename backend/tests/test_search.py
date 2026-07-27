from app.search import facets, load_sets, search


def test_dataset_loads():
    sets = load_sets()
    assert len(sets) == 950
    assert len({s["species"] for s in sets}) == 400


def test_set_index_grouping():
    metagross = [s for s in load_sets() if s["species"] == "Metagross"]
    assert {s["setIndex"] for s in metagross} == {1, 2, 3, 4}
    assert all(s["setCount"] == 4 for s in metagross)
    bulbasaur = [s for s in load_sets() if s["species"] == "Bulbasaur"]
    assert len(bulbasaur) == 1 and bulbasaur[0]["setCount"] == 1


def test_filter_by_species():
    res = search(q="metagross")
    assert res and all("metagross" in s["species"].lower() for s in res)


def test_filter_by_move():
    res = search(move="Earthquake")
    assert res
    assert all(any("earthquake" in m["name"].lower() for m in s["moves"]) for s in res)


def test_filter_by_nature_and_item():
    res = search(nature="Jolly", item="BrightPowder")
    assert all(s["nature"] == "Jolly" and s["item"] == "BrightPowder" for s in res)


def test_filter_by_ability_and_type():
    res = search(ability="Levitate", type="Ghost")
    assert res
    for s in res:
        assert "Levitate" in s["abilities"] and "Ghost" in s["types"]


def test_filter_by_set_index():
    res = search(set_index=4)
    assert res and all(s["setIndex"] == 4 for s in res)


def test_computed_stat_filter_speed():
    res = search(stat_min={"spe": 150}, tier4_iv=31)
    assert res
    assert all(s["stats"]["spe"] >= 150 for s in res)
    # Sorting by speed descending puts the fastest first.
    ordered = search(sort="spe", order="desc")
    speeds = [s["stats"]["spe"] for s in ordered]
    assert speeds == sorted(speeds, reverse=True)


def test_iv_is_fixed_by_tier():
    from app.search import with_computed_stats

    sets = with_computed_stats(load_sets(), tier4_iv=31)
    by_id = {s["id"]: s for s in sets}
    # Tier 1 -> 0, Tier 2 -> 4, Tier 3 -> 8 IVs (from the set's tierIv).
    for s in sets:
        if s["tierGroup"] and s["tierGroup"].startswith("Tier 1"):
            assert s["iv"] == 0
        elif s["tierGroup"] and s["tierGroup"].startswith("Tier 2"):
            assert s["iv"] == 4
        elif s["tierGroup"] and s["tierGroup"].startswith("Tier 3"):
            assert s["iv"] == 8
    # Tier 4+ (garchomp) follows the tier4_iv argument.
    assert by_id["garchomp-1"]["iv"] == 31
    g12 = {s["id"]: s for s in with_computed_stats(load_sets(), tier4_iv=12)}
    assert g12["garchomp-1"]["iv"] == 12
    # A fixed-tier set ignores tier4_iv.
    assert g12["bulbasaur-1"]["iv"] == 0


def test_ev_filter():
    res = search(ev_min={"spe": 252})
    assert res and all(s["evs"]["spe"] >= 252 for s in res)


def test_tier_filter_and_sort():
    # Every set carries a Factory tier.
    assert all(s.get("tier") for s in load_sets())
    res = search(tier="X")
    assert res and all(s["tier"] == "X" for s in res)
    # Sorting by tier ascending puts X (rank 0) first.
    ordered = search(sort="tier", order="asc")
    ranks = [s["tierRank"] for s in ordered]
    assert ranks == sorted(ranks)
    assert ordered[0]["tier"] == "X"


def test_facets_populated():
    f = facets()
    assert f["total"] == 950
    assert "Jolly" in f["natures"]
    assert "Levitate" in f["abilities"]
    assert set(f["setIndexes"]) == {1, 2, 3, 4}
    assert f["tiers"][0] == "X" and "F" in f["tiers"]
