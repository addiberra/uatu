"""Verify evidence after the opt-in Playwright diagnostic lifecycle regression.

Run with the regression's report.json path. This checks retained artifacts,
including the deliberately failed test, rather than trusting a green exit code.
"""

import collections
import json
import pathlib
import sys
import zipfile


def specs(suite):
    yield from suite.get("specs", [])
    for child in suite.get("suites", []):
        yield from specs(child)


report = json.loads(pathlib.Path(sys.argv[1]).read_text())
cases = list(specs(report))
assert len(cases) == 2, "Expected the two lifecycle regression cases"
assert not report.get("errors"), "Runner-level error"
for case in cases:
    test, = case["tests"]
    result, = test["results"]
    failure = case["title"].endswith("controlled failure")
    assert test["expectedStatus"] == ("failed" if failure else "passed")
    assert result["status"] == test["expectedStatus"]
    errors = result.get("errors", [])
    if failure:
        assert len(errors) == 1
        assert "controlled diagnostic teardown failure" in errors[0]["message"]
        assert "intentional assertion" in errors[0]["message"]
    else:
        assert not errors
    attachments = {a["name"]: a for a in result["attachments"]}
    for label in ("configured", "webkit-1"):
        trace = pathlib.Path(attachments[f"{label}-trace"]["path"])
        counts = collections.Counter()
        with zipfile.ZipFile(trace) as archive:
            for name in archive.namelist():
                if name.endswith(".trace"):
                    for line in archive.read(name).decode().splitlines():
                        event = json.loads(line)
                        counts[event["type"]] += 1
                        if event["type"] == "context-options":
                            assert event["browserName"] == "chromium", "Regression uses Chromium explicitly"
        assert counts["context-options"] == 1, "Expected one recording per context"
        assert counts["frame-snapshot"] > 0, "No UI snapshots"
        assert counts["screencast-frame"] > 0, "No screenshot frames"
        layout = pathlib.Path(attachments[f"{label}-layout"]["path"])
        samples = [json.loads(line) for line in layout.read_text().splitlines()]
        assert samples and any(s["event"] == "click" for s in samples)
        assert any(s["event"] == "after-native-event" for s in samples)
        assert any(any(b["id"] == "chat-surface" for b in s["boxes"]) for s in samples)
        assert (trace.parent.parent / ("configured.png" if label == "configured" else "custom.png")).is_file()
        print(json.dumps({"case": "failure" if failure else "success", "context": label,
                          "snapshots": counts["frame-snapshot"], "frames": counts["screencast-frame"],
                          "layout_samples": len(samples)}))
