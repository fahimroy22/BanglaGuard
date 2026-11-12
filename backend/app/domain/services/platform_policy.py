"""Persisted platform policy in a dedicated database table."""
import hashlib
import json
import uuid
from typing import Literal

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import column, select, table, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.redis import redis_client
from app.db.session import get_db_session

PERMISSIONS = {
    "research_view": ["researcher"],
    "dataset_upload": ["researcher"],
    "dataset_export": ["researcher"],
    "experiment_create": ["researcher"],
    "training_execute": ["researcher"],
    "model_register": ["researcher"],
    "prediction_run": ["researcher", "user"],
}
records = table("platform_policy_records", column("id"), column("name"), column("value"), column("updated_at"))


class SecurityPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    registration_enabled: bool = True
    approval_required: bool = False
    session_minutes: int = Field(default=settings.access_token_expire_minutes, ge=5, le=10080)
    failed_login_limit: int = Field(default=0, ge=0, le=20)
    lockout_minutes: int = Field(default=15, ge=1, le=1440)


class PlatformPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(default=0, ge=0)
    permissions: dict[str, list[Literal["researcher", "user"]]] = Field(default_factory=lambda: {k: list(v) for k, v in PERMISSIONS.items()})
    security: SecurityPolicy = Field(default_factory=SecurityPolicy)

    @model_validator(mode="after")
    def valid_permissions(self):
        if set(self.permissions) != set(PERMISSIONS):
            raise ValueError("All supported permission keys are required")
        for key, roles in self.permissions.items():
            if len(roles) != len(set(roles)):
                raise ValueError("Duplicate role")
            if key not in ("research_view", "prediction_run") and not set(roles).issubset(self.permissions["research_view"]):
                raise ValueError("Research actions require research view access for that role")
        return self


async def load_policy(session: AsyncSession) -> PlatformPolicy:
    rows = (await session.execute(select(records.c.name, records.c.value).where(records.c.name.like("platform_policy.%")))).all()
    defaults = PlatformPolicy().model_dump()
    for name, value in rows:
        key = name.removeprefix("platform_policy.")
        if key.startswith("permission."):
            defaults["permissions"][key.removeprefix("permission.")] = json.loads(value)
        elif key.startswith("security."):
            defaults["security"][key.removeprefix("security.")] = json.loads(value)
        elif key == "revision":
            defaults["revision"] = int(value)
    return PlatformPolicy.model_validate(defaults)


async def save_policy(session: AsyncSession, policy: PlatformPolicy) -> PlatformPolicy:
    await session.execute(text("SELECT pg_advisory_xact_lock(72310943)"))
    current = await load_policy(session)
    if policy.revision != current.revision:
        raise HTTPException(409, "Settings changed elsewhere. Reload before saving.")
    entries = {f"permission.{k}": v for k, v in policy.permissions.items()}
    entries.update({f"security.{k}": v for k, v in policy.security.model_dump().items()})
    entries["revision"] = current.revision + 1
    for key, value in entries.items():
        statement = insert(records).values(id=uuid.uuid4(), name=f"platform_policy.{key}", value=json.dumps(value))
        await session.execute(statement.on_conflict_do_update(index_elements=[records.c.name], set_={"value": statement.excluded.value, "updated_at": text("now()") }))
    return policy.model_copy(update={"revision": current.revision + 1})


def require_permission(permission: str):
    from app.api.dependencies import get_current_user

    async def check(user=Depends(get_current_user), session: AsyncSession = Depends(get_db_session)):
        if user.role.value == "admin":
            return user
        policy = await load_policy(session)
        if user.role.value not in policy.permissions[permission]:
            raise HTTPException(403, "Your role does not have permission for this action")
        return user
    return check


def login_key(email: str, ip: str) -> str:
    digest = hashlib.sha256(f"{email.strip().lower()}|{ip}".encode()).hexdigest()
    return f"banglaguard:login-failures:{digest}"


async def check_login_limit(key: str, policy: SecurityPolicy):
    if not policy.failed_login_limit:
        return
    try:
        count = int(await redis_client.get(key) or 0)
        ttl = await redis_client.ttl(key)
    except Exception as exc:
        raise HTTPException(503, "Login protection is temporarily unavailable") from exc
    if count >= policy.failed_login_limit:
        raise HTTPException(429, "Too many failed attempts. Try again after the lockout expires.", headers={"Retry-After": str(max(1, ttl))})


async def record_failed_login(key: str, policy: SecurityPolicy):
    if not policy.failed_login_limit:
        return
    try:
        await redis_client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, key, policy.lockout_minutes * 60)
    except Exception as exc:
        raise HTTPException(503, "Login protection is temporarily unavailable") from exc
