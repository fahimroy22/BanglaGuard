"""add dataset exports table

Revision ID: 8f3c2a7d9b41
Revises: 30a455849f51
Create Date: 2026-08-01 00:56:00

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "8f3c2a7d9b41"

down_revision: Union[
    str,
    Sequence[str],
    None,
] = "30a455849f51"

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


dataset_export_task_enum = postgresql.ENUM(
    "HATE_SPEECH",
    "SENTIMENT",
    name="dataset_export_analysis_task",
    create_type=False,
)

dataset_export_format_enum = postgresql.ENUM(
    "CSV",
    "JSONL",
    name="dataset_export_format",
    create_type=False,
)

dataset_export_status_enum = postgresql.ENUM(
    "PENDING",
    "PROCESSING",
    "COMPLETED",
    "FAILED",
    name="dataset_export_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()

    dataset_export_task_enum.create(
        bind,
        checkfirst=True,
    )

    dataset_export_format_enum.create(
        bind,
        checkfirst=True,
    )

    dataset_export_status_enum.create(
        bind,
        checkfirst=True,
    )

    op.create_table(
        "dataset_exports",
        sa.Column(
            "id",
            sa.UUID(),
            nullable=False,
        ),
        sa.Column(
            "created_by_id",
            sa.UUID(),
            nullable=True,
        ),
        sa.Column(
            "dataset_version_id",
            sa.UUID(),
            nullable=True,
        ),
        sa.Column(
            "name",
            sa.String(length=150),
            nullable=False,
        ),
        sa.Column(
            "version",
            sa.String(length=50),
            nullable=False,
        ),
        sa.Column(
            "task",
            dataset_export_task_enum,
            nullable=False,
        ),
        sa.Column(
            "export_format",
            dataset_export_format_enum,
            nullable=False,
        ),
        sa.Column(
            "status",
            dataset_export_status_enum,
            nullable=False,
        ),
        sa.Column(
            "selected_records",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "exported_records",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "skipped_records",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "selected_feedback_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "artifact_path",
            sa.String(length=500),
            nullable=True,
        ),
        sa.Column(
            "manifest_path",
            sa.String(length=500),
            nullable=True,
        ),
        sa.Column(
            "checksum",
            sa.String(length=128),
            nullable=True,
        ),
        sa.Column(
            "configuration",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "error_message",
            sa.Text(),
            nullable=True,
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"],
            ["users.id"],
            name=op.f("fk_dataset_exports_created_by_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_version_id"],
            ["dataset_versions.id"],
            name=op.f("fk_dataset_exports_dataset_version_id_dataset_versions"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "id",
            name=op.f("pk_dataset_exports"),
        ),
    )

    op.create_index(
        op.f("ix_dataset_exports_created_by_id"),
        "dataset_exports",
        ["created_by_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_dataset_exports_dataset_version_id"),
        "dataset_exports",
        ["dataset_version_id"],
        unique=False,
    )

    op.create_index(
        op.f("ix_dataset_exports_status"),
        "dataset_exports",
        ["status"],
        unique=False,
    )

    op.create_index(
        op.f("ix_dataset_exports_created_at"),
        "dataset_exports",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index(
        op.f("ix_dataset_exports_created_at"),
        table_name="dataset_exports",
    )

    op.drop_index(
        op.f("ix_dataset_exports_status"),
        table_name="dataset_exports",
    )

    op.drop_index(
        op.f("ix_dataset_exports_dataset_version_id"),
        table_name="dataset_exports",
    )

    op.drop_index(
        op.f("ix_dataset_exports_created_by_id"),
        table_name="dataset_exports",
    )

    op.drop_table("dataset_exports")

    dataset_export_status_enum.drop(
        bind,
        checkfirst=True,
    )

    dataset_export_format_enum.drop(
        bind,
        checkfirst=True,
    )

    dataset_export_task_enum.drop(
        bind,
        checkfirst=True,
    )
