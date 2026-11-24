#!/usr/bin/env python3
"""Print (never install) the crontab lines for the two wrappers, using this checkout's absolute paths.

    python3 scripts/setup_cron.py        # then paste the output into `crontab -e` on the server
"""
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = os.path.join(root, "scripts")
print(f"*/10 * * * * {s}/10min_update.sh >> {root}/logs/cron_10min.log 2>&1")
print(f"15 5 * * * {s}/daily_update.sh >> {root}/logs/cron_daily.log 2>&1")
