from __future__ import annotations

import io
import os
import unittest
from unittest import mock

import app as live_app


def make_test_pdf(page_count: int = 1) -> bytes:
    """建立無外部依賴的最小測試 PDF。"""
    stream = b"BT /F1 24 Tf 72 720 Td (Live Caption Test) Tj ET"
    first_page_object = 3
    font_object = first_page_object + page_count
    content_object = font_object + 1
    page_references = " ".join(
        f"{number} 0 R" for number in range(first_page_object, font_object)
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        f"<< /Type /Pages /Kids [{page_references}] /Count {page_count} >>".encode(),
        *[
            (
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                f"/Resources << /Font << /F1 {font_object} 0 R >> >> "
                f"/Contents {content_object} 0 R >>"
            ).encode()
            for _page in range(page_count)
        ],
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

    def tearDown(self):
        with live_app._deck_lock:
            live_app._reset_deck()
        live_app.app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

    def test_health_route(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_pages_have_security_headers(self):
        for route in ("/",):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])
            self.assertEqual(response.headers["X-Frame-Options"], "DENY")

    def test_stage_uses_clean_fullscreen_controls(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertIn("進入全螢幕簡報", html)
        self.assertIn('class="stage-edge-handle"', html)
        self.assertIn('id="fullscreenPrompt"', html)
        self.assertNotIn('class="stage-header"', html)
        self.assertNotIn('id="overlayToggle"', html)

    def test_rejects_cross_site_mutations_but_allows_local_origin(self):
        rejected = self.client.post(
            "/api/config/key",
            json={"apiKey": "A" * 32},
            headers={"Origin": "https://malicious.example"},
        )
        self.assertEqual(rejected.status_code, 403)

        allowed = self.client.post(
            "/api/config/key",
            json={"apiKey": "A" * 32},
            headers={"Origin": f"http://127.0.0.1:{live_app.PORT}"},
        )
        self.assertEqual(allowed.status_code, 200)

    def test_origin_helper_allows_cli_and_localhost_only(self):
        with live_app.app.test_request_context("/ws"):
            self.assertTrue(live_app._origin_is_allowed())
        with live_app.app.test_request_context(
            "/ws", headers={"Origin": f"http://localhost:{live_app.PORT}"}
        ):
            self.assertTrue(live_app._origin_is_allowed())
        with live_app.app.test_request_context(
            "/ws", headers={"Origin": "https://malicious.example"}
        ):
            self.assertFalse(live_app._origin_is_allowed())

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
            self.assertNotIn("A" * 32, accepted.get_data(as_text=True))
            self.assertNotIn("A" * 32, self.client.get("/api/config").get_data(as_text=True))

    def test_session_key_overrides_environment_and_clear_restores_it(self):
        with mock.patch.dict(os.environ, {"GEMINI_API_KEY": "E" * 32}):
            self.client.post("/api/config/key", json={"apiKey": "S" * 32})
            key, source = live_app._get_api_key()
            self.assertEqual((key, source), ("S" * 32, "session"))

            cleared = self.client.delete("/api/config/key").get_json()
            self.assertTrue(cleared["hasApiKey"])
            self.assertEqual(cleared["source"], "environment")
            key, source = live_app._get_api_key()
            self.assertEqual((key, source), ("E" * 32, "environment"))

    def test_friendly_gemini_errors(self):
        cases = {
            "429 RESOURCE_EXHAUSTED quota": "quota_exhausted",
            "403 PERMISSION_DENIED api key": "invalid_api_key",
            "1008 model not found": "model_unavailable",
            "socket disconnected": "connection_failed",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                code, message = live_app._friendly_gemini_error(RuntimeError(raw))
                self.assertEqual(code, expected)
                self.assertTrue(message)

    def test_rejects_non_pdf_upload(self):
        response = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(b"not a pdf"), "slides.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)

    def test_rejects_missing_corrupt_oversized_and_too_many_pages(self):
        missing = self.client.post("/api/deck", data={}, content_type="multipart/form-data")
        self.assertEqual(missing.status_code, 400)

        corrupt = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(b"%PDF-this-is-corrupt"), "broken.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(corrupt.status_code, 400)

        too_many = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(make_test_pdf(201)), "too-many.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(too_many.status_code, 400)
        self.assertIn("200", too_many.get_json()["message"])

        live_app.app.config["MAX_CONTENT_LENGTH"] = 256
        too_large = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(b"%PDF-" + b"0" * 512), "large.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(too_large.status_code, 413)

    def test_deck_rejects_stale_id_and_out_of_range_page(self):
        response = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(make_test_pdf()), "sample.pdf")},
            content_type="multipart/form-data",
        )
        deck_id = response.get_json()["deckId"]
        self.assertEqual(self.client.get("/api/deck/stale/page/1.png").status_code, 404)
        self.assertEqual(self.client.get(f"/api/deck/{deck_id}/page/0.png").status_code, 404)
        self.assertEqual(self.client.get(f"/api/deck/{deck_id}/page/2.png").status_code, 404)

    def test_uploads_and_renders_pdf_page(self):
        response = self.client.post(
            "/api/deck",
            data={"pdf": (io.BytesIO(make_test_pdf()), "sample.pdf")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        deck = response.get_json()
        self.assertEqual(deck["pageCount"], 1)
        self.assertEqual(deck["filename"], "sample.pdf")

        page = self.client.get(f"/api/deck/{deck['deckId']}/page/1.png")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(page.mimetype, "image/png")
        self.assertTrue(page.data.startswith(b"\x89PNG"))
        page.close()


if __name__ == "__main__":
    unittest.main()
