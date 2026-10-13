"""Per-key export spec for build_env.py.
src: raw file (relative to raw/), fp: collision footprint in tiles or None, cut: machete-cuttable,
heavy: needs heavy chop, lift: anchor rise above bottom opaque row (int px or float fraction of height),
anchor: explicit [x, y] in the cropped sprite, flat: ground decal, box: sub-crop of the raw image.
"""
F = "pack_fol/frame_{}.png".format
SPEC = {
    "fol_fern":         dict(src=F(0), fp=None, cut=True),
    "fol_shrub":        dict(src=F(1), fp=None, cut=True),
    "fol_monstera":     dict(src=F(2), fp=None, cut=True),
    "fol_elephant_ear": dict(src=F(3), fp=None, cut=True),
    "fol_heliconia":    dict(src=F(4), fp=None, cut=True),
    "fol_tall_grass":   dict(src=F(5), fp=None, cut=True),
    "fol_bamboo":       dict(src=F(6), fp={"shape": "circle", "r": 0.45}, cut=True, heavy=True),
    "fol_palm_sapling": dict(src=F(7), fp=None, cut=True, lift=2),
    "fol_thicket":      dict(src=F(8), fp={"shape": "circle", "r": 0.7}, cut=True),
    "fol_vines":        dict(src=F(9), fp={"shape": "circle", "r": 0.6}, cut=True),
    "fol_bramble_dry":  dict(src=F(10), fp={"shape": "circle", "r": 0.6}, cut=True, heavy=True),
    "fol_mushrooms":    dict(src=F(11), fp=None, lift=3),
    "fol_boulder":      dict(src=F(12), fp={"shape": "circle", "r": 0.8}, lift=0.2),
    "fol_log":          dict(src=F(13), fp={"shape": "box", "w": 1.7, "d": 0.6}, lift=0.25),
    "fol_stump":        dict(src=F(14), fp={"shape": "circle", "r": 0.5}, lift=0.15),
    "fol_cut_stump":    dict(src=F(15), fp={"shape": "circle", "r": 0.4}, lift=0.2),
}

T = "pack_treeA/frame_{}.png".format
SPEC.update({
    "tree_kapok":         dict(src=T(0), fp={"shape": "circle", "r": 0.9}, xmode="bottom", lift=0.07),
    "tree_strangler_fig": dict(src=T(1), fp={"shape": "circle", "r": 0.8}, xmode="bottom", lift=0.06),
    "tree_palm":          dict(src=T(2), fp={"shape": "circle", "r": 0.3}, xmode="bottom", lift=0.06),
    "tree_dead_vine":     dict(src=T(3), fp={"shape": "circle", "r": 0.5}, xmode="bottom", lift=0.06),
})

P = "pack_props/frame_{}.png".format
SPEC.update({
    "prop_crate":        dict(src=P(0), fp={"shape": "box", "w": 1.0, "d": 0.8}, lift=0.15),
    "prop_tool_chest":   dict(src=P(1), fp={"shape": "box", "w": 1.1, "d": 0.7}, lift=0.15),
    "prop_rare_cache":   dict(src=P(2), fp={"shape": "box", "w": 1.2, "d": 0.7}, lift=0.15),
    "prop_intel_terminal": dict(src=P(3), fp={"shape": "box", "w": 1.0, "d": 0.7}, lift=0.12),
    "prop_opened_crate": dict(src=P(4), fp={"shape": "box", "w": 1.0, "d": 0.8}, lift=0.15),
    "prop_fuse":         dict(src=P(5), fp={"shape": "circle", "r": 0.3}, lift=0.08),
    "prop_power_box":    dict(src=P(6), fp={"shape": "box", "w": 0.9, "d": 0.5}, lift=0.1),
    "prop_data_terminal": dict(src=P(7), fp={"shape": "box", "w": 0.9, "d": 0.6}, lift=0.1),
    "prop_pump":         dict(src=P(8), fp={"shape": "circle", "r": 0.35}, lift=0.06),
    "prop_cell_cache":   dict(src=P(9), fp={"shape": "box", "w": 1.1, "d": 0.7}, lift=0.15),
    "prop_nest":         dict(src=P(10), fp={"shape": "circle", "r": 0.5}, lift=0.12),
    "prop_locked_cache": dict(src=P(11), fp={"shape": "box", "w": 1.1, "d": 0.7}, lift=0.15),
    "prop_workbench":    dict(src=P(12), fp={"shape": "box", "w": 1.3, "d": 0.6}, lift=0.12),
    "prop_campfire":     dict(src=P(13), fp={"shape": "circle", "r": 0.5}, lift=0.2),
    "prop_supply_drop":  dict(src=P(14), fp={"shape": "box", "w": 1.1, "d": 0.8}, lift=0.15),
    "prop_med_kit":      dict(src=P(15), fp={"shape": "box", "w": 0.8, "d": 0.5}, lift=0.15),
})

