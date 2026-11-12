"""add user avatar path

Revision ID: a71d9c2e4f10
Revises: e6820a6b84c3
Create Date: 2026-09-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a71d9c2e4f10"
down_revision: str | None = "e6820a6b84c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "avatar_path",
            sa.String(length=500),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column(
        "users",
        "avatar_path",
    )
