"""Add dedicated platform policy storage."""
from alembic import op
import sqlalchemy as sa
revision = "b92e1f740abc"
down_revision = "a71d9c2e4f10"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("platform_policy_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("value", sa.String(255), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )


def downgrade():
    op.drop_table("platform_policy_records")
