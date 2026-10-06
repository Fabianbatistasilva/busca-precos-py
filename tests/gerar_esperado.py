"""Gera os arquivos do teste de paridade: as respostas da busca interna (Python) para uma lista de consultas.

O teste (tests/paridade.test.mjs) exige que bot.js responda exatamente o mesmo texto. Os arquivos gerados
(tests/dados.json e tests/esperado.json) ficam só no computador; o .gitignore não deixa irem para o repositório.

    python tests/gerar_esperado.py --bot "C:/caminho/da/busca" --exportador "C:/caminho/do/exportador"
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

SEARCHES = [
    "enantato", "enantato 250", "enantato de testosterona", "propionato de testosterona", "trembo enan", "tremb enantato",
    "testosterona", "durateston", "dura", "cipionato", "masteron", "masteron enantato", "drostanolona enantato", "primo", "deca",
    "oxandrolona", "oxandrolona 10mg", "dianabol", "turina", "turinabol", "hcg", "roacutan", "t3", "250", "10ml",
    "bratva", "king", "king pharma", "cooper", "cooper pharma", "pharmacom", "pharma", "oxygen", "zphc", "landerlan gold",
    "muscle pharma", "alpha pharma", "lipoland", "actiza", "zptrop",
    "retatrutida", "retatrutida zphc", "retatrutida zhpc", "tirzepatida", "tirze 15mg", "mounjaro",
    "bpc157", "bpc 157", "bpc-157", "tb500", "tb 500", "ghk", "ghk-cu 100mg", "ghkcu", "ahk", "mots", "motsc", "mots-c",
    "slupp", "slu pp", "slupp332", "cjc1295", "pt141", "igf1", "melanotan ii", "ipamorelin",
    "pharmacon", "turina pharmacon", "trembolna", "durateson", "masterom", "cipionatto", "bratwa", "xyzabc", "inexistente abc",
    "ST-1396", "st1396", "by-7979", "ultra mix", "enantato testosterona landerlan gold", "ph", "de", "", "   ",
]
COMPARISONS = [
    "zphc cooper", "ZPHC Alpha", "lander bratva", "king bratva", "zphc cooper shape", "zphc cooper bypharmacon",
    "zphc cooper paraguai", "zphc cooper brasil", "alpha pharma x landerlan", "cooper vs pharmacom", "oxygen, zphc",
    "muscle king", "landerlan king", "cooper canada", "zphc", "zphc zphc", "zphc marcaquenaoexiste", "oxygen usa", "geniqs genic",
]
MESSAGES = ["/buscar tremb enantato", "/buscar", "/busca"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bot", required=True, help="Pasta do bot do WhatsApp (bot_busca.py e data/painel.json)")
    parser.add_argument("--exportador", required=True, help="Pasta comparador/ do repositório do painel (exportar_bot.py)")
    args = parser.parse_args()

    bot_folder = Path(args.bot)
    sys.path.insert(0, str(bot_folder))
    import bot_busca

    spec = importlib.util.spec_from_file_location("exportar_bot", Path(args.exportador) / "exportar_bot.py")
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)

    data = json.loads((bot_folder / "data" / "painel.json").read_text(encoding="utf-8"))
    expected = {"busca": {}, "comparar": {}, "mensagem": {}}
    for query in SEARCHES:
        expected["busca"][query] = bot_busca.search(data, query)
    for query in COMPARISONS:
        expected["comparar"][query] = bot_busca.compare_brands(data, query)
    for body in MESSAGES:
        expected["mensagem"][body] = bot_busca.answer(data, body)

    here = Path(__file__).parent
    (here / "dados.json").write_text(json.dumps(exporter.build(data), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (here / "esperado.json").write_text(json.dumps(expected, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(SEARCHES)} buscas, {len(COMPARISONS)} comparações, {len(MESSAGES)} mensagens")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
