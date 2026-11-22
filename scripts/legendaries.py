"""Canonical list of Legendary/Mythical Pokémon (National Dex, Gen I-IV).

Shared by scrape.py (flags each set) and build_trainers.py (flags trainers whose
entire roster is legendary). Pseudo-legendaries (Dragonite, Tyranitar, Salamence,
Metagross, Garchomp) are deliberately NOT included — they are not Legendary.

Giratina/Dialga/Palkia etc. are listed for completeness even though the Battle
Frontier bans the box legendaries, so the flag stays correct if the dataset grows.
"""
from __future__ import annotations

LEGENDARY_DEX: frozenset[int] = frozenset({
    # Gen I
    144, 145, 146,            # Articuno, Zapdos, Moltres
    150, 151,                 # Mewtwo, Mew
    # Gen II
    243, 244, 245,            # Raikou, Entei, Suicune
    249, 250, 251,            # Lugia, Ho-Oh, Celebi
    # Gen III
    377, 378, 379,            # Regirock, Regice, Registeel
    380, 381,                 # Latias, Latios
    382, 383, 384,            # Kyogre, Groudon, Rayquaza
    385, 386,                 # Jirachi, Deoxys
    # Gen IV
    480, 481, 482,            # Uxie, Mesprit, Azelf
    483, 484,                 # Dialga, Palkia
    485, 486, 487,            # Heatran, Regigigas, Giratina
    488,                      # Cresselia
    489, 490,                 # Phione, Manaphy
    491, 492, 493,            # Darkrai, Shaymin, Arceus
})


def is_legendary(dex_num: int) -> bool:
    return dex_num in LEGENDARY_DEX
