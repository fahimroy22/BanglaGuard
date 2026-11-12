"""Add reversible model archiving, separate from production status."""
from alembic import op
import sqlalchemy as sa
revision = "c31f82a9d001"
down_revision = "b92e1f740abc"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("model_versions", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.false()))

def downgrade():
    op.drop_column("model_versions", "is_archived")
