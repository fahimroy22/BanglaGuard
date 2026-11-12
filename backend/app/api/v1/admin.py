from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import require_admin
from app.db.models import User
from app.db.session import get_db_session
from app.domain.services.audit import AuditService
from app.domain.services.platform_policy import PlatformPolicy, load_policy, save_policy

router = APIRouter(prefix="/admin", tags=["Administration"])


@router.get("/policy", response_model=PlatformPolicy)
async def get_policy(actor: User = Depends(require_admin), session: AsyncSession = Depends(get_db_session)):
    return await load_policy(session)


@router.put("/policy", response_model=PlatformPolicy)
async def update_policy(payload: PlatformPolicy, request: Request, actor: User = Depends(require_admin), session: AsyncSession = Depends(get_db_session)):
    before = await load_policy(session)
    updated = await save_policy(session, payload)
    await AuditService(session).record(request=request, action="admin.policy_updated", user_id=actor.id, resource_type="platform_policy", details={"before": before.model_dump(), "after": updated.model_dump()})
    return updated
