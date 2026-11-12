"""add dataset export timestamp defaults

Revision ID: e6820a6b84c3
Revises: 8f3c2a7d9b41

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e6820a6b84c3"

down_revision: Union[
    str,
    Sequence[str],
    None,
] = "8f3c2a7d9b41"

branch_labels: Union[
    str,
    Sequence[str],
    None,
] = None

depends_on: Union[
    str,
    Sequence[str],
    None,
] = None


def upgrade() -> None:
    op.alter_column(
        "dataset_exports",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )

    op.alter_column(
        "dataset_exports",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


def downgrade() -> None:
    op.alter_column(
        "dataset_exports",
        "updated_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=None,
    )

    op.alter_column(
        "dataset_exports",
        "created_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=None,
    )
