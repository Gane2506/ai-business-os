import unittest
from with_bitwarden_secrets import select_values


class SecretEnvironmentTests(unittest.TestCase):
    def test_malformed_inventory_blocks_launch(self):
        for rows in [{"secrets": []}, None, [None], ["unexpected"]]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                select_values(rows, ["AWS_ACCESS_KEY_ID"])

    def test_hostile_environment_keys_are_not_forwarded(self):
        result = select_values([
            {"key": "NODE_OPTIONS", "value": "--require attacker"},
            {"key": "PATH", "value": "/attacker"},
            {"key": "AWS_ACCESS_KEY_ID", "value": "test-key"},
        ], ["AWS_ACCESS_KEY_ID"])
        self.assertEqual(result, {"AWS_ACCESS_KEY_ID": "test-key"})

    def test_missing_key_blocks_launch(self):
        with self.assertRaises(ValueError):
            select_values([], ["AWS_SECRET_ACCESS_KEY"])

    def test_duplicate_key_is_not_arbitrarily_selected(self):
        with self.assertRaises(ValueError):
            select_values([
                {"key": "AWS_SECRET_ACCESS_KEY", "value": "first"},
                {"key": "AWS_SECRET_ACCESS_KEY", "value": "second"},
            ], ["AWS_SECRET_ACCESS_KEY"])

    def test_invalid_values_do_not_reach_process_environment(self):
        for value in ["", "secret\x00payload", None]:
            with self.assertRaises(ValueError):
                select_values([{"key": "AWS_SECRET_ACCESS_KEY", "value": value}], ["AWS_SECRET_ACCESS_KEY"])

    def test_unrelated_credentials_are_not_forwarded(self):
        self.assertEqual(select_values([
            {"key": "STRIPE_SECRET_KEY", "value": "unrelated"},
            {"key": "AWS_ACCESS_KEY_ID", "value": "required"},
        ], ["AWS_ACCESS_KEY_ID"]), {"AWS_ACCESS_KEY_ID": "required"})


if __name__ == "__main__":
    unittest.main()
