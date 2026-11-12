from app.domain.services.dataset_research import analyze


def test_chart_counts_and_sampling():
    rows = [{"id": f"train:{i}", "text": "বাংলা text", "label": "positive" if i % 2 else "negative", "split": "train" if i % 3 else "test"} for i in range(1601)]
    report, _ = analyze(rows, "sentiment")
    charts = report["visualization"]
    assert charts["total"] == 1601
    assert len(charts["points"]) == 1500
    assert sum(sum(v.values()) for v in charts["label_splits"].values()) == 1601
    assert all(p["characters"] == 10 and p["words"] == 2 for p in charts["points"])
    assert charts == analyze(list(reversed(rows)), "sentiment")[0]["visualization"]


def test_empty_charts():
    report, _ = analyze([], "sentiment")
    assert report["visualization"] == {"points": [], "total": 0, "label_splits": {}}
