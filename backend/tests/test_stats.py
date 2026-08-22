from app.stats import compute_stat, compute_stats, nature_mods


def test_hp_formula_snorlax():
    # Snorlax base HP 160, 252 HP EV, 31 IV, Lv50 -> 267
    assert compute_stat(base=160, ev=252, iv=31, nature_mod=1.0, is_hp=True) == 267


def test_speed_garchomp_jolly():
    # Garchomp base Spe 102, 252 EV, IV31, Jolly (+spe) at Lv50 -> 169
    mods = nature_mods("Jolly")
    spe = compute_stat(base=102, ev=252, iv=31, nature_mod=mods["spe"], is_hp=False)
    assert spe == 169


def test_hindering_nature_reduces():
    # Adamant hinders Sp. Atk.
    mods = nature_mods("Adamant")
    assert mods["atk"] == 1.1 and mods["spa"] == 0.9


def test_neutral_nature_no_change():
    assert nature_mods("Hardy") == {k: 1.0 for k in ["hp", "atk", "def", "spa", "spd", "spe"]}


def test_hp_formula_snorlax_lv100():
    # Snorlax base HP 160, 252 HP EV, 31 IV, Lv100 -> 524 (Open Level).
    assert compute_stat(base=160, ev=252, iv=31, nature_mod=1.0, is_hp=True, level=100) == 524


def test_speed_garchomp_jolly_lv100():
    # Garchomp base Spe 102, 252 EV, IV31, Jolly (+spe) at Lv100 -> 333.
    mods = nature_mods("Jolly")
    spe = compute_stat(base=102, ev=252, iv=31, nature_mod=mods["spe"], is_hp=False, level=100)
    assert spe == 333


def test_compute_stats_level_100():
    base = {"hp": 108, "atk": 130, "def": 95, "spa": 80, "spd": 85, "spe": 102}
    evs = {"hp": 0, "atk": 252, "def": 0, "spa": 0, "spd": 0, "spe": 252}
    assert compute_stats(base, evs, "Jolly", iv=31, level=100)["spe"] == 333


def test_compute_stats_shape():
    base = {"hp": 108, "atk": 130, "def": 95, "spa": 80, "spd": 85, "spe": 102}
    evs = {"hp": 0, "atk": 252, "def": 0, "spa": 0, "spd": 0, "spe": 252}
    stats = compute_stats(base, evs, "Jolly", iv=31)
    assert set(stats) == {"hp", "atk", "def", "spa", "spd", "spe"}
    assert stats["spe"] == 169
    # IV=0 lowers the stat.
    assert compute_stats(base, evs, "Jolly", iv=0)["spe"] < stats["spe"]
