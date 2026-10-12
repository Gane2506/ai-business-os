# Repository CI and deployment gate

The private `ai-business-os` repository is an integration root. It stores the source lock, audit records, deployment preparation, and cumulative component patches. The five upstream source checkouts and prepared component workspaces are recreated from the lock; they are excluded from this repository.

GitHub Actions runs on pushes and pull requests with read-only repository access. The first job validates JSON, source lock and patch metadata, and SHA-256 fingerprints; runs the Python Bitwarden environment tests; and installs the email test dependencies from the lockfile with lifecycle scripts disabled before running the offline Node tests. The second job recreates each pinned upstream checkout, verifies its commit, origin and license hashes, checks source evidence links, then applies every component listed in `config/component-patches.json` in an isolated workspace. A changed patch requires an updated manifest fingerprint. A changed source revision requires review and corresponding lock, audit, and patch updates.

Local equivalents:

```sh
python3 scripts/check_repository.py
python3 -m unittest discover -s scripts -p 'test_*.py'
npm --prefix deploy/email ci --ignore-scripts
npm --prefix deploy/email test
python3 scripts/checkout_sources.py
python3 scripts/check_sources.py
python3 scripts/check_evidence.py
python3 scripts/prepare_component.py ringee-app
```

CI uses no repository secrets and does not deploy, provision cloud resources, or send email. Continuous deployment is pending production release selection, deployment manifests, runtime inputs, destination details, and explicit rollout approval. Keep that as a manual, reviewable gate rather than attaching a live deployment to a push.
