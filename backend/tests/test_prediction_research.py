import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from app.api.v1 import model_promotion as promotion, prediction_research as api
from app.domain.services.prediction_research import ResearchStore, parse_csv, csv_export


def test_suite_ownership_versions_and_immutable_runs(tmp_path):
    store = ResearchStore(tmp_path)
    suite = store.save('alice', {'name': 'Examples', 'cases': [{'text': 'ভালো'}]})
    run = store.save_run('alice', 'model', suite, {'passed': True})
    assert store.suites('bob') == []
    assert store.runs('bob') == []
    with pytest.raises(PermissionError):
        store.save('bob', suite['payload'], suite['id'], 1)
    store.save('alice', {'name': 'Updated', 'cases': []}, suite['id'], 1)
    with pytest.raises(ValueError):
        store.save('alice', suite['payload'], suite['id'], 1)
    assert ResearchStore(tmp_path).run(run['id'])['suite_snapshot']['name'] == 'Examples'
    assert len(store.suites('admin', admin=True)) == 1


@pytest.mark.parametrize('data', [b'text,text\na,b', b'text\n', b'text\na,b', b'text\n' + b'x\n'*51, b'\xff'])
def test_csv_rejects_invalid_or_oversized_batches(data):
    with pytest.raises(ValueError):
        parse_csv(data)


def test_csv_round_trip_and_formula_protection():
    columns, rows = parse_csv('\ufefftext\nভালো\n'.encode())
    assert rows[0]['text'] == 'ভালো'
    _, escaped = parse_csv(csv_export(columns, [{'text': '=1+1'}, {'text': '\tx'}, {'text': 'ভালো'}]))
    assert escaped == [{'text': "'=1+1"}, {'text': "'\tx"}, {'text': 'ভালো'}]


def test_regression_gate_checks_owner_suite_model_and_baseline(tmp_path, monkeypatch):
    monkeypatch.setenv('BANGLAGUARD_RESEARCH_ROOT', str(tmp_path))
    store = ResearchStore()
    candidate = SimpleNamespace(id=uuid.uuid4(), configuration={}, metrics={}, artifact_path='candidate', tokenizer_path=None)
    suite = store.save('alice', {'name': 'Important examples', 'cases': []})
    run = store.save_run('alice', candidate.id, suite, {'model_fingerprint': promotion.fingerprint(candidate), 'baseline_id': None, 'baseline_fingerprint': None, 'errors': 0, 'passed': True})
    assert promotion.require_regression(run['id'], candidate, None)['passed']
    with pytest.raises(HTTPException) as error:
        promotion.require_regression(run['id'], candidate, None, SimpleNamespace(id='bob', role='researcher'))
    assert error.value.status_code == 403
    candidate.metrics = {'accuracy': .9}
    with pytest.raises(HTTPException):
        promotion.require_regression(run['id'], candidate, None)
    candidate.metrics = {}
    with pytest.raises(HTTPException):
        promotion.require_regression(run['id'], candidate, candidate)
    store.save('alice', suite['payload'], suite['id'], 1)
    with pytest.raises(HTTPException):
        promotion.require_regression(run['id'], candidate, None)
    with pytest.raises(HTTPException):
        promotion.require_regression(None, candidate, None)


@pytest.mark.asyncio
async def test_users_cannot_select_candidate_models(monkeypatch):
    model = SimpleNamespace(is_archived=False, task='sentiment', status='draft')
    monkeypatch.setattr(api, 'ModelVersionRepository', lambda _: SimpleNamespace(get=AsyncMock(return_value=model)))
    with pytest.raises(HTTPException) as error:
        await api.selected_model(None, uuid.uuid4(), 'sentiment', SimpleNamespace(role='user'))
    assert error.value.status_code == 403
    assert await api.selected_model(None, uuid.uuid4(), 'sentiment', SimpleNamespace(role='researcher')) is model


def test_disabling_explanation_skips_attribution(monkeypatch):
    from app.ml import classical_model as ml
    from unittest.mock import Mock
    model = SimpleNamespace(predict=lambda _: ['negative'], predict_proba=lambda _: [[.9, .1]], named_steps={'classifier': SimpleNamespace(classes_=['negative', 'positive'])})
    monkeypatch.setattr(ml, 'load_classical_model', lambda _: model)
    explain = Mock(return_value={'features': []})
    monkeypatch.setattr(ml, 'explain_linear_features', explain)
    result = ml.predict_with_classical_model('unused', 'খারাপ', include_explanation=False)
    explain.assert_not_called()
    assert result.label == 'negative'
    assert result.explanation['runtime']['explanation_ms'] == 0
    ml.predict_with_classical_model('unused', 'খারাপ', include_explanation=True)
    explain.assert_called_once()
