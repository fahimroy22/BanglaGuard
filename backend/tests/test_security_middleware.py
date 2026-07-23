from fastapi.testclient import (
    TestClient,
)

from app.main import app


client = TestClient(app)


def test_security_headers() -> None:
    response = client.get(
        "/api/v1/health/live"
    )

    assert response.status_code == 200

    assert (
        response.headers[
            "x-content-type-options"
        ]
        == "nosniff"
    )

    assert (
        response.headers[
            "x-frame-options"
        ]
        == "DENY"
    )

    assert (
        "x-request-id"
        in response.headers
    )