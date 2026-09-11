"""Offline archive boundary tests; the macOS-only case uses synthetic xattrs."""
import importlib.util
import os
import pathlib
import shutil
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
import warnings
import zipfile

spec = importlib.util.spec_from_file_location("desktop_archive", pathlib.Path(__file__).with_name("archive.py"))
a = importlib.util.module_from_spec(spec); spec.loader.exec_module(a)


class ArchiveBoundary(unittest.TestCase):
    def setUp(self): self.root = pathlib.Path(tempfile.mkdtemp(prefix="ghostget-archive-test-"))
    def tearDown(self): shutil.rmtree(self.root)
    def make(self, entries=None):
        target = self.root / "archive.zip"
        target.unlink(missing_ok=True)
        with warnings.catch_warnings(), zipfile.ZipFile(target, "w", allowZip64=False) as z:
            warnings.simplefilter("ignore", UserWarning)
            for name, mode, extra in entries or [("Ghostget.app/", stat.S_IFDIR | 0o755, b""), ("Ghostget.app/file", stat.S_IFREG | 0o644, b"")]:
                info = zipfile.ZipInfo(name); info.create_system = 3; info.external_attr = mode << 16
                if name.endswith("/"): info.external_attr |= 0x10
                info.extra = extra
                z.writestr(info, b"" if name.endswith("/") else b"value")
        return target
    def test_roundtrip_no_code_runs_and_modes_survive(self):
        app = self.root / "Ghostget.app"; app.mkdir(); (app / "Contents").mkdir()
        payload = app / "Contents" / "executable"; payload.write_bytes(b"this is never executed"); payload.chmod(0o755)
        archive = self.root / "app.zip"; a.pack(app, archive)
        out = self.root / "out"; out.mkdir(); a.extract(archive, out)
        self.assertEqual((out / "Ghostget.app/Contents/executable").read_bytes(), payload.read_bytes())
        self.assertEqual((out / "Ghostget.app/Contents/executable").stat().st_mode & 0o777, 0o755)
    def test_unsigned_modes_normalize_before_signing_without_changing_source_or_executable_intent(self):
        app = self.root / "Ghostget.app"; app.mkdir(); app.chmod(0o777)
        source_modes = [0o600, 0o644, 0o666, 0o700, 0o744, 0o755, 0o777, 0o604, 0o641]
        for mode in source_modes:
            path = app / oct(mode); path.write_bytes(b"exact payload"); path.chmod(mode)
        archive = self.root / "normalized.zip"; a.pack(app, archive)
        out = self.root / "out"; out.mkdir()
        previous = os.umask(0o077)
        try: a.extract(archive, out)
        finally: os.umask(previous)
        self.assertEqual(stat.S_IMODE((out / "Ghostget.app").stat().st_mode), 0o755)
        self.assertEqual(stat.S_IMODE(app.stat().st_mode), 0o777)
        for mode in source_modes:
            source = app / oct(mode); restored = out / "Ghostget.app" / oct(mode)
            actual = stat.S_IMODE(restored.stat().st_mode)
            with self.subTest(mode=oct(mode)):
                self.assertEqual(actual, 0o755 if mode & 0o111 else 0o644)
                self.assertEqual(bool(actual & 0o111), bool(mode & 0o111))
                self.assertEqual(actual & 0o022, 0)
                self.assertEqual(restored.read_bytes(), source.read_bytes())
                self.assertEqual(stat.S_IMODE(source.stat().st_mode), mode)
        for kind in ("file", "directory"):
            for special in (0o1000, 0o2000, 0o4000, 0o7000):
                path = app / "special"
                if kind == "directory": path.mkdir()
                else: path.write_bytes(b"not admitted")
                path.chmod(0o755 | special)
                with self.subTest(kind=kind, special=oct(special)), self.assertRaises(Exception):
                    a.pack(app, self.root / (kind + oct(special) + ".zip"))
                if kind == "directory": path.rmdir()
                else: path.unlink()

    def test_foreign_paths_links_permissions_extras_and_aliases_are_rejected(self):
        root = ("Ghostget.app/", stat.S_IFDIR | 0o755, b"")
        for name in ["../outside", "/absolute", "C:/drive", "Ghostget.app/../outside", "Ghostget.app/./file", "Ghostget.app//file", "Ghostget.app/evil\\path", "Ghostget.app/evil:fork", "Other.app/file", "Ghostget.app/control\n", "Ghostget.app/._file", "Ghostget.app/\x00tail", "Ghostget.app/e\u0301"]:
            with self.subTest(name=name), self.assertRaises(Exception): a.inspect(self.make([root, (name, stat.S_IFREG | 0o644, b"")]))
        for mode in [stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600, stat.S_IFCHR | 0o600, stat.S_IFREG | 0o4644]:
            with self.subTest(mode=mode), self.assertRaises(Exception): a.inspect(self.make([root, ("Ghostget.app/file", mode, b"")]))
        for extra in [b"\x01\x00\x00\x00", b"\x55\x54\x05\x00\x01\x00\x00\x00\x00", b"\x0d\x00\x00\x00"]:
            with self.subTest(extra=extra), self.assertRaises(Exception): a.inspect(self.make([root, ("Ghostget.app/file", stat.S_IFREG | 0o644, extra)]))
        for names in [("file", "file"), ("file", "FILE"), ("file", "file/child")]:
            with self.subTest(names=names), self.assertRaises(Exception): a.inspect(self.make([root] + [("Ghostget.app/" + n, stat.S_IFREG | 0o644, b"") for n in names]))
    def test_local_central_disagreement_crc_and_unbounded_zip_features_are_rejected(self):
        good = self.make().read_bytes()
        central = good.index(b"PK\x01\x02")
        mutations = [lambda b: b.__setitem__(slice(0, 4), b"BAD!"), lambda b: b.__setitem__(slice(-2, None), b"\x01\x00"),
                     lambda b: b.extend(b"tail"), lambda b: b.__setitem__(slice(-12, -10), b"\xff\xff"),
                     lambda b: b.__setitem__(slice(central + 42, central + 46), struct.pack("<I", 1)),
                     lambda b: b.__setitem__(slice(central + 24, central + 28), struct.pack("<I", a.MAX_FILE + 1)),
                     lambda b: b.__setitem__(slice(central + 8, central + 10), b"\x01\x00"),
                     lambda b: b.__setitem__(slice(central + 4, central + 6), b"\x14\x00"),
                     lambda b: b.__setitem__(slice(central + 16, central + 20), b"\x01\x00\x00\x00")]
        for i, mutate in enumerate(mutations):
            b = bytearray(good); mutate(b); p = self.root / "bad.zip"; p.write_bytes(b)
            with self.subTest(mutation=i), self.assertRaises(Exception): a.inspect(p)
        p = self.make(); p.write_bytes(p.read_bytes().replace(b"value", b"wrong", 1))
        with self.assertRaises(Exception): a.inspect(p)
    def test_unsigned_never_extracts_to_nonempty_destination_or_follows_links(self):
        p = self.make(); out = self.root / "out"; out.mkdir(); sentinel = out / "sentinel"; sentinel.write_text("keep")
        with self.assertRaises(Exception): a.extract(p, out)
        self.assertEqual(sentinel.read_text(), "keep")
        app = self.root / "Ghostget.app"; app.mkdir(); (app / "link").symlink_to(sentinel)
        with self.assertRaises(Exception): a.pack(app, self.root / "linked.zip")
        (app / "link").unlink(); os.link(sentinel, app / "hard")
        with self.assertRaises(Exception): a.pack(app, self.root / "hard.zip")
    def test_signed_appledouble_requires_an_exact_regular_companion(self):
        entries = [("Ghostget.app/", stat.S_IFDIR | 0o755, b""), ("Ghostget.app/file", stat.S_IFREG | 0o644, b""), ("__MACOSX/", stat.S_IFDIR | 0o755, b""), ("__MACOSX/Ghostget.app/", stat.S_IFDIR | 0o755, b""), ("__MACOSX/Ghostget.app/._file", stat.S_IFREG | 0o644, b"")]
        p = self.make(entries); self.assertEqual(len(a.inspect(p, True)), 5)
        with self.assertRaises(Exception): a.inspect(p)
        for name in ["__MACOSX/Ghostget.app/file", "__MACOSX/Ghostget.app/._absent", "__MACOSX/../outside", "__MACOSX/Other.app/._file"]:
            with self.subTest(name=name), self.assertRaises(Exception): a.inspect(self.make(entries[:-1] + [(name, stat.S_IFREG | 0o644, b"")]), True)
    @unittest.skipUnless(sys.platform == "darwin", "ditto metadata is macOS-only")
    def test_actual_ditto_metadata_passes_and_survives_checked_extraction(self):
        app = self.root / "Ghostget.app"; app.mkdir(); payload = app / "file"; payload.write_bytes(b"payload")
        subprocess.run(["/usr/bin/xattr", "-w", "com.apple.metadata:ghostgettest", "synthetic", str(payload)], check=True, timeout=30)
        archive = self.root / "signed-layout.zip"
        subprocess.run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(app), str(archive)], check=True, timeout=30)
        a.inspect(archive, True)
        out = self.root / "out"; out.mkdir()
        subprocess.run(["/usr/bin/ditto", "-x", "-k", str(archive), str(out)], check=True, timeout=30)
        self.assertEqual(subprocess.check_output(["/usr/bin/xattr", "-p", "com.apple.metadata:ghostgettest", str(out / "Ghostget.app/file")], timeout=30), b"synthetic\n")


if __name__ == "__main__": unittest.main()