D = "pack_dec/frame_{}.png".format
_dec = {
    "dec_leaves_brown": 0, "dec_leaves_autumn": 1, "dec_leaves_green": 2, "dec_twigs": 3, "dec_twigs_crossed": 4,
    "dec_pebbles": 5, "dec_pebbles_mossy": 6, "dec_flowers_white": 7, "dec_flowers_pink": 8, "dec_flowers_blue": 9,
    "dec_roots": 10, "dec_roots_twisted": 11, "dec_puddle_mud": 12, "dec_puddle": 13, "dec_lily_pads": 14,
    "dec_lily_lotus": 15, "dec_reeds": 16, "dec_cattails": 17, "dec_fungus_shelf": 18, "dec_fungus_glow": 19,
    "dec_bones_skull": 20, "dec_bones_ribs": 21, "dec_moss_tuft": 22, "dec_moss_patch": 23, "dec_cut_leaves": 24,
    "dec_cut_leaves_2": 25, "dec_leaves_rock": 32, "dec_concrete_chunks": 33, "dec_bolts": 34, "dec_soil_sprouts": 35,
    "dec_clover": 36, "dec_seed_pods": 37, "dec_palm_frond": 38, "dec_branch": 39, "dec_slab_mossy": 40,
    "dec_fern_frond": 41, "dec_monstera_leaf": 42, "dec_small_log": 43, "dec_berries": 44, "dec_mushrooms_blue": 45,
    "dec_creepers": 46, "dec_snail": 47, "dec_mushrooms_white": 48, "dec_sapling": 49, "dec_cog": 50,
    "dec_pot_shards": 51, "dec_web": 52, "dec_burrow": 53, "dec_twig_pile": 54, "dec_twig_nest": 55,
    "dec_feathers": 56, "dec_footprints": 57, "dec_root_coil": 58, "dec_tin_puddle": 59, "dec_seed_pod": 60,
    "dec_flowers_orange": 61, "dec_bricks_mossy": 62, "dec_vines_hanging": 63,
}
for k, i in _dec.items():
    SPEC[k] = dict(src=D(i), fp=None, flat=True)

# pickups: V1 files pick_*.png exist, so the V2 art ships as pick_*_v2.png under the same keys
SPEC.update({
    "pick_scrap":    dict(src=D(26), file="pick_scrap_v2.png", fp=None, lift=0.15),
    "pick_circuits": dict(src=D(27), file="pick_circuits_v2.png", fp=None, lift=0.15),
    "pick_biofiber": dict(src=D(28), file="pick_biofiber_v2.png", fp=None, lift=0.15),
    "pick_intel":    dict(src=D(31), file="pick_intel_v2.png", fp=None, lift=0.15),
    "pick_med":      dict(src=D(30), file="pick_med_v2.png", fp=None, lift=0.15),
    "prop_data_drive": dict(src=D(29), fp=None, lift=0.15),
})

T2 = "pack_treeB/frame_{}.png".format
SPEC.update({
    "tree_banyan":        dict(src=T2(0), fp={"shape": "circle", "r": 1.0}, xmode="bottom", lift=0.08),
    "tree_fern":          dict(src=T2(1), fp={"shape": "circle", "r": 0.3}, xmode="bottom", lift=0.07),
    "tree_canopy":        dict(src=T2(2), fp={"shape": "circle", "r": 0.8}, xmode="bottom", lift=0.08),
    "tree_fallen_trunk":  dict(src=T2(3), fp={"shape": "box", "w": 3.2, "d": 1.0}, lift=0.2),
})

R = "pack_ruinA/frame_{}.png".format
SPEC.update({
    "ruin_wall":       dict(src=R(0), fp={"shape": "box", "w": 2.6, "d": 0.6}, lift=0.1),
    "ruin_pillar":     dict(src=R(1), fp={"shape": "circle", "r": 0.6}, lift=0.1),
    "ruin_train_car":  dict(src=R(2), fp={"shape": "box", "w": 3.4, "d": 1.4}, lift=0.2),
    "ruin_greenhouse": dict(src=R(3), fp={"shape": "box", "w": 3.4, "d": 1.8}, lift=0.2),
    "prop_relay_pylon": dict(src="relay_pylon.png", fp={"shape": "circle", "r": 0.45}, lift=0.08),
})

R2 = "pack_ruinB/frame_{}.png".format
SPEC.update({
    "ruin_statue_head": dict(src=R2(0), fp={"shape": "circle", "r": 1.3}, lift=0.2),
    "ruin_car_wreck":   dict(src=R2(1), fp={"shape": "box", "w": 2.6, "d": 1.3}, lift=0.2),
    "ruin_radio_mast":  dict(src=R2(2), fp={"shape": "box", "w": 3.0, "d": 0.8}, lift=0.15),
    "ruin_stairs":      dict(src=R2(3), fp={"shape": "box", "w": 2.6, "d": 2.0}, lift=0.15),
})

F2 = "pack_fol2/frame_{}.png".format
SPEC.update({
    "fol_bramble":       dict(src=F2(0), fp={"shape": "circle", "r": 0.6}, cut=True, heavy=True),
    "fol_fern_wide":     dict(src=F2(1), fp=None, cut=True),
    "fol_fiddlehead":    dict(src=F2(2), fp=None, cut=True),
    "fol_bush_round":    dict(src=F2(3), fp={"shape": "circle", "r": 0.6}, cut=True),
    "fol_bromeliad":     dict(src=F2(4), fp=None, cut=True),
    "fol_bush_flowering": dict(src=F2(5), fp={"shape": "circle", "r": 0.6}, cut=True),
    "fol_grass_short":   dict(src=F2(6), fp=None, cut=True),
    "fol_ginger":        dict(src=F2(7), fp=None, cut=True),
    "fol_taro":          dict(src=F2(8), fp=None, cut=True),
    "fol_bamboo_young":  dict(src=F2(9), fp=None, cut=True),
    "fol_cycad":         dict(src=F2(10), fp=None, cut=True),
    "fol_rock_mossy":    dict(src=F2(11), fp={"shape": "circle", "r": 0.55}, lift=0.2),
    "fol_roots":         dict(src=F2(12), fp=None, lift=0.15),
    "fol_rubble_ivy":    dict(src=F2(13), fp={"shape": "circle", "r": 0.6}, lift=0.15),
    "fol_vine_curtain":  dict(src=F2(14), fp=None, cut=True),
    "fol_agave":         dict(src=F2(15), fp=None, cut=True),
})
