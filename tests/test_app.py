from __future__ import annotations

import io
import os
import unittest
from unittest import mock

import app as live_app


def make_test_pdf() -> bytes:
    """建立一頁、無外部依賴的最小測試 PDF。"""
    stream = b"BT /F1 24 Tf 72 720 Td (Live Caption Test) Tj ET"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
    ]

    document = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, content in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f"{number} 0 obj\n".encode())
        document.extend(content)
        document.extend(b"\nendobj\n")

    xref_offset = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    document.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        document.extend(f"{offset:010d} 00000 n \n".encode())
    document.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode()
    )
    return bytes(document)


class LiveCaptionAppTest(unittest.TestCase):
    def setUp(self):
        live_app.app.config.update(TESTING=True)
        self.client = live_app.app.test_client()
        with live_app._key_lock:
            live_app._session_api_key = ""

    def test_health_route(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_build_setup_uses_current_live_translate_shape(self):
        setup = live_app.build_setup("ja")["setup"]
        config = setup["generationConfig"]
        self.assertEqual(setup["model"], f"models/{live_app.MODEL}")
        self.assertEqual(config["translationConfig"]["targetLanguageCode"], "ja")
        self.assertIn("inputAudioTranscription", setup)
        self.assertIn("outputAudioTranscription", setup)

    def test_unknown_language_falls_back_to_english(self):
        config = live_app.build_setup("xx")["setup"]["generationConfig"]
        self.assertEqual(config["translationConfig"]["targetLanguageCode"], "en")

    def test_session_key_validation_and_status(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": ""}):
            missing = self.client.get("/api/config").get_json()
            self.assertFalse(missing["hasApiKey"])

            rejected = self.client.post("/api/config/key", json={"apiKey": "too-short"})
            self.assertEqual(rejected.status_code, 400)

            accepted = self.client.post("/api/config/key", json={"apiKey": "A" * 32})
            self.assertEqual(accepted.status_code, 200)
            status = self.client.get("/api/config").get_json()
            self.assertTrue(status["hasApiKey"])
            self.assertEqual(status["apiKeySource"], "session")

    def test_rejects_non_pdf_upload(self):
        response = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(b"not a pdf"), "slides.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_uploads_and_renders_pdf_page(self):
        response = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(make_test_pdf()), "sample.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        deck = response.get_json()
        self.assertEqual(deck["pageCount"], 1)

        page = self.client.get(f"/api/deck/{deck['deckId']}/page/1.png")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.mimetype, "image/png")
        self.assertTrue(page.data.startswith(b"\x89PNG"))
        page.close()


if __name__ == "__main__":
    unittest.main()
