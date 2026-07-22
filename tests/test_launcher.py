from __future__ import annotations

import subprocess
import unittest
from unittest import mock

from scripts import launcher


class LauncherTest(unittest.TestCase):
    def test_wait_until_ready_succeeds_after_health_response(self):
        process = mock.Mock()
        process.poll.return_value = None
        response = mock.MagicMock()
        response.__enter__.return_value.status = 200
        with mock.patch.object(launcher.urllib.request, "urlopen", return_value=response):
            self.assertTrue(launcher.wait_until_ready(process))

    def test_wait_until_ready_stops_if_server_exits(self):
        process = mock.Mock()
        process.poll.return_value = 1
        self.assertFalse(launcher.wait_until_ready(process))

    def test_prepare_environment_reports_install_failure(self):
        with mock.patch.object(
            launcher,
            "prepare_environment",
            side_effect=subprocess.CalledProcessError(1, ["pip"]),
        ):
            self.assertEqual(launcher.main(), 1)


if __name__ == "__main__":
    unittest.main()
