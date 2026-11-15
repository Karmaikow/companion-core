"""Instala as 200 cartas do Arsenal. Uso: python3 scripts/import-arsenal-cards.py cartas.zip"""
import argparse
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import BadZipFile, ZipFile

from PIL import Image

DESTINATION = Path(__file__).resolve().parents[1] / "client/src/assets/arsenal-de-aster"
EXPECTED = {f"item_{number:03}.png" for number in range(1, 201)}


def install(archive, destination=DESTINATION):
    with ZipFile(archive) as bundle:
        entries = bundle.infolist()
        names = {entry.filename for entry in entries}
        if len(entries) != len(EXPECTED) or names != EXPECTED:
            raise ValueError("O ZIP precisa conter item_001.png a item_200.png na raiz, uma vez cada.")
        destination.parent.mkdir(parents=True, exist_ok=True)
        with TemporaryDirectory(dir=destination.parent) as temporary:
            stage = Path(temporary) / "cartas"
            stage.mkdir()
            for entry in entries:
                if not 0 < entry.file_size <= 16 * 1024 * 1024:
                    raise ValueError(f"Tamanho inválido: {entry.filename} (limite de 16 MiB).")
                path = stage / entry.filename
                with bundle.open(entry) as source, path.open("wb") as output:
                    shutil.copyfileobj(source, output)
                with Image.open(path) as card:
                    if card.format != "PNG" or card.width * card.height > 16_777_216:
                        raise ValueError(f"PNG inválido ou grande demais: {entry.filename}")
                    card.verify()
                with Image.open(path) as card:
                    card.load()
            if destination.exists():
                from filecmp import cmp
                if {p.name for p in destination.iterdir()} == EXPECTED and all(
                    cmp(stage / name, destination / name, shallow=False) for name in EXPECTED
                ):
                    return
                raise ValueError(f"Já existe um lote diferente em {destination}.")
            stage.rename(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip", type=Path)
    args = parser.parse_args()
    try:
        install(args.zip)
    except (BadZipFile, OSError, ValueError, Image.DecompressionBombError) as error:
        parser.exit(1, f"Falha ao importar as cartas: {error}\n")
    print(f"200 cartas disponíveis em {DESTINATION}.")
