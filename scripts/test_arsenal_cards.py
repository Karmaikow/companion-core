"""Execute com python3 -m unittest discover -s scripts -p test_arsenal_cards.py."""
import io
import runpy
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from PIL import Image

install = runpy.run_path(str(Path(__file__).with_name("import-arsenal-cards.py")))["install"]


class ArsenalCardsTest(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.target = self.root / "cards"
        self.archive = self.root / "cards.zip"
        self.cards = {}
        for number in range(1, 201):
            png = io.BytesIO()
            Image.new("RGB", (2, 3), (number, 0, 0)).save(png, "PNG")
            self.cards[f"item_{number:03}.png"] = png.getvalue()

    def pack(self):
        with ZipFile(self.archive, "w") as bundle:
            for name, data in reversed(self.cards.items()):
                bundle.writestr(name, data)

    def test_maps_by_filename_and_retries(self):
        self.pack()
        install(self.archive, self.target)
        install(self.archive, self.target)
        for name, data in self.cards.items():
            self.assertEqual((self.target / name).read_bytes(), data)
        self.cards["item_001.png"] = self.cards["item_200.png"]
        self.pack()
        with self.assertRaises(ValueError):
            install(self.archive, self.target)
        self.assertNotEqual((self.target / "item_001.png").read_bytes(), self.cards["item_001.png"])

    def test_corrupt_png_leaves_no_partial_batch(self):
        self.cards["item_001.png"] = b"not a PNG"
        self.pack()
        with self.assertRaises(OSError):
            install(self.archive, self.target)
        self.assertFalse(self.target.exists())

    def test_missing_and_unsafe_names(self):
        data = self.cards.pop("item_001.png")
        for name in (None, "../item_001.png"):
            if name:
                self.cards[name] = data
            self.pack()
            with self.assertRaises(ValueError):
                install(self.archive, self.target)
            self.assertFalse(self.target.exists())
